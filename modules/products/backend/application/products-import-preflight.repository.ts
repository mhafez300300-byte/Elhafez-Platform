import type { CentralImportRow, CompanyImportRow } from './products.repository';

export const PRODUCTS_IMPORT_PREFLIGHT_REPOSITORY = Symbol('PRODUCTS_IMPORT_PREFLIGHT_REPOSITORY');

export interface ImportPreflightRow {
  row: number;
  status: 'ACCEPT' | 'WARNING' | 'REJECT';
  reasons: string[];
}

export interface ImportPreflightResult {
  accepted: number;
  warnings: number;
  rejected: number;
  rows: ImportPreflightRow[];
}

export interface ProductsImportPreflightRepository {
  company(companyId: string, mode: 'CREATE_ONLY' | 'UPSERT_PRODUCT_CODE' | 'UPSERT_BARCODE', rows: CompanyImportRow[]): Promise<ImportPreflightResult>;
  central(sourceId: string, rows: CentralImportRow[]): Promise<ImportPreflightResult>;
}
