import { DynamicModule, Module, ModuleMetadata } from '@nestjs/common';
import { PRODUCT_READER } from './contracts';
import { ProductsController } from './backend/api/products.controller';
import { ProductsAuditController } from './backend/api/products-audit.controller';
import { ProductsV1Controller } from './backend/api/products-v1.controller';
import { ProductsPermissionRegistrar } from './backend/application/products-permission.registrar';
import { PRODUCTS_REPOSITORY } from './backend/application/products.repository';
import { PRODUCTS_HARDENING_REPOSITORY } from './backend/application/products-hardening.repository';
import { ProductsService } from './backend/application/products.service';
import { ProductsV1Service } from './backend/application/products-v1.service';
import { PrismaProductsV1Repository } from './backend/infrastructure/prisma-products-v1.repository';

@Module({})
export class ProductsModule {
  static register(imports: NonNullable<ModuleMetadata['imports']>): DynamicModule {
    return {
      module: ProductsModule,
      imports,
      controllers: [ProductsController, ProductsAuditController, ProductsV1Controller],
      providers: [
        ProductsPermissionRegistrar,
        PrismaProductsV1Repository,
        ProductsV1Service,
        { provide: PRODUCTS_REPOSITORY, useExisting: PrismaProductsV1Repository },
        { provide: PRODUCTS_HARDENING_REPOSITORY, useExisting: PrismaProductsV1Repository },
        { provide: ProductsService, useExisting: ProductsV1Service },
        { provide: PRODUCT_READER, useExisting: ProductsV1Service },
      ],
      exports: [PRODUCT_READER],
    };
  }
}

export { ProductsService } from './backend/application/products.service';
export { ProductsV1Service } from './backend/application/products-v1.service';
