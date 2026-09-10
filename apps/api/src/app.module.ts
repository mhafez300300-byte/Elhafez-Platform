import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { RuntimeConfigModule } from '@elhafez/config';
import { DatabaseModule } from '@elhafez/database';
import { TransactionsModule } from '@elhafez/transactions';
import { EventsModule } from '@elhafez/events';
import { LoggingModule } from '@elhafez/logging';
import { UnifiedErrorFilter } from '@elhafez/errors';
import { UsersModule } from '@elhafez/users';
import { CompaniesModule } from '@elhafez/companies';
import { RolesModule } from '@elhafez/roles';
import { BranchesModule } from '@elhafez/branches';
import { AuthModule, AccessTokenGuard } from '@elhafez/auth';
import { PermissionsModule, PermissionGuard } from '@elhafez/permissions';
import { AuditModule } from '@elhafez/audit';
import { FilesModule } from '@elhafez/files';
import { NotificationsModule } from '@elhafez/notifications';
import { CustomersModule } from '@elhafez/customers';
import { SuppliersModule } from '@elhafez/suppliers';
import { ProductsModule } from '@elhafez/products';
import { HealthController } from './health.controller';

const branches = BranchesModule.register([CompaniesModule]);
const auth = AuthModule.register([UsersModule]);
const permissions = PermissionsModule.register([UsersModule, RolesModule, CompaniesModule, branches]);
const notifications = NotificationsModule.register([UsersModule]);
const products = ProductsModule.register([FilesModule]);

@Module({
  imports: [
    RuntimeConfigModule,
    LoggingModule,
    DatabaseModule,
    TransactionsModule,
    EventsModule,
    UsersModule,
    CompaniesModule,
    RolesModule,
    branches,
    auth,
    permissions,
    AuditModule,
    FilesModule,
    notifications,
    CustomersModule,
    SuppliersModule,
    products,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: UnifiedErrorFilter },
    { provide: APP_GUARD, useExisting: AccessTokenGuard },
    { provide: APP_GUARD, useExisting: PermissionGuard },
  ],
})
export class AppModule {}
