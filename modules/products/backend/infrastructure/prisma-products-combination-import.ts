import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '@elhafez/database';
import { cleanText, normalizeBarcode, normalizeSearchText } from '../domain/product';
import {
  ProductClassificationError,
  ProductPersistenceConflictError,
  type CentralImportContext,
  type CentralImportRow,
  type CompanyImportRow,
  type ImportIngredientRow,
} from '../application/products.repository';

type Tx = Prisma.TransactionClient;

export interface CompanyCombinationImportResult {
  status: 'ACCEPTED' | 'UPDATED';
  companyId: string;
  productId: string;
}

export interface CentralCombinationImportResult {
  status: 'ACCEPTED' | 'UPDATED' | 'QUARANTINED';
  centralDrugId: string;
  reason?: string;
}

export function importIngredients(row: Pick<CompanyImportRow | CentralImportRow, 'ingredientName' | 'strengthValue' | 'strengthUnit' | 'ingredients'>): ImportIngredientRow[] {
  const supplied = row.ingredients?.length
    ? row.ingredients
    : row.ingredientName
      ? [{ name: row.ingredientName, strengthValue: row.strengthValue, strengthUnit: row.strengthUnit }]
      : [];
  const normalized = supplied.map((ingredient) => {
    const name = cleanText(ingredient.name, 180);
    if (!name) throw new ProductClassificationError('Ingredient name is required');
    return {
      name,
      strengthValue: optional(ingredient.strengthValue),
      strengthUnit: optional(ingredient.strengthUnit),
    };
  });
  const keys = normalized.map((ingredient) => normalizeSearchText(ingredient.name));
  if (new Set(keys).size !== keys.length) {
    throw new ProductClassificationError('Duplicate active ingredient in the same import row');
  }
  return normalized;
}

