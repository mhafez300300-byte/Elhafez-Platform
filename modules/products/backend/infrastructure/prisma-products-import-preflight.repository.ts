import { Injectable } from '@nestjs/common';
import { PrismaService } from '@elhafez/database';
import { normalizeBarcode, normalizeSearchText } from '../domain/product';
import type { CentralImportRow, CompanyImportRow, ImportIngredientRow } from '../application/products.repository';
import type { ImportPreflightResult, ImportPreflightRow, ProductsImportPreflightRepository } from '../application/products-import-preflight.repository';

@Injectable()
export class PrismaProductsImportPreflightRepository implements ProductsImportPreflightRepository {
  constructor(private readonly prisma: PrismaService) {}

  async company(
    companyId: string,
    mode: 'CREATE_ONLY' | 'UPSERT_PRODUCT_CODE' | 'UPSERT_BARCODE',
    rows: CompanyImportRow[],
  ): Promise<ImportPreflightResult> {
    const prepared = rows.map((row) => ({
      row,
      normalizedName: normalizeSearchText(row.displayName),
      code: row.productCode?.trim() || null,
      barcode: barcodeOrNull(row.barcode),
      regulatoryId: row.regulatoryId?.trim().toLocaleUpperCase('en-US') || null,
    }));
    const codes = unique(prepared.map((item) => item.code));
    const barcodes = unique(prepared.map((item) => item.barcode));
    const regulatoryIds = unique(prepared.map((item) => item.regulatoryId));
    const names = unique(prepared.map((item) => item.normalizedName));
    const existing = await this.prisma.product.findMany({
      where: {
        companyId,
        OR: [
          ...(codes.length ? [{ productCode: { in: codes } }] : []),
          ...(regulatoryIds.length ? [{ regulatoryId: { in: regulatoryIds } }] : []),
          ...(names.length ? [{ normalizedName: { in: names } }] : []),
          ...(barcodes.length ? [{ barcodes: { some: { value: { in: barcodes }, active: true } } }] : []),
        ],
      },
      include: { barcodes: { where: { active: true } }, manufacturer: true },
    });
    const codeMap = new Map(existing.map((product) => [product.productCode, product]));
    const regMap = new Map(existing.filter((product) => product.regulatoryId).map((product) => [product.regulatoryId!, product]));
    const barcodeMap = new Map(existing.flatMap((product) => product.barcodes.map((barcode) => [barcode.value, product] as const)));
    const nameMap = new Map<string, typeof existing>();
    for (const product of existing) {
      const bucket = nameMap.get(product.normalizedName) ?? [];
      bucket.push(product);
      nameMap.set(product.normalizedName, bucket);
    }
    const duplicateCodes = duplicates(codesFromRows(prepared));
    const duplicateBarcodes = duplicates(barcodesFromRows(prepared));
    const duplicateRegs = duplicates(regsFromRows(prepared));

    const out: ImportPreflightRow[] = prepared.map(({ row, normalizedName, code, barcode, regulatoryId }) => {
      const reasons: string[] = [];
      let rejected = false;
      if (!row.displayName.trim()) { reasons.push('Display name is required'); rejected = true; }
      if (row.productType !== 'DRUG' && row.productType !== 'NON_DRUG') { reasons.push('Product type is invalid'); rejected = true; }
      if (row.barcode && !barcode) { reasons.push('Barcode is invalid'); rejected = true; }
      if (row.referencePrice && !validDecimal(row.referencePrice, 4)) { reasons.push('Reference price is invalid'); rejected = true; }
      const ingredientIssues = validateIngredients(row);
      if (ingredientIssues.length) { reasons.push(...ingredientIssues); rejected = true; }
      if (row.productType === 'NON_DRUG' && ingredientList(row).length) { reasons.push('Non-drug row cannot contain active ingredients'); rejected = true; }
      if (code && duplicateCodes.has(code)) { reasons.push('Product code is duplicated inside this import chunk'); rejected = true; }
      if (barcode && duplicateBarcodes.has(barcode)) { reasons.push('Barcode is duplicated inside this import chunk'); rejected = true; }
      if (regulatoryId && duplicateRegs.has(regulatoryId)) { reasons.push('Regulatory ID is duplicated inside this import chunk'); rejected = true; }

      const byCode = code ? codeMap.get(code) : undefined;
      const byBarcode = barcode ? barcodeMap.get(barcode) : undefined;
      const byReg = regulatoryId ? regMap.get(regulatoryId) : undefined;
      const target = mode === 'UPSERT_PRODUCT_CODE' ? byCode : mode === 'UPSERT_BARCODE' ? byBarcode : undefined;
      if (mode === 'CREATE_ONLY' && byCode) { reasons.push('Product code already exists'); rejected = true; }
      if (mode === 'CREATE_ONLY' && byBarcode) { reasons.push('Barcode already belongs to an existing product'); rejected = true; }
      if (mode === 'UPSERT_PRODUCT_CODE' && byBarcode && (!target || byBarcode.id !== target.id)) { reasons.push('Barcode belongs to another product'); rejected = true; }
      if (mode === 'UPSERT_BARCODE' && byCode && (!target || byCode.id !== target.id)) { reasons.push('Product code belongs to another product'); rejected = true; }
      if (byReg && (!target || byReg.id !== target.id)) { reasons.push('Regulatory ID belongs to another product'); rejected = true; }
      if (!rejected) {
        const similar = nameMap.get(normalizedName) ?? [];
        if (similar.some((product) => !target || product.id !== target.id)) reasons.push('Likely duplicate name exists; review manufacturer/strength before execution');
        if (row.productType === 'DRUG' && ingredientList(row).length === 0) reasons.push('Drug has no ingredient in import row; it will remain a draft until completed');
      }
      return { row: row.row, status: rejected ? 'REJECT' : reasons.length ? 'WARNING' : 'ACCEPT', reasons };
    });
    return summarize(out);
  }

