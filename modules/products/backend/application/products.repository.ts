import type {
  BarcodeResolution,
  CentralDrugReferenceView,
  CentralDrugSourceView,
  ProductBarcodeView,
  ProductCategoryView,
  ProductDetail,
  ProductDosageFormView,
  ProductIngredientMasterView,
  ProductManufacturerView,
  ProductMarketStatus,
  ProductRouteView,
  ProductStatus,
  ProductSummary,
  ProductTagView,
  ProductUnitView,
} from '../../contracts';
import type {
  NormalizedProductBarcodeDraft,
  NormalizedProductDraft,
  NormalizedProductUnitDraft,
} from '../domain/product';

export class ProductConcurrentUpdateError extends Error {}
export class ProductPersistenceConflictError extends Error {}
export class ProductClassificationError extends Error {}
export class ProductImportClaimError extends Error {}

export type ProductSortField =
  | 'NAME'
  | 'PRODUCT_CODE'
  | 'UPDATED_AT'
  | 'CREATED_AT'
  | 'MANUFACTURER'
  | 'CATEGORY';
export type ProductSortDirection = 'asc' | 'desc';

export interface ProductListQuery {
  companyId: string;
  search?: string;
  status?: ProductStatus;
  productType?: 'DRUG' | 'NON_DRUG';
  categoryId?: string;
  tagId?: string;
  manufacturerId?: string;
  ingredientId?: string;
  dosageFormId?: string;
  prescriptionClass?: string;
  marketStatus?: ProductMarketStatus;
  controlled?: boolean;
  hasBarcode?: boolean;
  hasImage?: boolean;
  linkedCentral?: boolean;
  createdFrom?: Date;
  createdTo?: Date;
  updatedFrom?: Date;
  updatedTo?: Date;
  sortBy?: ProductSortField;
  sortDirection?: ProductSortDirection;
  page: number;
  pageSize: number;
}