export async function importCompanyCombinationRow(
  db: PrismaService,
  sessionId: string,
  mode: string,
  row: CompanyImportRow,
): Promise<CompanyCombinationImportResult> {
  const ingredients = importIngredients(row);
  if (row.productType === 'NON_DRUG' && ingredients.length) {
    throw new ProductClassificationError('Non-drug import row cannot contain active ingredients');
  }
  return db.$transaction(async (tx) => {
    const session = await tx.productImportSession.findUnique({ where: { id: sessionId } });
    if (!session || session.kind !== 'COMPANY' || !session.companyId) {
      throw new ProductClassificationError('Company import session is invalid');
    }
    const companyId = session.companyId;
    const replayKey = `${sessionId}:${row.row}`;
    const replay = await tx.product.findFirst({ where: { companyId, createRequestKey: replayKey }, select: { id: true } });
    if (replay) return { status: 'ACCEPTED', companyId, productId: replay.id };

    let existingId: string | null = null;
    const productCode = optional(row.productCode);
    const barcode = row.barcode ? normalizeBarcode(row.barcode) : null;
    if (mode === 'UPSERT_PRODUCT_CODE' && productCode) {
      existingId = (await tx.product.findFirst({ where: { companyId, productCode }, select: { id: true } }))?.id ?? null;
    }
    if (mode === 'UPSERT_BARCODE' && barcode) {
      existingId = (await tx.productBarcode.findFirst({ where: { companyId, value: barcode }, select: { productId: true } }))?.productId ?? null;
    }

    const displayName = cleanText(row.displayName, 200);
    if (!displayName) throw new ProductClassificationError('Product display name is required');
    const manufacturerId = row.manufacturerName ? (await upsertMaster(tx, 'manufacturer', companyId, row.manufacturerName)).id : undefined;
    const categoryId = row.categoryName ? (await upsertMaster(tx, 'category', companyId, row.categoryName)).id : undefined;
    const dosageFormId = row.dosageFormName ? (await upsertMaster(tx, 'dosageForm', companyId, row.dosageFormName)).id : undefined;
    const routeId = row.routeName ? (await upsertMaster(tx, 'route', companyId, row.routeName)).id : undefined;
    const ingredientAssignments: Array<{ ingredientId: string; strengthValue: Prisma.Decimal | null; strengthUnit: string | null; sortOrder: number }> = [];
    for (let index = 0; index < ingredients.length; index += 1) {
      const ingredient = ingredients[index]!;
      const master = await upsertMaster(tx, 'ingredient', companyId, ingredient.name);
      ingredientAssignments.push({
        ingredientId: master.id,
        strengthValue: decimal(ingredient.strengthValue, 'Ingredient strength'),
        strengthUnit: optional(ingredient.strengthUnit) ?? null,
        sortOrder: index,
      });
    }

    if (existingId) {
      const current = await tx.product.findFirst({ where: { id: existingId, companyId }, select: { id: true, status: true } });
      if (!current) throw new ProductClassificationError('Import target is outside the authorized company');
      const data: Prisma.ProductUncheckedUpdateManyInput = {
        productType: row.productType,
        displayName,
        normalizedName: normalizeSearchText(displayName),
        version: { increment: 1 },
      };
      assignText(data, 'arabicName', 'normalizedArabicName', row.arabicName, 200);
      assignText(data, 'englishName', 'normalizedEnglishName', row.englishName, 200);
      assignText(data, 'tradeName', 'normalizedTradeName', row.tradeName, 200);
      if (manufacturerId) data.manufacturerId = manufacturerId;
      if (categoryId) data.categoryId = categoryId;
      if (dosageFormId) data.dosageFormId = dosageFormId;
      if (routeId) data.routeId = routeId;
      if (row.regulatoryId !== undefined && row.regulatoryId !== null && row.regulatoryId.trim()) data.regulatoryId = row.regulatoryId.trim().toUpperCase();
      if (row.atcCode !== undefined && row.atcCode !== null && row.atcCode.trim()) data.atcCode = row.atcCode.trim().toUpperCase();
      if (row.prescriptionClass !== undefined) data.prescriptionClass = optional(row.prescriptionClass)?.toUpperCase() ?? null;
      if (row.controlled !== undefined) data.controlled = row.controlled;
      if (row.coldChain !== undefined) data.coldChain = row.coldChain;
      if (row.marketStatus !== undefined) data.marketStatus = row.marketStatus;
      if (row.referencePrice !== undefined && row.referencePrice !== null && row.referencePrice.trim()) data.referencePrice = decimal(row.referencePrice, 'Reference price');
      if (row.referencePriceSource !== undefined) data.referencePriceSource = optional(row.referencePriceSource) ?? null;
      if (row.notes !== undefined) data.notes = optional(row.notes) ?? null;
      await tx.product.updateMany({ where: { id: existingId, companyId }, data });
      await tx.productIngredientAssignment.deleteMany({ where: { productId: existingId } });
      if (ingredientAssignments.length) {
        await tx.productIngredientAssignment.createMany({ data: ingredientAssignments.map((ingredient) => ({ productId: existingId!, ...ingredient })) });
      }
      await upsertImportPackaging(tx, companyId, existingId, row, barcode);
      if (current.status === 'ACTIVE' && row.productType === 'DRUG' && ingredientAssignments.length === 0) {
        throw new ProductClassificationError('Active drug import update requires at least one active ingredient');
      }
      return { status: 'UPDATED', companyId, productId: existingId };
    }

    const id = randomUUID();
    const createCode = productCode ?? `PRD-${id.replaceAll('-', '').slice(0, 10).toUpperCase()}`;
    await tx.product.create({
      data: {
        id,
        companyId,
        productCode: createCode,
        createRequestKey: replayKey,
        productType: row.productType,
        displayName,
        normalizedName: normalizeSearchText(displayName),
        arabicName: optional(row.arabicName) ?? null,
        normalizedArabicName: normalizedOptional(row.arabicName),
        englishName: optional(row.englishName) ?? null,
        normalizedEnglishName: normalizedOptional(row.englishName),
        tradeName: optional(row.tradeName) ?? null,
        normalizedTradeName: normalizedOptional(row.tradeName),
        manufacturerId: manufacturerId ?? null,
        categoryId: categoryId ?? null,
        dosageFormId: dosageFormId ?? null,
        routeId: routeId ?? null,
        regulatoryId: optional(row.regulatoryId)?.toUpperCase() ?? null,
        atcCode: optional(row.atcCode)?.toUpperCase() ?? null,
        prescriptionClass: optional(row.prescriptionClass)?.toUpperCase() ?? null,
        controlled: row.controlled ?? false,
        coldChain: row.coldChain ?? false,
        marketStatus: row.marketStatus ?? 'UNKNOWN',
        referencePrice: row.referencePrice ? decimal(row.referencePrice, 'Reference price') : null,
        referencePriceSource: optional(row.referencePriceSource) ?? null,
        notes: optional(row.notes) ?? null,
        status: 'DRAFT',
      },
    });
    if (ingredientAssignments.length) {
      await tx.productIngredientAssignment.createMany({ data: ingredientAssignments.map((ingredient) => ({ productId: id, ...ingredient })) });
    }
    await upsertImportPackaging(tx, companyId, id, row, barcode);
    return { status: 'ACCEPTED', companyId, productId: id };
  });
}

