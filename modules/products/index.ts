import { DynamicModule, Module, ModuleMetadata } from '@nestjs/common';
import { PRODUCT_READER } from './contracts';
import { ProductsController } from './backend/api/products.controller';
import { ProductsAuditController } from './backend/api/products-audit.controller';
import { ProductsV1Controller } from './backend/api/products-v1.controller';
import { ProductsCentralQueryController } from './backend/api/products-central-query.controller';
import { ProductsImportPreflightController } from './backend/api/products-import-preflight.controller';
import { ProductsPermissionRegistrar } from './backend/application/products-permission.registrar';
import { PRODUCTS_REPOSITORY } from './backend/application/products.repository';
import { PRODUCTS_HARDENING_REPOSITORY } from './backend/application/products-hardening.repository';
import { PRODUCTS_CENTRAL_QUERY_REPOSITORY } from './backend/application/products-central-query.repository';
import { PRODUCTS_IMPORT_PREFLIGHT_REPOSITORY } from './backend/application/products-import-preflight.repository';
import { ProductsService } from './backend/application/products.service';
import { ProductsV1Service } from './backend/application/products-v1.service';
import { ProductsCentralQueryService } from './backend/application/products-central-query.service';
import { ProductsImportPreflightService } from './backend/application/products-import-preflight.service';
import { PrismaProductsV1Repository } from './backend/infrastructure/prisma-products-v1.repository';
import { PrismaProductsCentralQueryRepository } from './backend/infrastructure/prisma-products-central-query.repository';
import { PrismaProductsImportPreflightRepository } from './backend/infrastructure/prisma-products-import-preflight.repository';

@Module({})
export class ProductsModule {
  static register(imports: NonNullable<ModuleMetadata['imports']>): DynamicModule {
    return {
      module: ProductsModule,
      imports,
      controllers: [
        ProductsController,
        ProductsAuditController,
        ProductsV1Controller,
        ProductsCentralQueryController,
        ProductsImportPreflightController,
      ],
      providers: [
        ProductsPermissionRegistrar,
        PrismaProductsV1Repository,
        PrismaProductsCentralQueryRepository,
        PrismaProductsImportPreflightRepository,
        ProductsV1Service,
        ProductsCentralQueryService,
        ProductsImportPreflightService,
        { provide: PRODUCTS_REPOSITORY, useExisting: PrismaProductsV1Repository },
        { provide: PRODUCTS_HARDENING_REPOSITORY, useExisting: PrismaProductsV1Repository },
        { provide: PRODUCTS_CENTRAL_QUERY_REPOSITORY, useExisting: PrismaProductsCentralQueryRepository },
        { provide: PRODUCTS_IMPORT_PREFLIGHT_REPOSITORY, useExisting: PrismaProductsImportPreflightRepository },
        { provide: ProductsService, useExisting: ProductsV1Service },
        { provide: PRODUCT_READER, useExisting: ProductsV1Service },
      ],
      exports: [PRODUCT_READER],
    };
  }
}

export { ProductsService } from './backend/application/products.service';
export { ProductsV1Service } from './backend/application/products-v1.service';
