import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '@elhafez/events';
import { ConflictError, NotFoundError } from '@elhafez/errors';
import type { AuditRequestedEvent } from '@elhafez/platform-contracts';
import type { CompanyIdentity, CompanyStatus, CompanyStatusReader, CompanyView } from '../../contracts';
import { COMPANY_REPOSITORY, type CompanyRepository } from './company.repository';
@Injectable()
export class CompaniesService implements CompanyStatusReader {
  constructor(@Inject(COMPANY_REPOSITORY) private readonly repo: CompanyRepository, private readonly events: EventBus) {}
  list(): Promise<CompanyView[]> { return this.repo.list(); }
  getCompany(id: string): Promise<CompanyIdentity | null> { return this.repo.findById(id); }
  async create(input: { code: string; name: string }, actorId?: string): Promise<CompanyView> { const code=input.code.toUpperCase(); if (await this.repo.findByCode(code)) throw new ConflictError('Company code already exists'); const row=await this.repo.create({ ...input, code }); await this.audit('company.created', row.id, actorId, undefined, row); return row; }
  async setStatus(id: string, status: CompanyStatus, actorId?: string): Promise<CompanyView> { const before=await this.repo.findById(id); if(!before) throw new NotFoundError('Company not found'); const row=await this.repo.setStatus(id,status); if(!row) throw new NotFoundError('Company not found'); await this.audit('company.status.changed',id,actorId,before,row); return row; }
  private audit(action:string, entityId:string, actorId?:string, before?:unknown, after?:unknown): Promise<void> { const event: AuditRequestedEvent={type:'platform.audit.requested',occurredAt:new Date().toISOString(),actorId,companyId:entityId,entityType:'company',entityId,action,before,after}; return this.events.publish(event); }
}