export async function importCentralCombinationRow(
  db: PrismaService,
  context: CentralImportContext,
  row: CentralImportRow,
): Promise<CentralCombinationImportResult> {
  const ingredients = importIngredients(row);
  return db.$transaction(async (tx) => {
    const source = await tx.centralDrugSource.findFirst({ where: { id: context.sourceId, active: true } });
    if (!source) throw new ProductClassificationError('Central source is inactive or missing');
    const dataset = await tx.centralDrugDataset.upsert({
      where: { sourceId_datasetKey: { sourceId: context.sourceId, datasetKey: context.datasetKey } },
      create: { sourceId: context.sourceId, datasetKey: context.datasetKey, publishedAt: context.publishedAt, createdBy: context.actorId },
      update: { publishedAt: context.publishedAt, status: 'ACTIVE' },
    });
    const existing = await tx.centralDrugReference.findUnique({
      where: { sourceId_sourceRecordKey: { sourceId: context.sourceId, sourceRecordKey: row.sourceRecordKey } },
      include: { ingredients: true, barcodes: true },
    });
    const regulatoryConflict = row.regulatoryId
      ? await tx.centralDrugReference.findFirst({ where: { regulatoryId: row.regulatoryId, id: { not: existing?.id } }, select: { id: true } })
      : null;
    const barcodeValue = row.barcode ? normalizeBarcode(row.barcode) : null;
    const barcodeConflict = barcodeValue
      ? await tx.centralDrugBarcode.findFirst({ where: { value: barcodeValue, centralDrugId: { not: existing?.id } }, select: { id: true } })
      : null;
    const reason = [regulatoryConflict ? 'REGULATORY_ID_CONFLICT' : null, barcodeConflict ? 'BARCODE_CONFLICT' : null].filter(Boolean).join(', ') || null;
    const canonicalName = cleanText(row.canonicalName, 220);
    if (!canonicalName) throw new ProductClassificationError('Central canonical name is required');
    const scalar = {
      datasetId: dataset.id,
      canonicalName,
      normalizedName: normalizeSearchText(canonicalName),
      arabicName: optional(row.arabicName) ?? null,
      normalizedArabicName: normalizedOptional(row.arabicName),
      englishName: optional(row.englishName) ?? null,
      normalizedEnglishName: normalizedOptional(row.englishName),
      tradeName: optional(row.tradeName) ?? null,
      normalizedTradeName: normalizedOptional(row.tradeName),
      manufacturerName: optional(row.manufacturerName) ?? null,
      dosageForm: optional(row.dosageForm) ?? null,
      route: optional(row.route) ?? null,
      regulatoryId: regulatoryConflict ? null : optional(row.regulatoryId),
      atcCode: optional(row.atcCode),
      prescriptionClass: optional(row.prescriptionClass),
      controlled: row.controlled ?? false,
      packageDescription: optional(row.packageDescription) ?? null,
      baseUnitLabel: optional(row.baseUnitLabel) ?? null,
      packageUnitLabel: optional(row.packageUnitLabel) ?? null,
      conversionFactor: row.conversionFactor ? decimal(row.conversionFactor, 'Conversion factor') : null,
      referencePrice: row.referencePrice ? decimal(row.referencePrice, 'Reference price') : null,
      marketStatus: row.marketStatus ?? 'UNKNOWN',
      sourceEffectiveDate: row.sourceEffectiveDate ?? null,
      lastVerifiedAt: row.lastVerifiedAt ?? new Date(),
      status: reason ? 'QUARANTINED' : 'ACTIVE',
      quarantineReason: reason,
      sourcePayload: (row.sourcePayload ?? {}) as Prisma.InputJsonValue,
    } satisfies Prisma.CentralDrugReferenceUncheckedUpdateInput;

    let centralId: string;
    if (existing) {
      await tx.centralDrugReference.update({ where: { id: existing.id }, data: { ...scalar, version: { increment: 1 } } });
      centralId = existing.id;
      await tx.centralDrugIngredient.deleteMany({ where: { centralDrugId: centralId } });
      await tx.centralDrugBarcode.deleteMany({ where: { centralDrugId: centralId } });
    } else {
      const created = await tx.centralDrugReference.create({
        data: { sourceId: context.sourceId, sourceRecordKey: row.sourceRecordKey, ...scalar, version: 1 },
      });
      centralId = created.id;
    }
    for (let index = 0; index < ingredients.length; index += 1) {
      const ingredient = ingredients[index]!;
      await tx.centralDrugIngredient.create({
        data: {
          centralDrugId: centralId,
          name: ingredient.name,
          normalizedName: normalizeSearchText(ingredient.name),
          strengthValue: decimal(ingredient.strengthValue, 'Ingredient strength'),
          strengthUnit: optional(ingredient.strengthUnit) ?? null,
          sortOrder: index,
        },
      });
    }
    if (barcodeValue && !barcodeConflict) {
      await tx.centralDrugBarcode.create({ data: { centralDrugId: centralId, value: barcodeValue, symbology: optional(row.barcodeSymbology) ?? null } });
    }
    return {
      status: reason ? 'QUARANTINED' : existing ? 'UPDATED' : 'ACCEPTED',
      centralDrugId: centralId,
      ...(reason ? { reason } : {}),
    };
  });
}

