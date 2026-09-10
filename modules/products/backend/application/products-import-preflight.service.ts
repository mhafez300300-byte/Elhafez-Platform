import { Inject, Injectable } from '@nestjs/common';
import { ValidationError } from '@elhafez/errors';
import type { CentralImportRow, CompanyImportRow } from './products.repository';
import { PRODUCTS_IMPORT_PREFLIGHT_REPOSITORY, type ProductsImportPreflightRepository } from './products-import-preflight.repository';

@Injectable()
export class ProductsImportPreflightService {
  constructor(@Inject(PRODUCTS_IMPORT_PREFLIGHT_REPOSITORY) private readonly repository: ProductsImportPreflightRepository) {}

  company(companyId: string, mode: 'CREATE_ONLY' | 'UPSERT_PRODUCT_CODE' | 'UPSERT_BARCODE', rows: CompanyImportRow[]) {
    if (rows.length === 0 || rows.length > 500) throw new ValidationError('Preflight chunk requires 1 to 500 rows');
    return this.repository.company(companyId, mode, rows);
  }

  central(sourceId: string, rows: CentralImportRow[]) {
    if (rows.length === 0 || rows.length > 500) throw new ValidationError('Central preflight chunk requires 1 to 500 rows');
    return this.repository.central(sourceId, rows);
  }
}
