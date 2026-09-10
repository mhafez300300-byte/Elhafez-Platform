import type { CentralDrugReferenceView, CentralDrugSourceView, ProductMarketStatus, ProductStatus } from '../../contracts';

export const PRODUCTS_HARDENING_REPOSITORY = Symbol('PRODUCTS_HARDENING_REPOSITORY');

export interface BulkProductPatch {
  categoryId?: string | null;
  manufacturerId?: string | null;
  tagIds?: string[];
  status?: ProductStatus;
  prescriptionClass?: string | null;
  marketStatus?: ProductMarketStatus;
  controlled?: boolean;
  coldChain?: boolean;
}

export interface BulkPreviewIssue {
  productId: string;
  code: 'NOT_FOUND' | 'ARCHIVED_EDIT' | 'INVALID_STATUS_TRANSITION' | 'ACTIVATION_NOT_READY';
  message: string;
}

export interface BulkPreviewResult {
  requested: number;
  matched: number;
  missing: string[];
  wouldChange: number;
  valid: boolean;
  issues: BulkPreviewIssue[];
}

export interface BulkExecutionResult {
  changed: number;
  requested: number;
  replayed: boolean;
}

export interface ImportChunkState {
  id: string;
  status: string;
  updatedAt: string;
  hasResult: boolean;
}

export interface ImportSessionAdminView {
  id: string;
  kind: string;
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

export interface CentralDatasetView {
  id: string;
  sourceId: string;
  datasetKey: string;
  publishedAt: string | null;
  ingestedAt: string;
  createdBy: string;
  status: string;
  source: Pick<CentralDrugSourceView, 'id' | 'sourceKey' | 'name' | 'provenance' | 'licenseNote' | 'sourceUrl' | 'active'>;
}

export interface CentralReferenceAdminView {
  reference: CentralDrugReferenceView;
  source: CentralDrugSourceView;
  dataset: CentralDatasetView | null;
}

export interface CentralGovernanceInput {
  version: number;
  status: 'ACTIVE' | 'SUPERSEDED' | 'RETIRED';
  resolutionNote: string;
}

export interface ProductsHardeningRepository {
  previewBulk(companyId: string, productIds: string[], patch: BulkProductPatch): Promise<BulkPreviewResult>;
  executeBulk(companyId: string, productIds: string[], patch: BulkProductPatch, idempotencyKey: string, actorId: string): Promise<BulkExecutionResult>;
  getImportChunkState(sessionId: string, chunkKey: string): Promise<ImportChunkState | null>;
  listCompanyImportSessions(companyId: string, limit: number): Promise<ImportSessionAdminView[]>;
  listCentralImportSessions(limit: number): Promise<ImportSessionAdminView[]>;
  listCentralDatasets(limit: number): Promise<CentralDatasetView[]>;
  getCentralAdmin(referenceId: string): Promise<CentralReferenceAdminView | null>;
  governCentralReference(referenceId: string, input: CentralGovernanceInput): Promise<CentralReferenceAdminView>;
}
