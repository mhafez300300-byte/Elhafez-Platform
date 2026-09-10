import { Injectable } from '@nestjs/common';
import type { PrismaService } from '@elhafez/database';
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
  importIngredients,
} from './prisma-products-combination-import';

@Injectable()
export class PrismaProductsFinalRepository extends PrismaProductsV1Repository {
  constructor(private readonly productsDb: PrismaService) {
    super(productsDb);
  }

  override async importCompanyRow(sessionId: string, mode: string, row: CompanyImportRow) {
    const ingredients = importIngredients(row);
    if (ingredients.length <= 1) return super.importCompanyRow(sessionId, mode, { ...row, ingredients });
    const result = await importCompanyCombinationRow(this.productsDb, sessionId, mode, { ...row, ingredients });
    const product = await this.get(result.companyId, result.productId);
    if (!product) throw new ProductClassificationError('Imported product disappeared after commit');
    return { status: result.status, product };
  }

  override async importCentralRow(sessionId: string, context: CentralImportContext, row: CentralImportRow) {
    const ingredients = importIngredients(row);
    if (ingredients.length <= 1) return super.importCentralRow(sessionId, context, { ...row, ingredients });
    const result = await importCentralCombinationRow(this.productsDb, context, { ...row, ingredients });
    const central = await this.getCentral(result.centralDrugId);
    if (!central) throw new ProductClassificationError('Imported central reference disappeared after commit');
    return {
      status: result.status,
      central,
      ...(result.reason ? { reason: result.reason } : {}),
    };
  }
}
