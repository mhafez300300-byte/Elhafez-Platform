import { DynamicModule, Module, ModuleMetadata } from '@nestjs/common';
import { PRODUCT_READER } from './contracts';
import { ProductsController } from './backend/api/products.controller';
import { ProductsPermissionRegistrar } from './backend/application/products-permission.registrar';
import { PRODUCTS_REPOSITORY } from './backend/application/products.repository';
import { ProductsService } from './backend/application/products.service';
import { PrismaProductsRepository } from './backend/infrastructure/prisma-products.repository';

@Module({})
export class ProductsModule {
  static register(imports: NonNullable<ModuleMetadata['imports']>): DynamicModule {
    return {
      module: ProductsModule,
      imports,
      controllers: [ProductsController],
      providers: [
        ProductsService,
        ProductsPermissionRegistrar,
        { provide: PRODUCTS_REPOSITORY, useClass: PrismaProductsRepository },
        { provide: PRODUCT_READER, useExisting: ProductsService },
      ],
      exports: [PRODUCT_READER],
    };
  }
}

export { ProductsService } from './backend/application/products.service';