export interface ProductListResult {
  items: ProductSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ProductCreateRecord {
  id: string;
  companyId: string;
  productCode: string;
  createRequestKey: string;
  draft: NormalizedProductDraft;
  status: ProductStatus;
  centralReferenceId?: string | null;
  centralSnapshot?: unknown;
}

export interface ProductUpdateRecord {
  companyId: string;
  productId: string;
  expectedVersion: number;
  draft: NormalizedProductDraft;
}

export interface ProductUnitUpdateRecord extends NormalizedProductUnitDraft {
  expectedVersion: number;
}

export interface ProductBarcodeUpdateRecord extends NormalizedProductBarcodeDraft {
  expectedVersion: number;
  unitId: string;
}

export interface ProductDuplicateProbe {
  normalizedName: string;
  normalizedArabicName: string | null;
  normalizedEnglishName: string | null;
  normalizedTradeName: string | null;
  manufacturerId: string | null;
  regulatoryId: string | null;
  barcodes: string[];
  ingredientIds: string[];
}

export type MasterKind = 'category' | 'tag' | 'manufacturer' | 'ingredient' | 'dosage-form' | 'route';
export type MasterView =
  | ProductCategoryView
  | ProductTagView
  | ProductManufacturerView
  | ProductIngredientMasterView
  | ProductDosageFormView
  | ProductRouteView;

export interface ImportSessionView {
  id: string;
  kind: 'COMPANY' | 'CENTRAL';
  scopeKey: string;
  companyId: string | null;
  mode: string;
  status: string;
  sourceName: string | null;
  sourceId: string | null;
  datasetKey: string | null;
  totalRows: number | null;
  processedRows: number;
  acceptedRows: number;
  updatedRows: number;
  rejectedRows: number;
  quarantinedRows: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportChunkResult {
  accepted: number;
  updated: number;
  rejected: number;
  quarantined: number;
  rows: Array<{
    row: number;
    status: 'ACCEPTED' | 'UPDATED' | 'REJECTED' | 'QUARANTINED';
    productId?: string;
    centralDrugId?: string;
    reason?: string;
  }>;
}

export interface ImportChunkClaim {
  id: string;
  status: string;
  result: ImportChunkResult | null;
  claimed: boolean;
  recovered?: boolean;
}

export interface ImportIngredientRow {
  name: string;
  strengthValue?: string | null;
  strengthUnit?: string | null;
}

export interface CompanyImportRow {
  row: number;
  productCode?: string | null;
  displayName: string;
  productType: 'DRUG' | 'NON_DRUG';
  arabicName?: string | null;
  englishName?: string | null;
  tradeName?: string | null;
  manufacturerName?: string | null;
  categoryName?: string | null;
  ingredientName?: string | null;
  strengthValue?: string | null;
  strengthUnit?: string | null;
  ingredients?: ImportIngredientRow[];
  dosageFormName?: string | null;
  routeName?: string | null;
  barcode?: string | null;
  barcodeSymbology?: string | null;
  baseUnitName?: string | null;
  packageUnitName?: string | null;
  packageFactor?: string | null;
  regulatoryId?: string | null;
  atcCode?: string | null;
  prescriptionClass?: string | null;
  controlled?: boolean;
  coldChain?: boolean;
  referencePrice?: string | null;
  referencePriceSource?: string | null;
  marketStatus?: ProductMarketStatus;
  notes?: string | null;
}

export interface CentralImportRow {
  row: number;
  sourceRecordKey: string;
  canonicalName: string;
  arabicName?: string | null;
  englishName?: string | null;
  tradeName?: string | null;
  manufacturerName?: string | null;
  ingredientName?: string | null;
  strengthValue?: string | null;
  strengthUnit?: string | null;
  ingredients?: ImportIngredientRow[];
  dosageForm?: string | null;
  route?: string | null;
  regulatoryId?: string | null;
  atcCode?: string | null;
  prescriptionClass?: string | null;
  controlled?: boolean;
  packageDescription?: string | null;
  baseUnitLabel?: string | null;
  packageUnitLabel?: string | null;
  conversionFactor?: string | null;
  barcode?: string | null;
  barcodeSymbology?: string | null;
  referencePrice?: string | null;
  marketStatus?: ProductMarketStatus;
  sourceEffectiveDate?: Date | null;
  lastVerifiedAt?: Date | null;
  sourcePayload?: unknown;
}

export interface CentralSearchQuery {
  search?: string;
  status?: 'ACTIVE' | 'SUPERSEDED' | 'RETIRED' | 'QUARANTINED';
  manufacturer?: string;
  dosageForm?: string;
  strength?: string;
  controlled?: boolean;
  page: number;
  pageSize: number;
}

export interface CentralSearchResult {
  items: CentralDrugReferenceView[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CentralSourceInput {
  sourceKey: string;
  name: string;
  provenance: string;
  licenseNote: string | null;
  sourceUrl: string | null;
  active: boolean;
}

export interface CentralImportContext {
  sourceId: string;
  datasetKey: string;
  publishedAt: Date | null;
  actorId: string;
}

export type CentralApplySection =
  | 'names'
  | 'drug-profile'
  | 'manufacturer'
  | 'ingredients'
  | 'packaging'
  | 'barcodes'
  | 'reference-price';

export interface ProductsRepository {
  list(query: ProductListQuery): Promise<ProductListResult>;
  exportList(query: Omit<ProductListQuery, 'page' | 'pageSize'>): Promise<ProductDetail[]>;
  get(companyId: string, productId: string): Promise<ProductDetail | null>;
  findByCreateRequestKey(companyId: string, key: string): Promise<ProductDetail | null>;
  findByProductCode(companyId: string, productCode: string): Promise<ProductDetail | null>;
  findLikelyDuplicates(companyId: string, probe: ProductDuplicateProbe): Promise<ProductSummary[]>;
  create(record: ProductCreateRecord): Promise<ProductDetail>;
  update(record: ProductUpdateRecord): Promise<ProductDetail>;
  changeStatus(companyId: string, productId: string, expectedVersion: number, status: ProductStatus): Promise<ProductDetail>;
  resolveBarcode(companyId: string, barcode: string): Promise<BarcodeResolution | null>;
  addUnit(companyId: string, productId: string, input: NormalizedProductUnitDraft): Promise<ProductUnitView>;
  updateUnit(companyId: string, productId: string, unitId: string, input: ProductUnitUpdateRecord): Promise<ProductUnitView>;
  deactivateUnit(companyId: string, productId: string, unitId: string, expectedVersion: number): Promise<ProductUnitView>;
  addBarcode(companyId: string, productId: string, unitId: string, input: NormalizedProductBarcodeDraft): Promise<ProductBarcodeView>;
  updateBarcode(companyId: string, productId: string, barcodeId: string, input: ProductBarcodeUpdateRecord): Promise<ProductBarcodeView>;
  deactivateBarcode(companyId: string, productId: string, barcodeId: string, expectedVersion: number): Promise<ProductBarcodeView>;
  listMasters(companyId: string, kind: MasterKind, includeInactive: boolean): Promise<MasterView[]>;
  createMaster(companyId: string, kind: MasterKind, name: string, parentId?: string | null): Promise<MasterView>;
  updateMaster(companyId: string, kind: MasterKind, id: string, name: string, active: boolean, parentId?: string | null): Promise<MasterView>;
  startImport(input: {
    kind: 'COMPANY' | 'CENTRAL';
    scopeKey: string;
    companyId: string | null;
    idempotencyKey: string;
    mode: string;
    sourceName: string | null;
    sourceId: string | null;
    datasetKey: string | null;
    mapping: unknown;
    totalRows: number | null;
    createdBy: string;
  }): Promise<ImportSessionView>;
  getImportSession(scopeKey: string, sessionId: string): Promise<ImportSessionView | null>;
  claimImportChunk(sessionId: string, chunkKey: string): Promise<ImportChunkClaim>;
  completeImportChunk(sessionId: string, chunkId: string, result: ImportChunkResult): Promise<ImportSessionView>;
  failImportChunk(chunkId: string, result: ImportChunkResult): Promise<void>;
  importCompanyRow(sessionId: string, mode: string, row: CompanyImportRow): Promise<{ status: 'ACCEPTED' | 'UPDATED'; product: ProductDetail }>;
  bulkUpdate(companyId: string, productIds: string[], patch: { categoryId?: string | null; manufacturerId?: string | null; status?: ProductStatus; tagIds?: string[] }): Promise<number>;
  listCentralSources(): Promise<CentralDrugSourceView[]>;
  createCentralSource(input: CentralSourceInput): Promise<CentralDrugSourceView>;
  updateCentralSource(id: string, input: CentralSourceInput): Promise<CentralDrugSourceView>;
  centralSearch(query: CentralSearchQuery): Promise<CentralSearchResult>;
  getCentral(centralId: string): Promise<CentralDrugReferenceView | null>;
  importCentralRow(sessionId: string, context: CentralImportContext, row: CentralImportRow): Promise<{ status: 'ACCEPTED' | 'UPDATED' | 'QUARANTINED'; central: CentralDrugReferenceView; reason?: string }>;
  adoptCentral(companyId: string, centralId: string, id: string, productCode: string, createRequestKey: string): Promise<ProductDetail>;
  compareCentral(companyId: string, productId: string): Promise<{ product: ProductDetail; central: CentralDrugReferenceView; snapshot: unknown } | null>;
  applyCentral(companyId: string, productId: string, expectedVersion: number, sections: CentralApplySection[]): Promise<ProductDetail>;
}

export const PRODUCTS_REPOSITORY = Symbol('PRODUCTS_REPOSITORY');
