import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventBus } from '@elhafez/events';
import type { AuditRequestedEvent } from '@elhafez/platform-contracts';
import type {
  AuditHistoryPage,
  AuditHistoryQuery,
  AuditReader,
  AuditReadScope,
} from '../../contracts';
import { AUDIT_REPOSITORY, type AuditRepository } from './audit.repository';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? (value as number) : fallback;
}

@Injectable()
export class AuditService implements OnModuleInit, OnModuleDestroy, AuditReader {
  private unsubscribe?: () => void;

  constructor(
    @Inject(AUDIT_REPOSITORY) private readonly repo: AuditRepository,
    private readonly events: EventBus,
  ) {}

  onModuleInit() {
    this.unsubscribe = this.events.subscribe<AuditRequestedEvent>('platform.audit.requested', (event) =>
      this.repo.append(event).then(() => undefined),
    );
  }

  onModuleDestroy() {
    this.unsubscribe?.();
  }

  list(limit = 100, filter?: { companyId?: string; branchId?: string }) {
    return this.repo.list(Math.min(Math.max(limit, 1), 500), filter);
  }

  async getEntityHistory(query: AuditHistoryQuery, scope: AuditReadScope): Promise<AuditHistoryPage> {
    const page = positiveInteger(query.page, 1);
    const requestedPageSize = positiveInteger(query.pageSize, DEFAULT_PAGE_SIZE);
    const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
    const empty = (): AuditHistoryPage => ({ items: [], page, pageSize, total: 0 });

    const companyId = scope.companyId?.trim();
    const hasBranchScope = scope.branchId !== undefined;
    const branchId = scope.branchId?.trim();
    const entityType = query.entityType.trim();
    const entityId = query.entityId.trim();

    // The public Business Module reader never treats an omitted company as global authority.
    // A global/platform audit reader would require a separate explicitly authorized contract.
    if (!companyId || (hasBranchScope && !branchId) || !entityType || !entityId) return empty();

    const result = await this.repo.getEntityHistory({
      entityType,
      entityId,
      companyId,
      ...(branchId ? { branchId } : {}),
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return { items: result.items, page, pageSize, total: result.total };
  }
}
