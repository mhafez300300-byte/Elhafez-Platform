import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '@elhafez/database';
import { createTestApp, resetDatabase } from './test-app';

describe('customers permission registration regression', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  it('re-initializes safely when the canonical customers.view definition already exists', async () => {
    await prisma.corePermission.create({
      data: { key: 'customers.view', description: 'View customers in an authorized scope' },
    });

    const secondApp = await createTestApp();
    const secondPrisma = secondApp.get(PrismaService);
    const permission = await secondPrisma.corePermission.findUniqueOrThrow({ where: { key: 'customers.view' } });

    expect(permission.description).toBe('View customers in an authorized scope');
    expect(await secondPrisma.corePermission.count({ where: { key: { startsWith: 'customers.' } } })).toBe(7);

    await secondApp.close();
  });
});
