import { DynamicModule, Module, ModuleMetadata } from '@nestjs/common';
import { PERMISSION_CHECKER } from './contracts';
import { PermissionsService } from './backend/application/permissions.service';
import { PERMISSION_REPOSITORY } from './backend/application/permission.repository';
import { PrismaPermissionRepository } from './backend/infrastructure/prisma-permission.repository';
import { PermissionGuard } from './backend/api/permission.guard';
import { PermissionsController } from './backend/api/permissions.controller';
export { PermissionGuard } from './backend/api/permission.guard';
export { PermissionsService } from './backend/application/permissions.service';
@Module({})
export class PermissionsModule { static register(imports:NonNullable<ModuleMetadata['imports']>):DynamicModule{return{module:PermissionsModule,imports,controllers:[PermissionsController],providers:[PermissionsService,PermissionGuard,{provide:PERMISSION_REPOSITORY,useClass:PrismaPermissionRepository},{provide:PERMISSION_CHECKER,useExisting:PermissionsService}],exports:[PermissionsService,PermissionGuard,PERMISSION_CHECKER]};} }
