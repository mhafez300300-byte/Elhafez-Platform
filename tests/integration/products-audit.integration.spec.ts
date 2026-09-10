import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '@elhafez/database';
import { createTestApp, resetDatabase } from './test-app';

const PASSWORD = 'StrongPassword123!';

describe('Products audit history API integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let companyId: string;
  let otherCompanyId: string;
  let branchId: string;
  let otherBranchId: string;
  let productId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    const company = await prisma.coreCompany.create({ data: { code: 'PAUD-A', name: 'Products Audit A' } });
    const otherCompany = await prisma.coreCompany.create({ data: { code: 'PAUD-B', name: 'Products Audit B' } });
    companyId = company.id;
    otherCompanyId = otherCompany.id;
    branchId = (await prisma.coreBranch.create({ data: { companyId, code: 'MAIN', name: 'Main' } })).id;
    otherBranchId = (await prisma.coreBranch.create({ data: { companyId, code: 'OTHER', name: 'Other' } })).id;

    const user = await prisma.coreUser.create({
      data: { email: 'products-audit-admin@example.com', displayName: 'Products Audit Admin', platformAdmin: true },
    });
    await prisma.coreAuthCredential.create({
      data: { userId: user.id, login: 'products-audit-admin@example.com', passwordHash: await bcrypt.hash(PASSWORD, 12) },
    });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ login: 'products-audit-admin@example.com', password: PASSWORD })
      .expect(201);
    accessToken = login.body.accessToken as string;

    const product = await prisma.product.create({
      data: {
        companyId,
        productCode: 'AUDIT-P-001',
        productType: 'NON_DRUG',
        displayName: 'Audit Product',
        normalizedName: 'audit product',
        status: 'DRAFT',
      },
    });
    productId = product.id;

    const sameTime = new Date('2026-09-10T12:00:00.000Z');
    await prisma.coreAuditRecord.createMany({
      data: [
        { companyId, branchId, entityType: 'product', entityId: productId, action: 'product.main-newer', occurredAt: new Date('2026-09-10T12:01:00.000Z') },
        { companyId, branchId, entityType: 'product', entityId: productId, action: 'product.main-older', occurredAt: sameTime },
        { companyId, branchId: otherBranchId, entityType: 'product', entityId: productId, action: 'product.other-branch', occurredAt: sameTime },
        { companyId: otherCompanyId, entityType: 'product', entityId: productId, action: 'product.foreign-company', occurredAt: sameTime },
        { companyId, branchId, entityType: 'supplier', entityId: productId, action: 'supplier.unrelated', occurredAt: sameTime },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  function headers(scopeCompanyId = companyId, scopeBranchId?: string) {
    return {
      Authorization: `Bearer ${accessToken}`,
      'x-company-id': scopeCompanyId,
      ...(scopeBranchId ? { 'x-branch-id': scopeBranchId } : {}),
    };
  }

  it('returns only the product entity history in the authorized branch with pagination', async () => {
    const first = await request(app.getHttpServer())
      .get(`/api/products/${productId}/audit?page=1&pageSize=1`)
      .set(headers(companyId, branchId))
      .expect(200);

    expect(first.body).toMatchObject({ page: 1, pageSize: 1, total: 2 });
    expect(first.body.items).toHaveLength(1);
    expect(first.body.items[0]).toMatchObject({
      companyId,
      branchId,
      entityType: 'product',
      entityId: productId,
      action: 'product.main-newer',
    });

    const second = await request(app.getHttpServer())
      .get(`/api/products/${productId}/audit?page=2&pageSize=1`)
      .set(headers(companyId, branchId))
      .expect(200);
    expect(second.body.items[0].action).toBe('product.main-older');
  });

  it('keeps company-wide and branch-specific history isolated and blocks cross-company product probing', async () => {
    const companyWide = await request(app.getHttpServer())
      .get(`/api/products/${productId}/audit`)
      .set(headers(companyId))
      .expect(200);
    expect(companyWide.body.total).toBe(3);
    expect(companyWide.body.items.every((item: { companyId: string }) => item.companyId === companyId)).toBe(true);

    await request(app.getHttpServer())
      .get(`/api/products/${productId}/audit`)
      .set(headers(otherCompanyId))
      .expect(404);
  });
});
