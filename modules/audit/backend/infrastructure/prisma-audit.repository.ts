import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@elhafez/database';
import type { AuditRequestedEvent } from '@elhafez/platform-contracts';
import type { AuditRecordView } from '../../contracts';
import type { AuditRepository } from '../application/audit.repository';

type AuditRow = {
  id: string;
  actorId: string | null;
  companyId: string | null;
  branchId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  beforeData: unknown;
  afterData: unknown;
  metadata: unknown;
  requestId: string | null;
  occurredAt: Date;
  createdAt: Date;
};

const map = (row: AuditRow): AuditRecordView => ({
  id: row.id,
  actorId: row.actorId,
  companyId: row.companyId,
  branchId: row.branchId,
  entityType: row.entityType,
  entityId: row.entityId,
  action: row.action,
  before: row.beforeData,
  after: row.afterData,
  metadata: row.metadata,
  requestId: row.requestId,
  occurredAt: row.occurredAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
});

function toPrismaJson(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;

  const serialized = JSON.stringify(value);
  if (serialized === undefined) return undefined;
  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

@Injectable()
export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async append(event: AuditRequestedEvent) {
    const row = await this.prisma.coreAuditRecord.create({
      data: {
        actorId: event.actorId ?? null,
        companyId: event.companyId ?? null,
        branchId: event.branchId ?? null,
        entityType: event.entityType,
        entityId: event.entityId ?? null,
        action: event.action,
        beforeData: toPrismaJson(event.before),
        afterData: toPrismaJson(event.after),
        metadata: toPrismaJson(event.metadata),
        requestId: event.requestId ?? null,
        occurredAt: new Date(event.occurredAt),
      },
    });
    return map(row);
  }

  async list(limit: number, filter?: { companyId?: string; branchId?: string }) {
    const rows = await this.prisma.coreAuditRecord.findMany({
      where: {
        ...(filter?.companyId ? { companyId: filter.companyId } : {}),
        ...(filter?.branchId ? { branchId: filter.branchId } : {}),
      },
      take: limit,
      orderBy: { occurredAt: 'desc' },
    });
    return rows.map(map);
  }
}
