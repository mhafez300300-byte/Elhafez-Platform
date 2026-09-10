import { Module } from '@nestjs/common';
import { ROLE_STATUS_READER } from './contracts';
import { RolesService } from './backend/application/roles.service';
import { ROLE_REPOSITORY } from './backend/application/role.repository';
import { PrismaRoleRepository } from './backend/infrastructure/prisma-role.repository';
import { RolesController } from './backend/api/roles.controller';
@Module({controllers:[RolesController],providers:[RolesService,{provide:ROLE_REPOSITORY,useClass:PrismaRoleRepository},{provide:ROLE_STATUS_READER,useExisting:RolesService}],exports:[RolesService,ROLE_STATUS_READER]})
export class RolesModule {}
