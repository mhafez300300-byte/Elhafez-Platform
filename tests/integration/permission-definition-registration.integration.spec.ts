import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { PrismaService } from '@elhafez/database';
import { PermissionsService } from '@elhafez/permissions';
import {
  PERMISSION_DEFINITION_REGISTRY,
  type PermissionDefinitionRegistry,
} from '@elhafez/permissions/contracts';
import { createTestApp, resetDatabase } from './test-app';
import {
  TrialBusinessModule,
  TrialPermissionProbe,
  TRIAL_PERMISSION_DEFINITIONS,
} from '../fixtures/trial-permission-module';

describe('generic permission definition registration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionsService;
  let registry: PermissionDefinitionRegistry;
  let probe: TrialPermissionProbe;

  beforeEach(async () => {
    const cleanupApp = await createTestApp();
    const cleanupPrisma = cleanupApp.get(PrismaService);
    await resetDatabase(cleanupPrisma);
    await cleanupApp.close();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, TrialBusinessModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
    permissions = app.get(PermissionsService);
    registry = app.get<PermissionDefinitionRegistry>(PERMISSION_DEFINITION_REGISTRY);
    probe = app.get(TrialPermissionProbe);
  });

  afterEach(async () => {
    await app.close();
  });

  it('lets a trial module register and use a permission through public contracts only', async () => {
    const definition = TRIAL_PERMISSION_DEFINITIONS[0];
    const registered = await prisma.corePermission.findUnique({ where: { key: definition.key } });
    expect(registered?.description).toBe(definition.description);

    const user = await prisma.coreUser.create({
      data: { email: 'trial-permission@example.com', displayName: 'Trial User' },
    });
    const companyA = await prisma.coreCompany.create({ data: { code: 'TRIAL-A', name: 'Trial A' } });
    const companyB = await prisma.coreCompany.create({ data: { code: 'TRIAL-B', name: 'Trial B' } });
    const role = await prisma.coreRole.create({
      data: { key: 'trial-module.role', name: 'Trial module role', companyId: companyA.id },
    });

    await permissions.grantToRole(role.id, definition.key);
    await permissions.assignRole({
      userId: user.id,
      roleId: role.id,
      scopeType: 'COMPANY',
      companyId: companyA.id,
    });

    expect(await probe.canRead(user.id, companyA.id)).toBe(true);
    expect(await probe.canRead(user.id, companyB.id)).toBe(false);
  });

  it('does not grant or invent unregistered permissions', async () => {
    const user = await prisma.coreUser.create({
      data: { email: 'unregistered@example.com', displayName: 'Unregistered User' },
    });
    const company = await prisma.coreCompany.create({
      data: { code: 'TRIAL-U', name: 'Trial Unregistered' },
    });

    expect(await probe.canUseUnregistered(user.id, company.id)).toBe(false);
    expect(
      await prisma.corePermission.count({ where: { key: 'trial-module.records.unregistered' } }),
    ).toBe(0);
  });

  it('is idempotent and concurrency-safe for repeated identical registration', async () => {
    await Promise.all(
      Array.from({ length: 8 }, () => registry.registerDefinitions(TRIAL_PERMISSION_DEFINITIONS)),
    );

    expect(
      await prisma.corePermission.count({ where: { key: TRIAL_PERMISSION_DEFINITIONS[0].key } }),
    ).toBe(1);
  });

  it('rejects conflicting definitions and leaves no partial registration', async () => {
    await expect(
      registry.registerDefinitions([
        { key: 'trial-module.extra.read', description: 'Read extra trial records' },
        {
          key: TRIAL_PERMISSION_DEFINITIONS[0].key,
          description: 'A conflicting definition that must not replace the original',
        },
      ]),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(await prisma.corePermission.count({ where: { key: 'trial-module.extra.read' } })).toBe(0);
    expect(
      await prisma.corePermission.findUnique({
        where: { key: TRIAL_PERMISSION_DEFINITIONS[0].key },
        select: { description: true },
      }),
    ).toEqual({ description: TRIAL_PERMISSION_DEFINITIONS[0].description });
  });

  it('validates permission keys and descriptions at the public registration boundary', async () => {
    await expect(
      registry.registerDefinitions([{ key: 'Invalid.Key', description: 'Invalid key' }]),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      registry.registerDefinitions([{ key: 'trial-module.invalid', description: '   ' }]),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
