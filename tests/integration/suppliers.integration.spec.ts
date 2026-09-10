import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '@elhafez/database';
import { createTestApp, resetDatabase } from './test-app';

type Session = { accessToken: string; userId: string };

describe('suppliers integration and API', () => {
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
    const company = await prisma.coreCompany.create({ data: { code: 'SUP-UAT', name: 'Suppliers UAT' } });
    companyId = company.id;
    admin = await createSession('suppliers-admin@example.com', true);
  });

  afterAll(() => app.close());

  async function createSession(email: string, platformAdmin: boolean): Promise<Session> {
    const user = await prisma.coreUser.create({ data: { email, displayName: email, platformAdmin } });
    await prisma.coreAuthCredential.create({ data: { userId: user.id, login: email, passwordHash: await bcrypt.hash('StrongPassword123!', 12) } });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ login: email, password: 'StrongPassword123!' }).expect(201);
    return { accessToken: login.body.accessToken as string, userId: user.id };
  }

  function scoped(session = admin, scopeCompanyId = companyId) {
    return { Authorization: `Bearer ${session.accessToken}`, 'x-company-id': scopeCompanyId };
  }

  async function createSupplier(
    key: string,
    body: Record<string, unknown> = { supplierType: 'COMPANY', legalName: 'Acme Supplier' },
    expected = 201,
  ) {
    return request(app.getHttpServer()).post('/api/suppliers').set(scoped()).set('Idempotency-Key', key).send(body).expect(expected);
  }

  it('creates supplier, default address and primary contact atomically and writes audit records', async () => {
    const response = await createSupplier('supplier-create-001', {
      supplierType: 'COMPANY', legalName: 'Acme Egypt', primaryPhone: '0100 123 4567', website: 'https://example.com',
      nationalId: 'NAT-1000', taxNumber: 'TAX-1000', commercialRegistration: 'CR-1000',
      addresses: [{ label: 'HQ', city: 'Cairo', isDefault: true }],
      contacts: [{ name: 'Ahmed Buyer', jobTitle: 'Purchasing Manager', phone: '0111 222 3333', isPrimary: true }],
    });
    expect(response.body.supplier.primaryPhone).toBe('01001234567');
    expect(response.body.supplier.addresses[0].isDefault).toBe(true);
    expect(response.body.supplier.contacts[0].isPrimary).toBe(true);
    const audits = await prisma.coreAuditRecord.findMany({ where: { entityId: response.body.supplier.id } });
    expect(audits.map((row) => row.action)).toEqual(expect.arrayContaining(['supplier.created', 'supplier.address-created', 'supplier.contact-created']));
  });

  it('rejects multiple initial defaults or primary contacts without partial rows', async () => {
    await createSupplier('supplier-invalid-atomic-001', {
      supplierType: 'COMPANY', legalName: 'Must Roll Back',
      addresses: [{ city: 'Cairo', isDefault: true }, { city: 'Giza', isDefault: true }],
    }, 400);
    expect(await prisma.supplier.count({ where: { companyId } })).toBe(0);
    await createSupplier('supplier-invalid-atomic-002', {
      supplierType: 'COMPANY', legalName: 'Must Roll Back 2',
      contacts: [{ name: 'One', isPrimary: true }, { name: 'Two', isPrimary: true }],
    }, 400);
    expect(await prisma.supplier.count({ where: { companyId } })).toBe(0);
  });

  it('is idempotent for retries and double-submit races', async () => {
    const body = { supplierType: 'COMPANY', legalName: 'Retry Supplier', primaryPhone: '0100 123 4567' };
    const [a, b] = await Promise.all([
      request(app.getHttpServer()).post('/api/suppliers').set(scoped()).set('Idempotency-Key', 'same-supplier-request-001').send(body),
      request(app.getHttpServer()).post('/api/suppliers').set(scoped()).set('Idempotency-Key', 'same-supplier-request-001').send(body),
    ]);
    expect([a.status, b.status].every((value) => value === 201)).toBe(true);
    expect(a.body.supplier.id).toBe(b.body.supplier.id);
    expect(await prisma.supplier.count({ where: { companyId } })).toBe(1);
  });

  it('warns on soft duplicates and hard-blocks all strong company-scoped identifiers', async () => {
    await createSupplier('duplicate-source-001', {
      supplierType: 'COMPANY', legalName: 'Golden Distributor', primaryPhone: '+20 100 555 0000', email: 'sales@golden.example',
      nationalId: 'NAT-2000', taxNumber: 'TAX-2000', commercialRegistration: 'CR-2000',
    });
    const warning = await request(app.getHttpServer()).post('/api/suppliers/duplicates').set(scoped()).send({
      supplierType: 'COMPANY', legalName: 'Different Name', primaryPhone: '+201005550000', email: 'sales@golden.example',
    }).expect(201);
    expect(warning.body).toHaveLength(1);
    await createSupplier('duplicate-national-002', { supplierType: 'COMPANY', legalName: 'Blocked NID', nationalId: 'NAT 2000' }, 409);
    await createSupplier('duplicate-tax-003', { supplierType: 'COMPANY', legalName: 'Blocked TAX', taxNumber: 'tax-2000' }, 409);
    await createSupplier('duplicate-cr-004', { supplierType: 'COMPANY', legalName: 'Blocked CR', commercialRegistration: 'cr 2000' }, 409);
  });

  it('isolates strong identifiers and reads by company scope', async () => {
    const first = await createSupplier('company-a-strong-001', { supplierType: 'COMPANY', legalName: 'Company A Supplier', taxNumber: 'SAME-9000' });
    const otherCompany = await prisma.coreCompany.create({ data: { code: 'SUP-OTHER', name: 'Other Company' } });
    await request(app.getHttpServer()).post('/api/suppliers').set(scoped(admin, otherCompany.id)).set('Idempotency-Key', 'company-b-strong-001')
      .send({ supplierType: 'COMPANY', legalName: 'Company B Supplier', taxNumber: 'SAME9000' }).expect(201);
    await request(app.getHttpServer()).get(`/api/suppliers/${first.body.supplier.id}`).set(scoped(admin, otherCompany.id)).expect(404);
  });

  it('supports search/filter/pagination including contact data and hides archived by default', async () => {
    const category = await request(app.getHttpServer()).post('/api/suppliers/categories').set(scoped()).send({ name: 'Distributor' }).expect(201);
    const tag = await request(app.getHttpServer()).post('/api/suppliers/tags').set(scoped()).send({ name: 'Preferred' }).expect(201);
    const first = await createSupplier('filter-first-001', {
      supplierType: 'COMPANY', legalName: 'Searchable Supplier', tradeName: 'Golden Trade', primaryPhone: '01001112222', email: 'gold@example.com',
      categoryId: category.body.id, tagIds: [tag.body.id], addresses: [{ governorate: 'Cairo', city: 'Nasr City', isDefault: true }],
      contacts: [{ name: 'Mona Purchasing', email: 'mona@golden.example', isPrimary: true }],
    });
    await createSupplier('filter-second-002', { supplierType: 'INDIVIDUAL', legalName: 'Other Supplier' });
    for (const query of [
      'search=Golden', 'search=01001112222', 'search=mona@golden.example', 'search=Mona Purchasing', `categoryId=${category.body.id}`,
      'governorate=Cairo&city=Nasr', `tagIds=${tag.body.id}`, 'supplierType=COMPANY',
    ]) {
      const result = await request(app.getHttpServer()).get(`/api/suppliers?${query}`).set(scoped()).expect(200);
      expect(result.body.items.some((item: { id: string }) => item.id === first.body.supplier.id)).toBe(true);
    }
    await request(app.getHttpServer()).patch(`/api/suppliers/${first.body.supplier.id}/status`).set(scoped())
      .send({ status: 'ARCHIVED', version: first.body.supplier.version }).expect(200);
    const operational = await request(app.getHttpServer()).get('/api/suppliers').set(scoped()).expect(200);
    expect(operational.body.items.some((item: { id: string }) => item.id === first.body.supplier.id)).toBe(false);
    const archived = await request(app.getHttpServer()).get('/api/suppliers?status=ARCHIVED&page=1&pageSize=1').set(scoped()).expect(200);
    expect(archived.body.items).toHaveLength(1);
  });

  it('preserves sensitive fields on safe PATCH, detects stale edits, and enforces lifecycle', async () => {
    const created = await createSupplier('patch-safe-001', {
      supplierType: 'COMPANY', legalName: 'Sensitive Supplier', nationalId: 'SENS-1000', taxNumber: 'SENS-2000', commercialRegistration: 'SENS-3000', notes: 'before',
    });
    const safePatch = await request(app.getHttpServer()).patch(`/api/suppliers/${created.body.supplier.id}`).set(scoped())
      .send({ version: created.body.supplier.version, notes: 'after' }).expect(200);
    const stored = await prisma.supplier.findFirstOrThrow({ where: { id: created.body.supplier.id } });
    expect([stored.nationalId, stored.taxNumber, stored.commercialRegistration]).toEqual(['SENS1000', 'SENS2000', 'SENS3000']);
    const [a, b] = await Promise.all([
      request(app.getHttpServer()).patch(`/api/suppliers/${created.body.supplier.id}`).set(scoped()).send({ version: safePatch.body.version, legalName: 'Concurrent A' }),
      request(app.getHttpServer()).patch(`/api/suppliers/${created.body.supplier.id}`).set(scoped()).send({ version: safePatch.body.version, legalName: 'Concurrent B' }),
    ]);
    expect([a.status, b.status].sort((x, y) => x - y)).toEqual([200, 409]);
    const latest = await prisma.supplier.findFirstOrThrow({ where: { id: created.body.supplier.id } });
    const archived = await request(app.getHttpServer()).patch(`/api/suppliers/${created.body.supplier.id}/status`).set(scoped())
      .send({ status: 'ARCHIVED', version: latest.version }).expect(200);
    await request(app.getHttpServer()).patch(`/api/suppliers/${created.body.supplier.id}`).set(scoped()).send({ version: archived.body.version, notes: 'blocked' }).expect(422);
    await request(app.getHttpServer()).patch(`/api/suppliers/${created.body.supplier.id}/status`).set(scoped()).send({ status: 'SUSPENDED', version: archived.body.version }).expect(422);
  });

  it('keeps exactly one active default address and one active primary contact', async () => {
    const created = await createSupplier('owned-data-001', {
      supplierType: 'COMPANY', legalName: 'Owned Data Supplier',
      addresses: [{ label: 'HQ', city: 'Cairo', isDefault: true }], contacts: [{ name: 'Primary One', isPrimary: true }],
    });
    const supplierId = created.body.supplier.id as string;
    const secondAddress = await request(app.getHttpServer()).post(`/api/suppliers/${supplierId}/addresses`).set(scoped()).send({ label: 'Warehouse', city: 'Giza' }).expect(201);
    const secondContact = await request(app.getHttpServer()).post(`/api/suppliers/${supplierId}/contacts`).set(scoped()).send({ name: 'Backup Buyer', phone: '01022223333' }).expect(201);
    await Promise.all([
      request(app.getHttpServer()).post(`/api/suppliers/${supplierId}/addresses/${created.body.supplier.addresses[0].id}/default`).set(scoped()),
      request(app.getHttpServer()).post(`/api/suppliers/${supplierId}/addresses/${secondAddress.body.id}/default`).set(scoped()),
    ]);
    await Promise.all([
      request(app.getHttpServer()).post(`/api/suppliers/${supplierId}/contacts/${created.body.supplier.contacts[0].id}/primary`).set(scoped()),
      request(app.getHttpServer()).post(`/api/suppliers/${supplierId}/contacts/${secondContact.body.id}/primary`).set(scoped()),
    ]);
    expect(await prisma.supplierAddress.count({ where: { supplierId, active: true, isDefault: true } })).toBe(1);
    expect(await prisma.supplierContact.count({ where: { supplierId, active: true, isPrimary: true } })).toBe(1);
  });

  it('rejects cross-company classifications with full create rollback', async () => {
    const otherCompany = await prisma.coreCompany.create({ data: { code: 'SUP-CLASS-B', name: 'Classification B' } });
    const otherCategory = await prisma.supplierCategory.create({ data: { companyId: otherCompany.id, name: 'Other', normalizedName: 'other' } });
    await createSupplier('bad-classification-001', {
      supplierType: 'COMPANY', legalName: 'Must Roll Back', categoryId: otherCategory.id,
      addresses: [{ city: 'Cairo', isDefault: true }], contacts: [{ name: 'Buyer', isPrimary: true }],
    }, 400);
    expect(await prisma.supplier.count({ where: { companyId } })).toBe(0);
    expect(await prisma.supplierAddress.count()).toBe(0);
    expect(await prisma.supplierContact.count()).toBe(0);
  });

  it('imports whole batches atomically, reports rejected rows, and replays success without duplicates', async () => {
    const rejected = await request(app.getHttpServer()).post('/api/suppliers/import').set(scoped()).set('Idempotency-Key', 'supplier-import-reject-001').send({ rows: [
      { supplierType: 'COMPANY', legalName: 'Import Good', taxNumber: 'IMP-1000' },
      { supplierType: 'COMPANY', legalName: 'Import Bad', email: 'not-an-email' },
    ] }).expect(201);
    expect(rejected.body.committed).toBe(false);
    expect(rejected.body.rejected[0].row).toBe(2);
    expect(await prisma.supplier.count({ where: { companyId } })).toBe(0);

    const body = { rows: [
      { supplierType: 'COMPANY', legalName: 'Import One', taxNumber: 'IMP-2000', city: 'Cairo', contactName: 'Buyer One' },
      { supplierType: 'INDIVIDUAL', legalName: 'Import Two', nationalId: 'IMP-3000', city: 'Giza', contactName: 'Buyer Two' },
    ] };
    const first = await request(app.getHttpServer()).post('/api/suppliers/import').set(scoped()).set('Idempotency-Key', 'supplier-import-success-001').send(body).expect(201);
    expect(first.body).toMatchObject({ committed: true, created: 2, replayed: false });
    expect(await prisma.supplier.count({ where: { companyId } })).toBe(2);
    const replay = await request(app.getHttpServer()).post('/api/suppliers/import').set(scoped()).set('Idempotency-Key', 'supplier-import-success-001').send(body).expect(201);
    expect(replay.body).toMatchObject({ committed: true, created: 2, replayed: true });
    expect(await prisma.supplier.count({ where: { companyId } })).toBe(2);
  });

  it('exports current filters without leaking sensitive identifiers', async () => {
    await createSupplier('export-001', {
      supplierType: 'COMPANY', legalName: 'Export Supplier', taxNumber: 'SECRET-1000', commercialRegistration: 'SECRET-2000',
      addresses: [{ label: 'HQ', city: 'Cairo', isDefault: true }], contacts: [{ name: 'Export Buyer', isPrimary: true }],
    });
    const exported = await request(app.getHttpServer()).get('/api/suppliers/export?search=Export').set(scoped()).expect(200);
    expect(exported.body.count).toBe(1);
    expect(exported.body.csv).toContain('Export Supplier');
    expect(exported.body.csv).toContain('Export Buyer');
    expect(exported.body.csv).not.toContain('SECRET1000');
    expect(exported.body.csv).not.toContain('SECRET2000');
    expect(exported.body.csv).not.toContain('taxNumber');
    expect(exported.body.csv).not.toContain('commercialRegistration');
  });
});
