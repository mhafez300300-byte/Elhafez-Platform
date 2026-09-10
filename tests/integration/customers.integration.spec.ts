import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '@elhafez/database';
import { createTestApp, resetDatabase } from './test-app';

type Session = { accessToken: string; userId: string };

describe('customers integration and API', () => {
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
    const company = await prisma.coreCompany.create({ data: { code: 'CUST-UAT', name: 'Customers UAT' } });
    companyId = company.id;
    admin = await createSession('customers-admin@example.com', true);
  });

  afterAll(() => app.close());

  async function createSession(email: string, platformAdmin: boolean): Promise<Session> {
    const user = await prisma.coreUser.create({ data: { email, displayName: email, platformAdmin } });
    await prisma.coreAuthCredential.create({
      data: { userId: user.id, login: email, passwordHash: await bcrypt.hash('StrongPassword123!', 12) },
    });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ login: email, password: 'StrongPassword123!' })
      .expect(201);
    return { accessToken: login.body.accessToken as string, userId: user.id };
  }

  function scoped(session = admin, scopeCompanyId = companyId) {
    return { Authorization: `Bearer ${session.accessToken}`, 'x-company-id': scopeCompanyId };
  }

  async function createCustomer(
    key: string,
    body: Record<string, unknown> = { customerType: 'INDIVIDUAL', fullName: 'Ahmed Ali' },
    expected = 201,
  ) {
    return request(app.getHttpServer())
      .post('/api/customers')
      .set(scoped())
      .set('Idempotency-Key', key)
      .send(body)
      .expect(expected);
  }

  it('creates a customer without phone, supports initial address, and writes audit records', async () => {
    const response = await createCustomer('create-no-phone-001', {
      customerType: 'INDIVIDUAL',
      fullName: 'Ahmed Ali',
      nationalId: 'EG-1234',
      addresses: [{ label: 'Home', city: 'Cairo', isDefault: true }],
    });
    expect(response.body.customer.primaryPhone).toBeNull();
    expect(response.body.customer.addresses).toHaveLength(1);
    expect(response.body.customer.addresses[0].isDefault).toBe(true);
    const audits = await prisma.coreAuditRecord.findMany({ where: { entityId: response.body.customer.id } });
    expect(audits.map((row) => row.action)).toEqual(expect.arrayContaining(['customer.created', 'customer.address-created']));
  });

  it('is idempotent for retries and double-submit races', async () => {
    const body = { customerType: 'INDIVIDUAL', fullName: 'Retry Customer', primaryPhone: '0100 123 4567' };
    const [a, b] = await Promise.all([
      request(app.getHttpServer()).post('/api/customers').set(scoped()).set('Idempotency-Key', 'same-request-001').send(body),
      request(app.getHttpServer()).post('/api/customers').set(scoped()).set('Idempotency-Key', 'same-request-001').send(body),
    ]);
    expect([a.status, b.status].every((status) => status === 201)).toBe(true);
    expect(a.body.customer.id).toBe(b.body.customer.id);
    expect(await prisma.customer.count({ where: { companyId } })).toBe(1);
    expect((await prisma.customer.findFirstOrThrow()).primaryPhone).toBe('01001234567');
  });

  it('warns on likely duplicates but hard-blocks company-scoped national/tax duplicates', async () => {
    await createCustomer('duplicate-source-001', {
      customerType: 'COMPANY', fullName: 'Acme Egypt', primaryPhone: '+20 100 555 0000', nationalId: 'NAT-1000', taxNumber: 'TAX-2000',
    });
    const warning = await request(app.getHttpServer())
      .post('/api/customers/duplicates')
      .set(scoped())
      .send({ customerType: 'COMPANY', fullName: 'Different Name', primaryPhone: '+201005550000', nationalId: 'NAT1000' })
      .expect(201);
    expect(warning.body).toHaveLength(1);
    const phoneDuplicate = await createCustomer('duplicate-phone-002', {
      customerType: 'INDIVIDUAL', fullName: 'Another Person', primaryPhone: '+20-100-555-0000',
    });
    expect(phoneDuplicate.body.customer.id).toBeTruthy();
    await createCustomer('duplicate-national-003', {
      customerType: 'INDIVIDUAL', fullName: 'Blocked Strong Duplicate', nationalId: 'NAT 1000',
    }, 409);
    await createCustomer('duplicate-tax-004', {
      customerType: 'COMPANY', fullName: 'Blocked Tax Duplicate', taxNumber: 'tax-2000',
    }, 409);
  });

  it('keeps strong identifiers isolated per company and blocks cross-company reads', async () => {
    const first = await createCustomer('company-a-strong-001', {
      customerType: 'INDIVIDUAL', fullName: 'Company A Customer', nationalId: 'SAME-9000',
    });
    const otherCompany = await prisma.coreCompany.create({ data: { code: 'CUST-OTHER', name: 'Other Company' } });
    await request(app.getHttpServer())
      .post('/api/customers')
      .set(scoped(admin, otherCompany.id))
      .set('Idempotency-Key', 'company-b-strong-001')
      .send({ customerType: 'INDIVIDUAL', fullName: 'Company B Customer', nationalId: 'SAME9000' })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/customers/${first.body.customer.id}`)
      .set(scoped(admin, otherCompany.id))
      .expect(404);
  });

  it('supports search, filters, pagination, and hides archived customers by default', async () => {
    const category = await request(app.getHttpServer())
      .post('/api/customers/categories').set(scoped()).send({ name: 'VIP' }).expect(201);
    const tag = await request(app.getHttpServer())
      .post('/api/customers/tags').set(scoped()).send({ name: 'Wholesale' }).expect(201);
    const first = await createCustomer('filter-first-001', {
      customerType: 'COMPANY', fullName: 'Searchable Company', tradeName: 'Golden Trade', primaryPhone: '01001112222',
      email: 'gold@example.com', categoryId: category.body.id, tagIds: [tag.body.id],
      addresses: [{ governorate: 'Cairo', city: 'Nasr City', isDefault: true }],
    });
    await createCustomer('filter-second-002', { customerType: 'INDIVIDUAL', fullName: 'Other Person' });

    for (const query of [
      'search=Golden', 'search=01001112222', 'search=gold@example.com', `categoryId=${category.body.id}`,
      'governorate=Cairo&city=Nasr', `tagIds=${tag.body.id}`, 'customerType=COMPANY',
    ]) {
      const result = await request(app.getHttpServer()).get(`/api/customers?${query}`).set(scoped()).expect(200);
      expect(result.body.items.some((item: { id: string }) => item.id === first.body.customer.id)).toBe(true);
    }

    await request(app.getHttpServer())
      .patch(`/api/customers/${first.body.customer.id}/status`).set(scoped())
      .send({ status: 'ARCHIVED', version: first.body.customer.version }).expect(200);
    const operational = await request(app.getHttpServer()).get('/api/customers').set(scoped()).expect(200);
    expect(operational.body.items.some((item: { id: string }) => item.id === first.body.customer.id)).toBe(false);
    const archived = await request(app.getHttpServer()).get('/api/customers?status=ARCHIVED&page=1&pageSize=1').set(scoped()).expect(200);
    expect(archived.body.items).toHaveLength(1);
  });

  it('preserves sensitive fields on safe PATCH and rejects stale concurrent edits', async () => {
    const created = await createCustomer('patch-safe-001', {
      customerType: 'INDIVIDUAL', fullName: 'Sensitive Customer', nationalId: 'SENS-1000', taxNumber: 'SENS-2000', notes: 'before',
    });
    const version = created.body.customer.version as number;
    const safePatch = await request(app.getHttpServer())
      .patch(`/api/customers/${created.body.customer.id}`).set(scoped()).send({ version, notes: 'after' }).expect(200);
    expect(safePatch.body.notes).toBe('after');
    const sensitive = await prisma.customer.findFirstOrThrow({ where: { id: created.body.customer.id } });
    expect(sensitive.nationalId).toBe('SENS1000');
    expect(sensitive.taxNumber).toBe('SENS2000');

    const [a, b] = await Promise.all([
      request(app.getHttpServer()).patch(`/api/customers/${created.body.customer.id}`).set(scoped()).send({ version: safePatch.body.version, fullName: 'Concurrent A' }),
      request(app.getHttpServer()).patch(`/api/customers/${created.body.customer.id}`).set(scoped()).send({ version: safePatch.body.version, fullName: 'Concurrent B' }),
    ]);
    expect([a.status, b.status].sort((x, y) => x - y)).toEqual([200, 409]);
  });

  it('enforces lifecycle and archived edit rules', async () => {
    const created = await createCustomer('lifecycle-001', { customerType: 'INDIVIDUAL', fullName: 'Lifecycle Customer' });
    const archived = await request(app.getHttpServer())
      .patch(`/api/customers/${created.body.customer.id}/status`).set(scoped())
      .send({ status: 'ARCHIVED', version: created.body.customer.version }).expect(200);
    await request(app.getHttpServer())
      .patch(`/api/customers/${created.body.customer.id}`).set(scoped())
      .send({ version: archived.body.version, fullName: 'Forbidden Edit' }).expect(422);
    await request(app.getHttpServer())
      .patch(`/api/customers/${created.body.customer.id}/status`).set(scoped())
      .send({ status: 'SUSPENDED', version: archived.body.version }).expect(422);
    await request(app.getHttpServer())
      .patch(`/api/customers/${created.body.customer.id}/status`).set(scoped())
      .send({ status: 'ACTIVE', version: archived.body.version }).expect(200);
  });

  it('adds, edits, deactivates addresses and keeps exactly one active default under competing requests', async () => {
    const created = await createCustomer('address-001', {
      customerType: 'INDIVIDUAL', fullName: 'Address Customer', addresses: [{ label: 'Home', city: 'Cairo', isDefault: true }],
    });
    const customerId = created.body.customer.id as string;
    const second = await request(app.getHttpServer())
      .post(`/api/customers/${customerId}/addresses`).set(scoped()).send({ label: 'Work', city: 'Giza' }).expect(201);
    const edited = await request(app.getHttpServer())
      .patch(`/api/customers/${customerId}/addresses/${second.body.id}`).set(scoped())
      .send({ version: second.body.version, street: 'Tahrir Street' }).expect(200);
    expect(edited.body.city).toBe('Giza');

    const firstAddressId = created.body.customer.addresses[0].id as string;
    await Promise.all([
      request(app.getHttpServer()).post(`/api/customers/${customerId}/addresses/${firstAddressId}/default`).set(scoped()),
      request(app.getHttpServer()).post(`/api/customers/${customerId}/addresses/${second.body.id}/default`).set(scoped()),
    ]);
    expect(await prisma.customerAddress.count({ where: { customerId, active: true, isDefault: true } })).toBe(1);

    const latestSecond = await prisma.customerAddress.findFirstOrThrow({ where: { id: second.body.id } });
    await request(app.getHttpServer())
      .post(`/api/customers/${customerId}/addresses/${second.body.id}/deactivate`).set(scoped())
      .send({ version: latestSecond.version }).expect(201);
    expect((await prisma.customerAddress.findFirstOrThrow({ where: { id: second.body.id } })).active).toBe(false);
  });

  it('prevents cross-company classifications and rolls back the entire create', async () => {
    const otherCompany = await prisma.coreCompany.create({ data: { code: 'CUST-CLASS-B', name: 'Classification B' } });
    const otherCategory = await prisma.customerCategory.create({ data: { companyId: otherCompany.id, name: 'Other VIP', normalizedName: 'other vip' } });
    await createCustomer('bad-classification-001', {
      customerType: 'INDIVIDUAL', fullName: 'Must Roll Back', categoryId: otherCategory.id,
      addresses: [{ city: 'Cairo', isDefault: true }],
    }, 400);
    expect(await prisma.customer.count({ where: { companyId, fullName: 'Must Roll Back' } })).toBe(0);
    expect(await prisma.customerAddress.count()).toBe(0);
  });

  it('imports atomically, reports rejected rows, and replays successful import without duplicates', async () => {
    const rejected = await request(app.getHttpServer())
      .post('/api/customers/import').set(scoped()).set('Idempotency-Key', 'import-reject-001')
      .send({ rows: [
        { customerType: 'INDIVIDUAL', fullName: 'Import Good', nationalId: 'IMP-1000' },
        { customerType: 'INDIVIDUAL', fullName: 'Import Bad', email: 'not-an-email' },
      ] }).expect(201);
    expect(rejected.body.committed).toBe(false);
    expect(rejected.body.created).toBe(0);
    expect(await prisma.customer.count()).toBe(0);

    const payload = { rows: [
      { customerType: 'INDIVIDUAL', fullName: 'Import One', nationalId: 'IMP-2000', city: 'Cairo' },
      { customerType: 'COMPANY', fullName: 'Import Two', taxNumber: 'IMP-3000' },
    ] };
    const first = await request(app.getHttpServer())
      .post('/api/customers/import').set(scoped()).set('Idempotency-Key', 'import-success-001').send(payload).expect(201);
    expect(first.body).toMatchObject({ committed: true, created: 2, replayed: false });
    const replay = await request(app.getHttpServer())
      .post('/api/customers/import').set(scoped()).set('Idempotency-Key', 'import-success-001').send(payload).expect(201);
    expect(replay.body).toMatchObject({ committed: true, created: 2, replayed: true });
    expect(await prisma.customer.count()).toBe(2);
  });

  it('exports filtered non-sensitive customer data without leaking protected identifiers', async () => {
    await createCustomer('export-001', {
      customerType: 'INDIVIDUAL', fullName: 'Export Customer', primaryPhone: '01012345678', secondaryPhone: '01112345678',
      email: 'export@example.com', nationalId: 'PRIVATE-1000', notes: 'export note', addresses: [{ city: 'Cairo', street: 'Main', isDefault: true }],
    });
    const exported = await request(app.getHttpServer()).get('/api/customers/export?search=Export').set(scoped()).expect(200);
    expect(exported.body.count).toBe(1);
    expect(exported.body.csv).toContain('export@example.com');
    expect(exported.body.csv).toContain('export note');
    expect(exported.body.csv).not.toContain('PRIVATE1000');
  });

  it('enforces scoped permissions including sensitive-data separation', async () => {
    const created = await createCustomer('permission-target-001', {
      customerType: 'INDIVIDUAL', fullName: 'Permission Target', nationalId: 'PERM-1000',
    });
    const user = await createSession('scoped-customer@example.com', false);
    const role = await prisma.coreRole.create({ data: { key: 'customers-reader', name: 'Customers Reader', companyId } });
    const permission = await prisma.corePermission.create({ data: { key: 'customers.view', description: 'View customers' } });
    await prisma.coreRolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await prisma.coreUserRoleAssignment.create({
      data: { userId: user.userId, roleId: role.id, scopeType: 'COMPANY', companyId, branchId: null, scopeKey: `COMPANY:${companyId}` },
    });
    await request(app.getHttpServer()).get('/api/customers').set(scoped(user)).expect(200);
    await request(app.getHttpServer()).get(`/api/customers/${created.body.customer.id}/sensitive`).set(scoped(user)).expect(403);
    await request(app.getHttpServer()).post('/api/customers').set(scoped(user)).set('Idempotency-Key', 'permission-denied-001').send({ customerType: 'INDIVIDUAL', fullName: 'Denied' }).expect(403);

    const otherCompany = await prisma.coreCompany.create({ data: { code: 'CUST-PERM-B', name: 'Permission B' } });
    await request(app.getHttpServer()).get('/api/customers').set(scoped(user, otherCompany.id)).expect(403);
  });

  it('validates API input and default-address cardinality without partial persistence', async () => {
    await createCustomer('invalid-email-001', { customerType: 'INDIVIDUAL', fullName: 'Bad Email', email: 'bad' }, 400);
    await createCustomer('two-defaults-002', {
      customerType: 'INDIVIDUAL', fullName: 'Two Defaults',
      addresses: [{ city: 'Cairo', isDefault: true }, { city: 'Giza', isDefault: true }],
    }, 400);
    expect(await prisma.customer.count()).toBe(0);
  });
});
