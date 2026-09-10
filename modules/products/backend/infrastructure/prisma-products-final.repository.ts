import { Injectable } from '@nestjs/common';
import { PrismaService } from '@elhafez/database';
import type {
  CentralImportContext,
  CentralImportRow,
  CompanyImportRow,
} from '../application/products.repository';
import { ProductClassificationError } from '../application/products.repository';
import { PrismaProductsV1Repository } from './prisma-products-v1.repository';
import {
  importCentralCombinationRow,
  importCompanyCombinationRow,
} from './prisma-products-combination-import';

@Injectable()
export class PrismaProductsFinalRepository extends PrismaProductsV1Repository {
  constructor(private readonly productsDb: PrismaService) {
    super(productsDb);
  }

  override async importCompanyRow(sessionId: string, mode: string, row: CompanyImportRow) {
    const result = await importCompanyCombinationRow(this.productsDb, sessionId, mode, row);
    const product = await this.get(result.companyId, result.productId);
    if (!product) throw new ProductClassificationError('Imported product disappeared after commit');
    return { status: result.status, product };
  }

  override async importCentralRow(_sessionId: string, context: CentralImportContext, row: CentralImportRow) {
    const result = await importCentralCombinationRow(this.productsDb, context, row);
    const central = await this.getCentral(result.centralDrugId);
    if (!central) throw new ProductClassificationError('Imported central reference disappeared after commit');
    return {
      status: result.status,
      central,
      reason: result.reason,
    };
  }
}
