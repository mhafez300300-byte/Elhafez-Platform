import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@elhafez/database';
import type {
  CentralDrugReferenceView,
  CentralDrugSourceView,
  ProductCategoryView,
  ProductDetail,
  ProductIngredientView,
  ProductSummary,
  ProductUnitView,
  ProductBarcodeView,
} from '../../contracts';
import {
  assertStatusTransition,
  cleanText,
  normalizeBarcode,
  normalizeSearchText,
} from '../domain/product';
import {
  ProductClassificationError,
  ProductConcurrentUpdateError,
  ProductPersistenceConflictError,
  type CompanyImportRow,
  type ImportChunkClaim,
  type ImportChunkResult,
  type ProductListQuery,
  type ProductListResult,
} from '../application/products.repository';
import {
  type BulkExecutionResult,
  type BulkPreviewIssue,
  type BulkPreviewResult,
  type BulkProductPatch,
  type CentralDatasetView,
  type CentralGovernanceInput,
  type CentralReferenceAdminView,
  type ImportChunkState,
  type ImportSessionAdminView,
  type ProductsHardeningRepository,
} from '../application/products-hardening.repository';
import { PrismaProductsRepository } from './prisma-products.repository';

const includeProduct = {
  category: true,
  manufacturer: true,
  dosageForm: true,
  route: true,
  tags: { include: { tag: true }, orderBy: { createdAt: 'asc' } },
  ingredients: { include: { ingredient: true }, orderBy: { sortOrder: 'asc' } },
  units: { orderBy: [{ isBase: 'desc' }, { conversionFactor: 'asc' }, { createdAt: 'asc' }] },
  barcodes: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
} satisfies Prisma.ProductInclude;

const includeCentral = {
  ingredients: { orderBy: { sortOrder: 'asc' } },
  barcodes: { orderBy: { value: 'asc' } },
} satisfies Prisma.CentralDrugReferenceInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof includeProduct }>;
type CentralRow = Prisma.CentralDrugReferenceGetPayload<{ include: typeof includeCentral }>;
type Db = Prisma.TransactionClient | PrismaService;

const iso = (date: Date) => date.toISOString();

function mapCategory(row: { id:string; companyId:string; name:string; parentId:string|null; active:boolean; createdAt:Date; updatedAt:Date }): ProductCategoryView {
  return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}

function mapSimple<T extends { id:string; companyId:string; name:string; active:boolean; createdAt:Date; updatedAt:Date }>(row: T) {
  return { id:row.id, companyId:row.companyId, name:row.name, active:row.active, createdAt:iso(row.createdAt), updatedAt:iso(row.updatedAt) };
}

function mapUnit(row: ProductRow['units'][number]): ProductUnitView {
  return {
    id:row.id, productId:row.productId, name:row.name, shortLabel:row.shortLabel,
    conversionFactor:row.conversionFactor.toString(), isBase:row.isBase,
    defaultSale:row.defaultSale, defaultPurchase:row.defaultPurchase, active:row.active,
    version:row.version, createdAt:iso(row.createdAt), updatedAt:iso(row.updatedAt),
  };
}

function mapBarcode(row: ProductRow['barcodes'][number]): ProductBarcodeView {
  return {
    id:row.id, productId:row.productId, unitId:row.unitId, value:row.value,
    symbology:row.symbology, isPrimary:row.isPrimary, active:row.active,
    source:row.source, version:row.version, createdAt:iso(row.createdAt), updatedAt:iso(row.updatedAt),
  };
}

function mapIngredient(row: ProductRow['ingredients'][number]): ProductIngredientView {
  return {
    id:row.id, productId:row.productId, ingredient:mapSimple(row.ingredient),
    strengthValue:row.strengthValue?.toString() ?? null, strengthUnit:row.strengthUnit,
    sortOrder:row.sortOrder,
  };
}

