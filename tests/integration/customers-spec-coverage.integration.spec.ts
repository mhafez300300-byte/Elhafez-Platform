import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '@elhafez/database';
import { createTestApp, resetDatabase } from './test-app';

type Session = { accessToken: string; userId: string };

describe('customers approved specification coverage', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let companyId: string;
  let admin: Session;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    companyId = (await prisma.coreCompany.create({ data: { code: 'CUST-SPEC', name: 'Customers Spec Coverage' } })).id;
    admin = await createSession('customers-spec-admin@example.com', true);
  });

  afterAll(() => app.close());

  async function createSession(email: string, platformAdmin: boolean): Promise<Session> {
    const user = await prisma.coreUser.create({ data: { email, displayName: email, platformAdmin } });
    await prisma.coreAuthCredential.create({
      data: { userId: user.id, login: email, passwordHash: await bcrypt.hash('StrongPassword123!', 12) },
    });
    const login = await request(app.getHttpServer()).post('/api/auth/login')
      .send({ login: email, password: 'StrongPassword123!' }).expect(201);
    return { accessToken: login.body.accessToken as string, userId: user.id };
  }

  function headers(session = admin) {
    return { Authorization: `Bearer ${session.accessToken}`, 'x-company-id': companyId };
  }

  it('supports Quick Add with optional phone, normalization, idempotency, and audit', async () => {
    const first = await request(app.getHttpServer()).post('/api/customers/quick').set(headers())
      .set('Idempotency-Key', 'quick-add-spec-001')
      .send({ fullName: 'Quick Customer', primaryPhone: '0100 222 3344' }).expect(201);
    const replay = await request(app.getHttpServer()).post('/api/customers/quick').set(headers())
      .set('Idempotency-Key', 'quick-add-spec-001')
      .send({ fullName: 'Quick Customer', primaryPhone: '0100 222 3344' }).expect(201);
    expect(replay.body.customer.id).toBe(first.body.customer.id);
    expect((await prisma.customer.findFirstOrThrow({ where: { id: first.body.customer.id } })).primaryPhone).toBe('01002223344');
    expect(await prisma.coreAuditRecord.count({ where: { entityId: first.body.customer.id, action: 'customer.created' } })).toBeGreaterThan(0);
  });

  it('searches by every approved customer identifier and supports creation-date filtering', async () => {
    const created = await request(app.getHttpServer()).post('/api/customers').set(headers())
      .set('Idempotency-Key', 'search-all-spec-001')
      .send({
        customerType: 'COMPANY', fullName: 'Search Matrix Customer', tradeName: 'Matrix Trading',
        primaryPhone: '01011112222', secondaryPhone: '01133334444', whatsappPhone: '01255556666',
        email: 'matrix@example.com', nationalId: 'NAT-7788', taxNumber: 'TAX-9911',
      }).expect(201);
    const customer = created.body.customer as { id: string; customerCode: string };
    const searches = [
      'Search Matrix', 'Matrix Trading', '01011112222', '01133334444', '01255556666',
      'matrix@example.com', 'NAT7788', 'TAX9911', customer.customerCode,
    ];
    for (const value of searches) {
      const result = await request(app.getHttpServer()).get(`/api/customers?search=${encodeURIComponent(value)}`).set(headers()).expect(200);
      expect(result.body.items.some((item: { id: string }) => item.id === customer.id), value).toBe(true);
    }
    const dated = await request(app.getHttpServer())
      .get('/api/customers?createdFrom=2020-01-01&createdTo=2030-12-31').set(headers()).expect(200);
    expect(dated.body.items.some((item: { id: string }) => item.id === customer.id)).toBe(true);
  });

  it('creates, renames, deactivates, and reactivates customer categories and tags with audit', async () => {
    for (const kind of ['categories', 'tags'] as const) {
      const created = await request(app.getHttpServer()).post(`/api/customers/${kind}`).set(headers())
        .send({ name: kind === 'categories' ? 'Retail' : 'Priority' }).expect(201);
      const renamed = await request(app.getHttpServer()).patch(`/api/customers/${kind}/${created.body.id}`).set(headers())
        .send({ name: `${created.body.name} Updated`, active: false }).expect(200);
      expect(renamed.body.active).toBe(false);
      const list = await request(app.getHttpServer()).get(`/api/customers/${kind}?includeInactive=true`).set(headers()).expect(200);
      expect(list.body.find((item: { id: string }) => item.id === created.body.id)).toMatchObject({ active: false });
      const reactivated = await request(app.getHttpServer()).patch(`/api/customers/${kind}/${created.body.id}`).set(headers())
        .send({ name: renamed.body.name, active: true }).expect(200);
      expect(reactivated.body.active).toBe(true);
    }
    const actions = (await prisma.coreAuditRecord.findMany({ where: { companyId } })).map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining([
      'customer.classification-category-created', 'customer.classification-category-updated',
      'customer.classification-tag-created', 'customer.classification-tag-updated',
    ]));
  });

  it('requires dedicated import/export permissions instead of customers.view', async () => {
    const reader = await createSession('customers-spec-reader@example.com', false);
    const role = await prisma.coreRole.create({ data: { key: 'customers-spec-reader', name: 'Customers Spec Reader', companyId } });
    const viewPermission = await prisma.corePermission.create({
      data: { key: 'customers.view', description: 'View customers in an authorized scope' },
    });
    await prisma.coreRolePermission.create({ data: { roleId: role.id, permissionId: viewPermission.id } });
    await prisma.coreUserRoleAssignment.create({
      data: { userId: reader.userId, roleId: role.id, scopeType: 'COMPANY', companyId, branchId: null, scopeKey: `COMPANY:${companyId}` },
    });
    await request(app.getHttpServer()).get('/api/customers').set(headers(reader)).expect(200);
    await request(app.getHttpServer()).get('/api/customers/export').set(headers(reader)).expect(403);
    await request(app.getHttpServer()).post('/api/customers/import').set(headers(reader))
      .set('Idempotency-Key', 'permission-import-001')
      .send({ rows: [{ customerType: 'INDIVIDUAL', fullName: 'Denied Import' }] }).expect(403);
  });
});