  async central(sourceId: string, rows: CentralImportRow[]): Promise<ImportPreflightResult> {
    const source = await this.prisma.centralDrugSource.findFirst({ where: { id: sourceId, active: true } });
    if (!source) return summarize(rows.map((row) => ({ row: row.row, status: 'REJECT' as const, reasons: ['Central source is missing or inactive'] })));
    const prepared = rows.map((row) => ({
      row,
      barcode: barcodeOrNull(row.barcode),
      regulatoryId: row.regulatoryId?.trim() || null,
      sourceRecordKey: row.sourceRecordKey.trim(),
    }));
    const barcodes = unique(prepared.map((item) => item.barcode));
    const regulatoryIds = unique(prepared.map((item) => item.regulatoryId));
    const existingBySource = await this.prisma.centralDrugReference.findMany({
      where: { sourceId, sourceRecordKey: { in: prepared.map((item) => item.sourceRecordKey) } },
      select: { id: true, sourceRecordKey: true },
    });
    const sourceMap = new Map(existingBySource.map((item) => [item.sourceRecordKey, item.id]));
    const regConflicts = regulatoryIds.length ? await this.prisma.centralDrugReference.findMany({ where: { regulatoryId: { in: regulatoryIds } }, select: { id: true, regulatoryId: true } }) : [];
    const barcodeConflicts = barcodes.length ? await this.prisma.centralDrugBarcode.findMany({ where: { value: { in: barcodes } }, select: { value: true, centralDrugId: true } }) : [];
    const regMap = new Map(regConflicts.filter((item) => item.regulatoryId).map((item) => [item.regulatoryId!, item.id]));
    const barcodeMap = new Map(barcodeConflicts.map((item) => [item.value, item.centralDrugId]));
    const duplicateBarcodes = duplicates(barcodesFromRows(prepared));
    const duplicateRegs = duplicates(regsFromRows(prepared));
    const duplicateSourceKeys = duplicates(prepared.map((item) => item.sourceRecordKey));
    const out: ImportPreflightRow[] = prepared.map(({ row, barcode, regulatoryId, sourceRecordKey }) => {
      const reasons: string[] = [];
      let rejected = false;
      if (!sourceRecordKey || !row.canonicalName.trim()) { reasons.push('sourceRecordKey and canonicalName are required'); rejected = true; }
      if (row.barcode && !barcode) { reasons.push('Barcode is invalid'); rejected = true; }
      if (row.referencePrice && !validDecimal(row.referencePrice, 4)) { reasons.push('Reference price is invalid'); rejected = true; }
      const ingredientIssues = validateIngredients(row);
      if (ingredientIssues.length) { reasons.push(...ingredientIssues); rejected = true; }
      if (duplicateSourceKeys.has(sourceRecordKey)) { reasons.push('sourceRecordKey is duplicated inside this chunk'); rejected = true; }
      if (barcode && duplicateBarcodes.has(barcode)) reasons.push('Barcode is claimed by multiple incoming source rows and will require quarantine review');
      if (regulatoryId && duplicateRegs.has(regulatoryId)) reasons.push('Regulatory ID is claimed by multiple incoming source rows and will require quarantine review');
      const existingId = sourceMap.get(sourceRecordKey);
      if (barcode && barcodeMap.has(barcode) && barcodeMap.get(barcode) !== existingId) reasons.push('Barcode conflicts with another central reference; row will be quarantined');
      if (regulatoryId && regMap.has(regulatoryId) && regMap.get(regulatoryId) !== existingId) reasons.push('Regulatory ID conflicts with another central reference; row will be quarantined');
      return { row: row.row, status: rejected ? 'REJECT' : reasons.length ? 'WARNING' : 'ACCEPT', reasons };
    });
    return summarize(out);
  }
}