function mapSummary(row: ProductRow): ProductSummary {
  const primary = row.barcodes.find((item) => item.active && item.isPrimary) ?? row.barcodes.find((item) => item.active) ?? null;
  const base = row.units.find((item) => item.active && item.isBase) ?? null;
  return {
    id:row.id, companyId:row.companyId, productCode:row.productCode,
    productType:row.productType as ProductSummary['productType'], displayName:row.displayName,
    arabicName:row.arabicName, englishName:row.englishName, tradeName:row.tradeName,
    category:row.category ? mapCategory(row.category) : null,
    manufacturer:row.manufacturer ? mapSimple(row.manufacturer) : null,
    dosageForm:row.dosageForm ? mapSimple(row.dosageForm) : null,
    route:row.route ? mapSimple(row.route) : null,
    regulatoryId:row.regulatoryId, atcCode:row.atcCode,
    prescriptionClass:row.prescriptionClass, controlled:row.controlled, coldChain:row.coldChain,
    marketStatus:row.marketStatus as ProductSummary['marketStatus'],
    referencePrice:row.referencePrice?.toString() ?? null,
    referencePriceSource:row.referencePriceSource,
    referencePriceVerifiedAt:row.referencePriceVerifiedAt?.toISOString() ?? null,
    imageFileId:row.imageFileId, centralReferenceId:row.centralReferenceId,
    primaryBarcode:primary?.value ?? null, baseUnit:base ? mapUnit(base) : null,
    status:row.status as ProductSummary['status'], version:row.version,
    createdAt:iso(row.createdAt), updatedAt:iso(row.updatedAt),
  };
}

function mapDetail(row: ProductRow): ProductDetail {
  return {
    ...mapSummary(row), description:row.description, notes:row.notes,
    countryOfOrigin:row.countryOfOrigin, storageNotes:row.storageNotes,
    tags:row.tags.filter((item) => item.tag.active).map((item) => mapSimple(item.tag)),
    ingredients:row.ingredients.map(mapIngredient), units:row.units.map(mapUnit),
    barcodes:row.barcodes.map(mapBarcode), centralSnapshot:row.centralSnapshot,
  };
}

function mapSource(row: { id:string; sourceKey:string; name:string; provenance:string; licenseNote:string|null; sourceUrl:string|null; active:boolean; createdAt:Date; updatedAt:Date }): CentralDrugSourceView {
  return { ...row, createdAt:iso(row.createdAt), updatedAt:iso(row.updatedAt) };
}

function mapCentral(row: CentralRow): CentralDrugReferenceView {
  return {
    id:row.id, sourceId:row.sourceId, datasetId:row.datasetId, sourceRecordKey:row.sourceRecordKey,
    canonicalName:row.canonicalName, arabicName:row.arabicName, englishName:row.englishName,
    tradeName:row.tradeName, manufacturerName:row.manufacturerName, dosageForm:row.dosageForm,
    route:row.route, regulatoryId:row.regulatoryId, atcCode:row.atcCode,
    prescriptionClass:row.prescriptionClass, controlled:row.controlled,
    packageDescription:row.packageDescription, baseUnitLabel:row.baseUnitLabel,
    packageUnitLabel:row.packageUnitLabel, conversionFactor:row.conversionFactor?.toString() ?? null,
    referencePrice:row.referencePrice?.toString() ?? null,
    marketStatus:row.marketStatus as CentralDrugReferenceView['marketStatus'],
    sourceEffectiveDate:row.sourceEffectiveDate?.toISOString() ?? null,
    lastVerifiedAt:row.lastVerifiedAt?.toISOString() ?? null,
    status:row.status as CentralDrugReferenceView['status'], version:row.version,
    quarantineReason:row.quarantineReason,
    ingredients:row.ingredients.map((item) => ({ name:item.name, strengthValue:item.strengthValue?.toString() ?? null, strengthUnit:item.strengthUnit, sortOrder:item.sortOrder })),
    barcodes:row.barcodes.map((item) => ({ value:item.value, symbology:item.symbology })),
    createdAt:iso(row.createdAt), updatedAt:iso(row.updatedAt),
  };
}

function mapSession(row: {
  id:string; kind:string; scopeKey:string; companyId:string|null; mode:string; status:string;
  sourceName:string|null; sourceId:string|null; datasetKey:string|null; totalRows:number|null;
  processedRows:number; acceptedRows:number; updatedRows:number; rejectedRows:number;
  quarantinedRows:number; createdBy:string; createdAt:Date; updatedAt:Date;
}): ImportSessionAdminView {
  return { ...row, createdAt:iso(row.createdAt), updatedAt:iso(row.updatedAt) };
}

