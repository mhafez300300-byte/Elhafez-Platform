export interface AuditRecordView {
  id: string;
  actorId: string | null;
  companyId: string | null;
  branchId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  before: unknown;
  after: unknown;
  metadata: unknown;
  requestId: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface AuditReadScope {
  companyId?: string;
  branchId?: string;
}

export interface AuditHistoryQuery {
  entityType: string;
  entityId: string;
  page?: number;
  pageSize?: number;
}

export interface AuditHistoryPage {
  items: AuditRecordView[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AuditReader {
  getEntityHistory(
    query: AuditHistoryQuery,
    scope: AuditReadScope,
  ): Promise<AuditHistoryPage>;
}

export const AUDIT_READER = Symbol('AUDIT_READER');