function ingredientList(row: Pick<CompanyImportRow | CentralImportRow, 'ingredients' | 'ingredientName' | 'strengthValue' | 'strengthUnit'>): ImportIngredientRow[] {
  if (row.ingredients?.length) return row.ingredients;
  return row.ingredientName ? [{ name: row.ingredientName, strengthValue: row.strengthValue, strengthUnit: row.strengthUnit }] : [];
}
function validateIngredients(row: Pick<CompanyImportRow | CentralImportRow, 'ingredients' | 'ingredientName' | 'strengthValue' | 'strengthUnit'>): string[] {
  const ingredients = ingredientList(row);
  const issues: string[] = [];
  const names = new Set<string>();
  ingredients.forEach((ingredient, index) => {
    const name = ingredient.name?.trim();
    if (!name) issues.push(`Ingredient ${index + 1} name is required`);
    else {
      const normalized = normalizeSearchText(name);
      if (names.has(normalized)) issues.push(`Ingredient ${index + 1} duplicates another active ingredient in the row`);
      names.add(normalized);
    }
    if (ingredient.strengthValue && !validDecimal(ingredient.strengthValue, 6)) issues.push(`Ingredient ${index + 1} strength is invalid`);
    if (ingredient.strengthUnit && ingredient.strengthUnit.trim().length > 40) issues.push(`Ingredient ${index + 1} strength unit is too long`);
  });
  return issues;
}
function validDecimal(value: string, scale: number) { return new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`).test(value.trim()) && Number(value) >= 0; }
function barcodeOrNull(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try { return normalizeBarcode(value); } catch { return null; }
}
function unique(values: Array<string | null>) { return [...new Set(values.filter((value): value is string => Boolean(value)))]; }
function duplicates(values: string[]) { const seen = new Set<string>(); const duplicate = new Set<string>(); for (const value of values) { if (seen.has(value)) duplicate.add(value); else seen.add(value); } return duplicate; }
function codesFromRows(rows: Array<{ code: string | null }>) { return rows.map((item) => item.code).filter((value): value is string => Boolean(value)); }
function barcodesFromRows(rows: Array<{ barcode: string | null }>) { return rows.map((item) => item.barcode).filter((value): value is string => Boolean(value)); }
function regsFromRows(rows: Array<{ regulatoryId: string | null }>) { return rows.map((item) => item.regulatoryId).filter((value): value is string => Boolean(value)); }
function summarize(rows: ImportPreflightRow[]): ImportPreflightResult { return { accepted: rows.filter((row) => row.status === 'ACCEPT').length, warnings: rows.filter((row) => row.status === 'WARNING').length, rejected: rows.filter((row) => row.status === 'REJECT').length, rows }; }
