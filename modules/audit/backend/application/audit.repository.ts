import type { AuditRequestedEvent } from '@elhafez/platform-contracts';
import type { AuditRecordView } from '../../contracts';

export interface AuditEntityHistoryRepositoryQuery {
  entityType: string;
  entityId: string;
  companyId: string;
  branchId?: string;
  skip: number;
  take: number;
}

export interface AuditEntityHistoryRepositoryResult {
  items: AuditRecordView[];
  total: number;
}

export interface AuditRepository {
  append(event: AuditRequestedEvent): Promise<AuditRecordView>;
  list(limit: number, filter?: { companyId?: string; branchId?: string }): Promise<AuditRecordView[]>;
  getEntityHistory(query: AuditEntityHistoryRepositoryQuery): Promise<AuditEntityHistoryRepositoryResult>;
}

export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY');
