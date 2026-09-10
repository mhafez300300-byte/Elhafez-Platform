import { Module } from '@nestjs/common';
import { SUPPLIER_READER } from './contracts';
import { SuppliersController } from './backend/api/suppliers.controller';
import { SuppliersPermissionRegistrar } from './backend/application/suppliers-permission.registrar';
import { SUPPLIERS_REPOSITORY } from './backend/application/suppliers.repository';
import { SuppliersService } from './backend/application/suppliers.service';
import { PrismaSuppliersRepository } from './backend/infrastructure/prisma-suppliers.repository';

@Module({
  controllers: [SuppliersController],
  providers: [
    SuppliersService,
    SuppliersPermissionRegistrar,
    { provide: SUPPLIERS_REPOSITORY, useClass: PrismaSuppliersRepository },
    { provide: SUPPLIER_READER, useExisting: SuppliersService },
  ],
  exports: [SUPPLIER_READER],
})
export class SuppliersModule {}

export { SuppliersService } from './backend/application/suppliers.service';
