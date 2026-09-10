import { Module } from '@nestjs/common';
import { AuditService } from './backend/application/audit.service';
import { AUDIT_REPOSITORY } from './backend/application/audit.repository';
import { PrismaAuditRepository } from './backend/infrastructure/prisma-audit.repository';
import { AuditController } from './backend/api/audit.controller';
@Module({controllers:[AuditController],providers:[AuditService,{provide:AUDIT_REPOSITORY,useClass:PrismaAuditRepository}],exports:[AuditService]})
export class AuditModule {}