async function upsertMaster(
  tx: Tx,
  kind: 'manufacturer' | 'category' | 'dosageForm' | 'route' | 'ingredient',
  companyId: string,
  rawName: string,
): Promise<{ id: string }> {
  const max = kind === 'manufacturer' || kind === 'ingredient' ? 180 : 120;
  const name = cleanText(rawName, max);
  if (!name) throw new ProductClassificationError(`${kind} name is required`);
  const normalizedName = normalizeSearchText(name);
  switch (kind) {
    case 'manufacturer':
      return tx.productManufacturer.upsert({ where: { companyId_normalizedName: { companyId, normalizedName } }, create: { companyId, name, normalizedName }, update: { active: true }, select: { id: true } });
    case 'category':
      return tx.productCategory.upsert({ where: { companyId_normalizedName: { companyId, normalizedName } }, create: { companyId, name, normalizedName }, update: { active: true }, select: { id: true } });
    case 'dosageForm':
      return tx.productDosageForm.upsert({ where: { companyId_normalizedName: { companyId, normalizedName } }, create: { companyId, name, normalizedName }, update: { active: true }, select: { id: true } });
    case 'route':
      return tx.productRoute.upsert({ where: { companyId_normalizedName: { companyId, normalizedName } }, create: { companyId, name, normalizedName }, update: { active: true }, select: { id: true } });
    case 'ingredient':
      return tx.productIngredientMaster.upsert({ where: { companyId_normalizedName: { companyId, normalizedName } }, create: { companyId, name, normalizedName }, update: { active: true }, select: { id: true } });
  }
}

async function upsertImportPackaging(tx: Tx, companyId: string, productId: string, row: CompanyImportRow, barcode: string | null) {
  let base = await tx.productUnit.findFirst({ where: { productId, active: true, isBase: true } });
  const baseName = optional(row.baseUnitName);
  if (baseName) {
    if (base) base = await tx.productUnit.update({ where: { id: base.id }, data: { name: baseName, version: { increment: 1 } } });
    else base = await tx.productUnit.create({ data: { productId, name: baseName, conversionFactor: new Prisma.Decimal(1), isBase: true, defaultSale: true, defaultPurchase: !row.packageUnitName } });
  }
  let target = base;
  const packageName = optional(row.packageUnitName);
  if (packageName) {
    const factor = decimal(row.packageFactor ?? '1', 'Package conversion factor');
    if (!factor || factor.lessThanOrEqualTo(0)) throw new ProductClassificationError('Package conversion factor must be greater than zero');
    target = await tx.productUnit.findFirst({ where: { productId, name: packageName, active: true } })
      ?? await tx.productUnit.create({ data: { productId, name: packageName, conversionFactor: factor, defaultPurchase: true } });
  }
  if (barcode) {
    if (!target) throw new ProductClassificationError('Barcode import requires a base or package unit');
    const existing = await tx.productBarcode.findUnique({ where: { companyId_value: { companyId, value: barcode } } });
    if (existing && existing.productId !== productId) throw new ProductPersistenceConflictError('Barcode belongs to another product');
    if (existing) {
      await tx.productBarcode.update({ where: { id: existing.id }, data: { unitId: target.id, symbology: optional(row.barcodeSymbology) ?? existing.symbology, active: true, version: { increment: 1 } } });
    } else {
      await tx.productBarcode.create({ data: { companyId, productId, unitId: target.id, value: barcode, symbology: optional(row.barcodeSymbology) ?? null, source: 'import' } });
    }
  }
}

function decimal(value: string | null | undefined, label: string): Prisma.Decimal | null {
  const raw = optional(value);
  if (!raw) return null;
  if (!/^\d+(?:\.\d{1,6})?$/.test(raw)) throw new ProductClassificationError(`${label} must be a non-negative decimal`);
  return new Prisma.Decimal(raw);
}

function optional(value: string | null | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function normalizedOptional(value: string | null | undefined): string | null {
  const cleaned = optional(value);
  return cleaned ? normalizeSearchText(cleaned) : null;
}

function assignText(
  data: Prisma.ProductUncheckedUpdateManyInput,
  field: 'arabicName' | 'englishName' | 'tradeName',
  normalizedField: 'normalizedArabicName' | 'normalizedEnglishName' | 'normalizedTradeName',
  value: string | null | undefined,
  max: number,
) {
  if (value === undefined) return;
  const cleaned = cleanText(value, max);
  data[field] = cleaned;
  data[normalizedField] = cleaned ? normalizeSearchText(cleaned) : null;
}