function optionalText(value: string | null | undefined): string | null | undefined {
  if (value == null) return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeCompanyImportRow(row: CompanyImportRow): CompanyImportRow {
  return {
    ...row,
    productCode:optionalText(row.productCode), arabicName:optionalText(row.arabicName),
    englishName:optionalText(row.englishName), tradeName:optionalText(row.tradeName),
    manufacturerName:optionalText(row.manufacturerName), categoryName:optionalText(row.categoryName),
    ingredientName:optionalText(row.ingredientName), strengthValue:optionalText(row.strengthValue),
    strengthUnit:optionalText(row.strengthUnit), dosageFormName:optionalText(row.dosageFormName),
    routeName:optionalText(row.routeName), barcode:optionalText(row.barcode),
    barcodeSymbology:optionalText(row.barcodeSymbology), baseUnitName:optionalText(row.baseUnitName),
    packageUnitName:optionalText(row.packageUnitName), packageFactor:optionalText(row.packageFactor),
    regulatoryId:optionalText(row.regulatoryId), atcCode:optionalText(row.atcCode),
    prescriptionClass:optionalText(row.prescriptionClass), referencePrice:optionalText(row.referencePrice),
    referencePriceSource:optionalText(row.referencePriceSource), notes:optionalText(row.notes),
  };
}

@Injectable()
export class PrismaProductsV1Repository extends PrismaProductsRepository implements ProductsHardeningRepository {
  constructor(private readonly db: PrismaService) { super(db); }

  override async list(query: ProductListQuery): Promise<ProductListResult> {
    const scopeFilter = await this.productWhere(query, false);
    if (query.search && query.page === 1) {
      const exact = await this.db.productBarcode.findFirst({
        where:{ companyId:query.companyId, value:normalizeBarcodeSafe(query.search), active:true },
        select:{ productId:true },
      });
      if (exact) {
        const row = await this.db.product.findFirst({ where:{ ...scopeFilter, id:exact.productId }, include:includeProduct });
        if (row) return { items:[mapSummary(row)], page:1, pageSize:query.pageSize, total:1 };
      }
    }
    const where = await this.productWhere(query, true);
    const [rows,total] = await Promise.all([
      this.db.product.findMany({ where, include:includeProduct, orderBy:this.orderBy(query), skip:(query.page-1)*query.pageSize, take:query.pageSize }),
      this.db.product.count({ where }),
    ]);
    return { items:rows.map(mapSummary), page:query.page, pageSize:query.pageSize, total };
  }

  override async exportList(query: Omit<ProductListQuery,'page'|'pageSize'>): Promise<ProductDetail[]> {
    const fullQuery: ProductListQuery = { ...query, page:1, pageSize:100 };
    const where = await this.productWhere(fullQuery, true);
    const rows = await this.db.product.findMany({
      where, include:includeProduct,
      orderBy:this.orderBy({ sortBy:query.sortBy, sortDirection:query.sortDirection }),
      take:100000,
    });
    return rows.map(mapDetail);
  }

  override async claimImportChunk(sessionId:string, chunkKey:string): Promise<ImportChunkClaim> {
    const staleBefore = new Date(Date.now() - 5*60*1000);
    let current = await this.db.productImportChunk.findFirst({ where:{ sessionId, chunkKey } });
    if (!current) {
      try {
        current = await this.db.productImportChunk.create({ data:{ sessionId, chunkKey } });
        await this.db.productImportSession.update({ where:{ id:sessionId }, data:{ status:'PROCESSING' } });
        return { id:current.id, status:current.status, result:null, claimed:true, recovered:false };
      } catch (error) {
        if (!this.isUnique(error)) throw error;
        current = await this.db.productImportChunk.findFirst({ where:{ sessionId, chunkKey } });
      }
    }
    if (!current) throw new ProductPersistenceConflictError('Unable to resolve import chunk claim');
    if (current.status === 'COMPLETED') {
      return { id:current.id, status:current.status, result:current.result as unknown as ImportChunkResult|null, claimed:false, recovered:false };
    }
    const recoverable = current.status === 'FAILED' || (current.status === 'PROCESSING' && current.updatedAt <= staleBefore);
    if (!recoverable) return { id:current.id, status:current.status, result:null, claimed:false, recovered:false };
    const changed = await this.db.productImportChunk.updateMany({
      where:{ id:current.id, status:current.status, updatedAt:current.updatedAt },
      data:{ status:'PROCESSING', result:Prisma.JsonNull },
    });
    if (changed.count !== 1) return this.claimImportChunk(sessionId, chunkKey);
    await this.db.productImportSession.update({ where:{ id:sessionId }, data:{ status:'PROCESSING' } });
    return { id:current.id, status:'PROCESSING', result:null, claimed:true, recovered:true };
  }

  override async importCompanyRow(sessionId:string, mode:string, row:CompanyImportRow) {
    const normalized = normalizeCompanyImportRow(row);
    if (normalized.ingredients && normalized.ingredients.length > 1) {
      throw new ProductClassificationError('Multi-ingredient import requires the Products v1 import execution path');
    }
    if (normalized.ingredients?.[0]) {
      normalized.ingredientName = normalized.ingredients[0].name;
      normalized.strengthValue = normalized.ingredients[0].strengthValue;
      normalized.strengthUnit = normalized.ingredients[0].strengthUnit;
    }
    return super.importCompanyRow(sessionId, mode, normalized);
  }

  async getImportChunkState(sessionId:string, chunkKey:string): Promise<ImportChunkState|null> {
    const row = await this.db.productImportChunk.findFirst({ where:{ sessionId,chunkKey }, select:{ id:true,status:true,updatedAt:true,result:true } });
    return row ? { id:row.id, status:row.status, updatedAt:iso(row.updatedAt), hasResult:row.result !== null } : null;
  }

  async listCompanyImportSessions(companyId:string, limit:number): Promise<ImportSessionAdminView[]> {
    return (await this.db.productImportSession.findMany({
      where:{ kind:'COMPANY', companyId }, orderBy:[{ createdAt:'desc' },{ id:'asc' }], take:bounded(limit),
    })).map(mapSession);
  }

  async listCentralImportSessions(limit:number): Promise<ImportSessionAdminView[]> {
    return (await this.db.productImportSession.findMany({
      where:{ kind:'CENTRAL', scopeKey:'GLOBAL' }, orderBy:[{ createdAt:'desc' },{ id:'asc' }], take:bounded(limit),
    })).map(mapSession);
  }

  async listCentralDatasets(limit:number): Promise<CentralDatasetView[]> {
    const rows = await this.db.centralDrugDataset.findMany({ include:{ source:true }, orderBy:[{ ingestedAt:'desc' },{ id:'asc' }], take:bounded(limit) });
    return rows.map((row) => ({
      id:row.id, sourceId:row.sourceId, datasetKey:row.datasetKey,
      publishedAt:row.publishedAt?.toISOString() ?? null, ingestedAt:row.ingestedAt.toISOString(),
      createdBy:row.createdBy, status:row.status,
      source:{ id:row.source.id, sourceKey:row.source.sourceKey, name:row.source.name,
        provenance:row.source.provenance, licenseNote:row.source.licenseNote,
        sourceUrl:row.source.sourceUrl, active:row.source.active },
    }));
  }

  async getCentralAdmin(referenceId:string): Promise<CentralReferenceAdminView|null> {
    const row = await this.db.centralDrugReference.findUnique({
      where:{ id:referenceId }, include:{ ...includeCentral, source:true, dataset:{ include:{ source:true } } },
    });
    if (!row) return null;
    const dataset: CentralDatasetView|null = row.dataset ? {
      id:row.dataset.id, sourceId:row.dataset.sourceId, datasetKey:row.dataset.datasetKey,
      publishedAt:row.dataset.publishedAt?.toISOString() ?? null, ingestedAt:row.dataset.ingestedAt.toISOString(),
      createdBy:row.dataset.createdBy, status:row.dataset.status,
      source:{ id:row.dataset.source.id, sourceKey:row.dataset.source.sourceKey,
        name:row.dataset.source.name, provenance:row.dataset.source.provenance,
        licenseNote:row.dataset.source.licenseNote, sourceUrl:row.dataset.source.sourceUrl,
        active:row.dataset.source.active },
    } : null;
    return { reference:mapCentral(row), source:mapSource(row.source), dataset };
  }

  async governCentralReference(referenceId:string, input:CentralGovernanceInput): Promise<CentralReferenceAdminView> {
    const note = cleanText(input.resolutionNote,2000);
    if (!note) throw new ProductClassificationError('A governance/resolution note is required');
    await this.db.$transaction(async (tx) => {
      const current = await tx.centralDrugReference.findUnique({ where:{ id:referenceId }, include:includeCentral });
      if (!current) throw new ProductClassificationError('Central reference not found');
      if (current.version !== input.version) throw new ProductConcurrentUpdateError();
      const allowed:Record<string,readonly string[]> = {
        ACTIVE:['SUPERSEDED','RETIRED'], SUPERSEDED:['ACTIVE','RETIRED'],
        RETIRED:['ACTIVE'], QUARANTINED:['ACTIVE','SUPERSEDED','RETIRED'],
      };
      if (current.status !== input.status && !allowed[current.status]?.includes(input.status)) {
        throw new ProductClassificationError(`Central status transition ${current.status} -> ${input.status} is not allowed`);
      }
      if (input.status === 'ACTIVE') {
        if (current.regulatoryId) {
          const conflict = await tx.centralDrugReference.findFirst({
            where:{ id:{ not:current.id }, regulatoryId:current.regulatoryId, status:'ACTIVE' }, select:{ id:true },
          });
          if (conflict) throw new ProductPersistenceConflictError('Regulatory identifier is still owned by another active central reference');
        }
        for (const barcode of current.barcodes) {
          const conflict = await tx.centralDrugBarcode.findFirst({
            where:{ value:barcode.value, centralDrugId:{ not:current.id } }, select:{ id:true },
          });
          if (conflict) throw new ProductPersistenceConflictError('Barcode is still owned by another central reference');
        }
      }
      const changed = await tx.centralDrugReference.updateMany({
        where:{ id:current.id, version:input.version },
        data:{ status:input.status, quarantineReason:input.status === 'ACTIVE' ? null : current.quarantineReason, version:{ increment:1 } },
      });
      if (changed.count !== 1) throw new ProductConcurrentUpdateError();
    });
    const result = await this.getCentralAdmin(referenceId);
    if (!result) throw new ProductClassificationError('Central reference disappeared after governance update');
    return result;
  }

  async previewBulk(companyId:string, productIds:string[], patch:BulkProductPatch): Promise<BulkPreviewResult> {
    const ids = [...new Set(productIds)];
    if (!this.hasBulkPatch(patch)) throw new ProductClassificationError('Bulk update requires at least one explicitly selected field');
    await this.validateBulkReferences(this.db,companyId,patch);
    const rows = await this.db.product.findMany({
      where:{ companyId,id:{ in:ids } }, include:{ units:true,ingredients:true,tags:true },
    });
    const found = new Set(rows.map((row) => row.id));
    const missing = ids.filter((id) => !found.has(id));
    const issues = rows.flatMap((row) => this.bulkIssues(row,patch));
    const missingIssues = missing.map((productId) => ({
      productId, code:'NOT_FOUND' as const, message:'Product not found in authorized company',
    }));
    return {
      requested:ids.length, matched:rows.length, missing,
      wouldChange:rows.filter((row) => this.bulkRowWouldChange(row,patch)).length,
      valid:missing.length === 0 && issues.length === 0,
      issues:[...missingIssues,...issues],
    };
  }

  async executeBulk(companyId:string, productIds:string[], patch:BulkProductPatch, idempotencyKey:string, actorId:string): Promise<BulkExecutionResult> {
    const ids = [...new Set(productIds)].sort();
    if (ids.length === 0 || ids.length > 5000) throw new ProductClassificationError('Bulk update requires 1 to 5000 unique products');
    if (!this.hasBulkPatch(patch)) throw new ProductClassificationError('Bulk update requires at least one explicitly selected field');
    const normalizedPatch = { ...patch, tagIds:patch.tagIds ? [...new Set(patch.tagIds)].sort() : undefined };
    const requestHash = createHash('sha256').update(JSON.stringify({ productIds:ids, patch:normalizedPatch })).digest('hex');
    try {
      const changed = await this.db.$transaction(async (tx) => {
        await tx.productImportSession.create({ data:{
          kind:'BULK', scopeKey:companyId, companyId, idempotencyKey, mode:'BULK_UPDATE_V1',
          status:'PROCESSING', sourceName:'Products bulk update',
          mapping:{ requestHash, patch:normalizedPatch } as Prisma.InputJsonValue,
          totalRows:ids.length, createdBy:actorId,
        } });
        await this.validateBulkReferences(tx,companyId,patch);
        const rows = await tx.product.findMany({ where:{ companyId,id:{ in:ids } }, include:{ units:true,ingredients:true,tags:true } });
        if (rows.length !== ids.length) throw new ProductClassificationError('One or more selected products are outside the authorized company');
        const issues = rows.flatMap((row) => this.bulkIssues(row,patch));
        if (issues.length) throw new ProductClassificationError(issues.map((issue) => `${issue.productId}: ${issue.message}`).join('; '));
        let changedCount = 0;
        for (const row of rows) {
          if (!this.bulkRowWouldChange(row,patch)) continue;
          const data: Prisma.ProductUncheckedUpdateInput = { version:{ increment:1 } };
          if (Object.prototype.hasOwnProperty.call(patch,'categoryId')) data.categoryId = patch.categoryId ?? null;
          if (Object.prototype.hasOwnProperty.call(patch,'manufacturerId')) data.manufacturerId = patch.manufacturerId ?? null;
          if (patch.status) data.status = patch.status;
          if (Object.prototype.hasOwnProperty.call(patch,'prescriptionClass')) data.prescriptionClass = cleanText(patch.prescriptionClass,40)?.toLocaleUpperCase('en-US') ?? null;
          if (patch.marketStatus) data.marketStatus = patch.marketStatus;
          if (Object.prototype.hasOwnProperty.call(patch,'controlled')) data.controlled = patch.controlled;
          if (Object.prototype.hasOwnProperty.call(patch,'coldChain')) data.coldChain = patch.coldChain;
          await tx.product.update({ where:{ id:row.id }, data });
          if (patch.tagIds) {
            await tx.productTagAssignment.deleteMany({ where:{ productId:row.id } });
            if (patch.tagIds.length) await tx.productTagAssignment.createMany({
              data:[...new Set(patch.tagIds)].map((tagId) => ({ productId:row.id,tagId })),
            });
          }
          changedCount += 1;
        }
        await tx.productImportSession.updateMany({
          where:{ kind:'BULK',scopeKey:companyId,idempotencyKey },
          data:{ status:'COMPLETED',processedRows:ids.length,acceptedRows:changedCount },
        });
        return changedCount;
      });
      return { changed, requested:ids.length, replayed:false };
    } catch (error) {
      if (!this.isUnique(error)) throw error;
      const existing = await this.db.productImportSession.findFirst({ where:{ kind:'BULK',scopeKey:companyId,idempotencyKey } });
      if (!existing) throw new ProductPersistenceConflictError('Unable to resolve bulk idempotency replay');
      const mapping = existing.mapping && typeof existing.mapping === 'object' && !Array.isArray(existing.mapping)
        ? existing.mapping as Record<string,unknown> : {};
      if (mapping.requestHash !== requestHash) throw new ProductPersistenceConflictError('Idempotency key was already used for a different bulk request');
      if (existing.status !== 'COMPLETED') throw new ProductPersistenceConflictError('Bulk request is still processing');
      return { changed:existing.acceptedRows, requested:ids.length, replayed:true };
    }
  }

  private async productWhere(query:ProductListQuery, includeSearch:boolean): Promise<Prisma.ProductWhereInput> {
    const search = query.search ? normalizeSearchText(query.search) : undefined;
    const categoryIds = query.categoryId ? await this.categoryWithDescendants(query.companyId,query.categoryId) : undefined;
    return {
      companyId:query.companyId,
      ...(query.status ? { status:query.status } : { status:{ not:'ARCHIVED' } }),
      ...(query.productType ? { productType:query.productType } : {}),
      ...(categoryIds ? { categoryId:{ in:categoryIds } } : {}),
      ...(query.tagId ? { tags:{ some:{ tagId:query.tagId } } } : {}),
      ...(query.manufacturerId ? { manufacturerId:query.manufacturerId } : {}),
      ...(query.ingredientId ? { ingredients:{ some:{ ingredientId:query.ingredientId } } } : {}),
      ...(query.dosageFormId ? { dosageFormId:query.dosageFormId } : {}),
      ...(query.prescriptionClass ? { prescriptionClass:{ equals:query.prescriptionClass,mode:'insensitive' } } : {}),
      ...(query.marketStatus ? { marketStatus:query.marketStatus } : {}),
      ...(query.controlled !== undefined ? { controlled:query.controlled } : {}),
      ...(query.hasBarcode !== undefined ? { barcodes:query.hasBarcode ? { some:{ active:true } } : { none:{ active:true } } } : {}),
      ...(query.hasImage !== undefined ? { imageFileId:query.hasImage ? { not:null } : null } : {}),
      ...(query.linkedCentral !== undefined ? { centralReferenceId:query.linkedCentral ? { not:null } : null } : {}),
      ...(query.createdFrom || query.createdTo ? { createdAt:{ ...(query.createdFrom ? { gte:query.createdFrom } : {}), ...(query.createdTo ? { lte:query.createdTo } : {}) } } : {}),
      ...(query.updatedFrom || query.updatedTo ? { updatedAt:{ ...(query.updatedFrom ? { gte:query.updatedFrom } : {}), ...(query.updatedTo ? { lte:query.updatedTo } : {}) } } : {}),
      ...(includeSearch && search ? { OR:[
        { normalizedName:{ contains:search } }, { normalizedArabicName:{ contains:search } },
        { normalizedEnglishName:{ contains:search } }, { normalizedTradeName:{ contains:search } },
        { productCode:{ contains:query.search!,mode:'insensitive' } },
        { regulatoryId:{ equals:query.search!,mode:'insensitive' } },
        { barcodes:{ some:{ value:query.search!,active:true } } },
        { manufacturer:{ normalizedName:{ contains:search } } },
        { ingredients:{ some:{ ingredient:{ normalizedName:{ contains:search } } } },
        { category:{ normalizedName:{ contains:search } } },
        { tags:{ some:{ tag:{ normalizedName:{ contains:search } } } },
      ] } : {}),
    };
  }

  private orderBy(query:Pick<ProductListQuery,'sortBy'|'sortDirection'>): Prisma.ProductOrderByWithRelationInput[] {
    const direction = query.sortDirection ?? (['NAME','PRODUCT_CODE','MANUFACTURER','CATEGORY'].includes(query.sortBy ?? '') ? 'asc' : 'desc');
    switch (query.sortBy ?? 'UPDATED_AT') {
      case 'NAME': return [{ displayName:direction },{ id:'asc' }];
      case 'PRODUCT_CODE': return [{ productCode:direction },{ id:'asc' }];
      case 'CREATED_AT': return [{ createdAt:direction },{ id:'asc' }];
      case 'MANUFACTURER': return [{ manufacturer:{ name:direction } },{ displayName:'asc' },{ id:'asc' }];
      case 'CATEGORY': return [{ category:{ name:direction } },{ displayName:'asc' },{ id:'asc' }];
      case 'UPDATED_AT':
      default: return [{ updatedAt:direction },{ id:'asc' }];
    }
  }

  private async categoryWithDescendants(companyId:string, rootId:string): Promise<string[]> {
    const rows = await this.db.productCategory.findMany({ where:{ companyId }, select:{ id:true,parentId:true } });
    if (!rows.some((row) => row.id === rootId)) return [rootId];
    const result = new Set([rootId]);
    let added = true;
    while (added) {
      added = false;
      for (const row of rows) if (row.parentId && result.has(row.parentId) && !result.has(row.id)) { result.add(row.id); added = true; }
    }
    return [...result];
  }

  private hasBulkPatch(patch:BulkProductPatch) {
    return ['categoryId','manufacturerId','tagIds','status','prescriptionClass','marketStatus','controlled','coldChain']
      .some((key) => Object.prototype.hasOwnProperty.call(patch,key));
  }

  private async validateBulkReferences(client:Db, companyId:string, patch:BulkProductPatch) {
    if (patch.categoryId && await client.productCategory.count({ where:{ id:patch.categoryId,companyId,active:true } }) !== 1)
      throw new ProductClassificationError('Bulk category is invalid for authorized company');
    if (patch.manufacturerId && await client.productManufacturer.count({ where:{ id:patch.manufacturerId,companyId,active:true } }) !== 1)
      throw new ProductClassificationError('Bulk manufacturer is invalid for authorized company');
    if (patch.tagIds) {
      const ids = [...new Set(patch.tagIds)];
      if (await client.productTag.count({ where:{ id:{ in:ids },companyId,active:true } }) !== ids.length)
        throw new ProductClassificationError('One or more bulk tags are invalid for authorized company');
    }
  }

  private bulkIssues(row:{ id:string; status:string; productType:string; units:Array<{active:boolean;isBase:boolean}>; ingredients:unknown[] }, patch:BulkProductPatch): BulkPreviewIssue[] {
    const issues:BulkPreviewIssue[] = [];
    const target = patch.status ?? row.status;
    const masterEdit = ['categoryId','manufacturerId','tagIds','prescriptionClass','marketStatus','controlled','coldChain']
      .some((key) => Object.prototype.hasOwnProperty.call(patch,key));
    if (row.status === 'ARCHIVED' && masterEdit && (!patch.status || patch.status === 'ARCHIVED'))
      issues.push({ productId:row.id,code:'ARCHIVED_EDIT',message:'Archived product must be restored before master-data changes' });
    if (patch.status && patch.status !== row.status) {
      try { assertStatusTransition(row.status as ProductSummary['status'],patch.status); }
      catch (error) { issues.push({ productId:row.id,code:'INVALID_STATUS_TRANSITION',message:error instanceof Error ? error.message : 'Invalid status transition' }); }
    }
    if (target === 'ACTIVE') {
      const bases = row.units.filter((unit) => unit.active && unit.isBase).length;
      if (bases !== 1 || (row.productType === 'DRUG' && row.ingredients.length === 0))
        issues.push({ productId:row.id,code:'ACTIVATION_NOT_READY',message:'Product is not ready for ACTIVE status (base unit / ingredient requirements)' });
    }
    return issues;
  }

  private bulkRowWouldChange(row:{ categoryId?:string|null; manufacturerId?:string|null; status:string; prescriptionClass?:string|null; marketStatus?:string; controlled?:boolean; coldChain?:boolean; tags:Array<{tagId:string}> }, patch:BulkProductPatch) {
    if (Object.prototype.hasOwnProperty.call(patch,'categoryId') && (row.categoryId ?? null) !== (patch.categoryId ?? null)) return true;
    if (Object.prototype.hasOwnProperty.call(patch,'manufacturerId') && (row.manufacturerId ?? null) !== (patch.manufacturerId ?? null)) return true;
    if (patch.status && row.status !== patch.status) return true;
    if (Object.prototype.hasOwnProperty.call(patch,'prescriptionClass') && (row.prescriptionClass ?? null) !== (cleanText(patch.prescriptionClass,40)?.toLocaleUpperCase('en-US') ?? null)) return true;
    if (patch.marketStatus && row.marketStatus !== patch.marketStatus) return true;
    if (Object.prototype.hasOwnProperty.call(patch,'controlled') && row.controlled !== patch.controlled) return true;
    if (Object.prototype.hasOwnProperty.call(patch,'coldChain') && row.coldChain !== patch.coldChain) return true;
    if (patch.tagIds) {
      const current = row.tags.map((tag) => tag.tagId).sort().join('|');
      const target = [...new Set(patch.tagIds)].sort().join('|');
      if (current !== target) return true;
    }
    return false;
  }

  private isUnique(error:unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}

function normalizeBarcodeSafe(value:string) { try { return normalizeBarcode(value); } catch { return value.trim(); } }
function bounded(value:number) { return Math.min(Math.max(value,1),100); }
