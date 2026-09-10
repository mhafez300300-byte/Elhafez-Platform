import { DynamicModule, Module, ModuleMetadata } from '@nestjs/common';
import { BRANCH_STATUS_READER } from './contracts';
import { BranchesService } from './backend/application/branches.service';
import { BRANCH_REPOSITORY } from './backend/application/branch.repository';
import { PrismaBranchRepository } from './backend/infrastructure/prisma-branch.repository';
import { BranchesController } from './backend/api/branches.controller';
@Module({})
export class BranchesModule { static register(imports:NonNullable<ModuleMetadata['imports']>):DynamicModule{return{module:BranchesModule,imports,controllers:[BranchesController],providers:[BranchesService,{provide:BRANCH_REPOSITORY,useClass:PrismaBranchRepository},{provide:BRANCH_STATUS_READER,useExisting:BranchesService}],exports:[BranchesService,BRANCH_STATUS_READER]};} }
