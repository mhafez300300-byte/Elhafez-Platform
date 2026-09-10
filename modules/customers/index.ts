import { Module } from '@nestjs/common';
import { CUSTOMER_READER } from './contracts';
import { CustomersController } from './backend/api/customers.controller';
import { CustomersService } from './backend/application/customers.service';
import { CustomersPermissionRegistrar } from './backend/application/customers-permission.registrar';
import { CUSTOMERS_REPOSITORY } from './backend/application/customers.repository';
import { PrismaCustomersRepository } from './backend/infrastructure/prisma-customers.repository';

@Module({
  controllers: [CustomersController],
  providers: [
    CustomersService,
    CustomersPermissionRegistrar,
    { provide: CUSTOMERS_REPOSITORY, useClass: PrismaCustomersRepository },
    { provide: CUSTOMER_READER, useExisting: CustomersService },
  ],
  exports: [CUSTOMER_READER],
})
export class CustomersModule {}

export { CustomersService } from './backend/application/customers.service';
