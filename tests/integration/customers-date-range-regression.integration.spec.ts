import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '@elhafez/database';
import { createTestApp, resetDatabase } from './test-app';

describe('customers date-range validation regression', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let companyId: string;
  let accessToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    const company = await prisma.coreCompany.create({ data: { code: 'CUST-DATE', name: 'Customers Date Validation' } });
    companyId = company.id;
    const user = await prisma.coreUser.create({
      data: { email: 'customers-date-admin@example.com', displayName: 'Customers Date Admin', platformAdmin: true },
    });
    await prisma.coreAuthCredential.create({
      data: { userId: user.id, login: user.email, passwordHash: await bcrypt.hash('StrongPassword123!', 12) },
    });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ login: user.email, password: 'StrongPassword123!' })
      .expect(201);
    accessToken = login.body.accessToken as string;
  });

  afterAll(() => app.close());

  function headers() {
    return { Authorization: `Bearer ${accessToken}`, 'x-company-id': companyId };
  }

  it('returns typed validation errors for reversed list and export date ranges', async () => {
    for (const path of [
      '/api/customers?createdFrom=2026-09-10&createdTo=2026-01-01',
      '/api/customers/export?createdFrom=2026-09-10&createdTo=2026-01-01',
    ]) {
      const response = await request(app.getHttpServer()).get(path).set(headers()).expect(400);
      expect(response.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'createdFrom must be before createdTo',
      });
    }
  });
});
