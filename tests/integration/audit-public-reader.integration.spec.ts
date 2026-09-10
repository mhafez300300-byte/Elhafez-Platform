import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RuntimeConfigModule } from '@elhafez/config';
import { DatabaseModule, PrismaService } from '@elhafez/database';
import { EventsModule } from '@elhafez/events';
import { AuditModule } from '@elhafez/audit';
import {
  AUDIT_READER,
  type AuditReadScope,
  type AuditReader,
} from '@elhafez/audit/contracts';

@Injectable()
class BusinessAuditConsumer {
  constructor(@Inject(AUDIT_READER) readonly audit: AuditReader) {}
}

@Module({
  imports: [RuntimeConfigModule, DatabaseModule, EventsModule, AuditModule],
  providers: [BusinessAuditConsumer],
})
class PublicAuditReaderCompositionRoot {}

describe('Audit public reader collaboration contract', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let reader: AuditReader;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [PublicAuditReaderCompositionRoot] }).compile();
    prisma = moduleRef.get(PrismaService);
    reader = moduleRef.get(BusinessAuditConsumer).audit;
  });

  beforeEach(async () => {
    await prisma.coreAuditRecord.deleteMany();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  async function seedAudit(input: {
    companyId?: string;
    branchId?: string;
    entityType?: string;
    entityId?: string;
    action?: string;
    occurredAt?: Date;
    createdAt?: Date;
  } = {}) {
    return prisma.coreAuditRecord.create({
      data: {
        companyId: input.companyId ?? null,
        branchId: input.branchId ?? null,
        actorId: null,
        entityType: input.entityType ?? 'probe',
        entityId: input.entityId ?? 'entity-1',
        action: input.action ?? 'probe.changed',
        requestId: null,
        occurredAt: input.occurredAt ?? new Date(),
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      },
    });
  }

  async function history(
    entityType: string,
    entityId: string,
    scope: AuditReadScope,
    page?: number,
    pageSize?: number,
  ) {
    return reader.getEntityHistory({ entityType, entityId, page, pageSize }, scope);
  }

  it('returns only entity-specific history through the public reader and exposes the safe DTO shape', async () => {
    const companyId = randomUUID();
    await seedAudit({ companyId, entityType: 'customer', entityId: 'customer-1', action: 'customer.created' });
    await seedAudit({ companyId, entityType: 'customer', entityId: 'customer-2', action: 'customer.created' });
    await seedAudit({ companyId, entityType: 'supplier', entityId: 'customer-1', action: 'supplier.created' });

    const page = await history('customer', 'customer-1', { companyId });

    expect(page).toMatchObject({ page: 1, pageSize: 25, total: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      companyId,
      entityType: 'customer',
      entityId: 'customer-1',
      action: 'customer.created',
    });
    expect(Object.keys(page.items[0]!).sort()).toEqual([
      'action',
      'actorId',
      'after',
      'before',
      'branchId',
      'companyId',
      'createdAt',
      'entityId',
      'entityType',
      'id',
      'metadata',
      'occurredAt',
      'requestId',
    ].sort());
    expect(page.items[0]).not.toHaveProperty('beforeData');
    expect(page.items[0]).not.toHaveProperty('afterData');
  });

  it('enforces company isolation and does not disclose foreign-company history', async () => {
    const companyA = randomUUID();
    const companyB = randomUUID();
    const companyWithoutHistory = randomUUID();
    await seedAudit({ companyId: companyA, entityType: 'entity', entityId: 'shared-id', action: 'company-a' });
    await seedAudit({ companyId: companyB, entityType: 'entity', entityId: 'shared-id', action: 'company-b' });

    const a = await history('entity', 'shared-id', { companyId: companyA });
    expect(a.total).toBe(1);
    expect(a.items.map((item) => item.action)).toEqual(['company-a']);

    const none = await history('entity', 'shared-id', { companyId: companyWithoutHistory });
    expect(none).toEqual({ items: [], page: 1, pageSize: 25, total: 0 });
  });

  it('re-applies branch isolation while company scope can read its own company-wide history', async () => {
    const companyId = randomUUID();
    const branchA = randomUUID();
    const branchB = randomUUID();
    await seedAudit({ companyId, entityType: 'entity', entityId: 'branch-probe', action: 'company-level' });
    await seedAudit({ companyId, branchId: branchA, entityType: 'entity', entityId: 'branch-probe', action: 'branch-a' });
    await seedAudit({ companyId, branchId: branchB, entityType: 'entity', entityId: 'branch-probe', action: 'branch-b' });

    const branch = await history('entity', 'branch-probe', { companyId, branchId: branchA });
    expect(branch.total).toBe(1);
    expect(branch.items.map((item) => item.action)).toEqual(['branch-a']);

    const company = await history('entity', 'branch-probe', { companyId });
    expect(company.total).toBe(3);
    expect(company.items.every((item) => item.companyId === companyId)).toBe(true);
  });

  it('never converts omitted company scope or branch-only scope into global access', async () => {
    const companyId = randomUUID();
    const branchId = randomUUID();
    await seedAudit({ entityType: 'entity', entityId: 'global-record', action: 'global' });
    await seedAudit({ companyId, branchId, entityType: 'entity', entityId: 'global-record', action: 'branch' });

    expect(await history('entity', 'global-record', {})).toEqual({ items: [], page: 1, pageSize: 25, total: 0 });
    expect(await history('entity', 'global-record', { branchId })).toEqual({ items: [], page: 1, pageSize: 25, total: 0 });
  });

  it('uses bounded server-side pagination and deterministic ordering', async () => {
    const companyId = randomUUID();
    const timestamp = new Date('2026-09-10T10:00:00.000Z');
    const rows = Array.from({ length: 105 }, (_, index) => {
      const sequence = index + 1;
      return {
        id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
        actorId: null,
        companyId,
        branchId: null,
        entityType: 'pagination-probe',
        entityId: 'same-entity',
        action: `event-${sequence}`,
        requestId: null,
        occurredAt: timestamp,
        createdAt: timestamp,
      };
    });
    await prisma.coreAuditRecord.createMany({ data: rows });

    const first = await history('pagination-probe', 'same-entity', { companyId }, 1, 500);
    expect(first.pageSize).toBe(100);
    expect(first.total).toBe(105);
    expect(first.items).toHaveLength(100);
    expect(first.items[0]?.id).toBe('00000000-0000-4000-8000-000000000105');
    expect(first.items[99]?.id).toBe('00000000-0000-4000-8000-000000000006');

    const second = await history('pagination-probe', 'same-entity', { companyId }, 2, 100);
    expect(second.items).toHaveLength(5);
    expect(second.items.map((item) => item.id)).toEqual([
      '00000000-0000-4000-8000-000000000005',
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001',
    ]);
  });

  it('normalizes invalid pagination values without ever widening scope', async () => {
    const companyId = randomUUID();
    await seedAudit({ companyId, entityType: 'entity', entityId: 'page-defaults' });

    const page = await history('entity', 'page-defaults', { companyId }, 0, -1);
    expect(page).toMatchObject({ page: 1, pageSize: 25, total: 1 });
  });
});
