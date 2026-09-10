import { Module } from '@nestjs/common';
import { COMPANY_STATUS_READER } from './contracts';
import { CompaniesService } from './backend/application/companies.service';
import { COMPANY_REPOSITORY } from './backend/application/company.repository';
import { PrismaCompanyRepository } from './backend/infrastructure/prisma-company.repository';
import { CompaniesController } from './backend/api/companies.controller';
@Module({controllers:[CompaniesController],providers:[CompaniesService,{provide:COMPANY_REPOSITORY,useClass:PrismaCompanyRepository},{provide:COMPANY_STATUS_READER,useExisting:CompaniesService}],exports:[CompaniesService,COMPANY_STATUS_READER]})
export class CompaniesModule {}
