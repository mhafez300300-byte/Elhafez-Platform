import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RuntimeConfigModule } from '@elhafez/config';
import { DatabaseModule, PrismaService } from '@elhafez/database';
import { EventsModule } from '@elhafez/events';
import { FilesModule } from '@elhafez/files';
import {
  FILE_READER,
  type FileAccessScope,
  type FileReader,
} from '@elhafez/files/contracts';

@Injectable()
class BusinessFilesConsumer {
  constructor(@Inject(FILE_READER) readonly files: FileReader) {}
}

@Module({
  imports: [RuntimeConfigModule, DatabaseModule, EventsModule, FilesModule],
  providers: [BusinessFilesConsumer],
})
class PublicFilesReaderCompositionRoot {}

describe('Files public reader collaboration contract', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let reader: FileReader;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [PublicFilesReaderCompositionRoot] }).compile();
    prisma = moduleRef.get(PrismaService);
    reader = moduleRef.get(BusinessFilesConsumer).files;
  });

  beforeEach(async () => {
    await prisma.coreFileRecord.deleteMany();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  async function seedFile(scope: { companyId?: string; branchId?: string } = {}): Promise<string> {
    const id = randomUUID();
    await prisma.coreFileRecord.create({
      data: {
        id,
        originalName: `${id}.png`,
        mimeType: 'image/png',
        size: 128,
        storageKey: randomUUID(),
        checksumSha256: 'a'.repeat(64),
        uploadedBy: null,
        companyId: scope.companyId ?? null,
        branchId: scope.branchId ?? null,
      },
    });
    return id;
  }

  async function accessible(fileId: string, scope: FileAccessScope): Promise<boolean> {
    return reader.isFileAccessible(fileId, scope);
  }

  it('wires FILE_READER through composition and returns a safe public summary', async () => {
    const companyId = randomUUID();
    const fileId = await seedFile({ companyId });

    const summary = await reader.getFileSummary(fileId, { companyId });

    expect(summary).toMatchObject({ id: fileId, companyId, branchId: null, mimeType: 'image/png', size: 128 });
    expect(summary).not.toHaveProperty('storageKey');
    expect(summary).not.toHaveProperty('checksumSha256');
    expect(summary).not.toHaveProperty('uploadedBy');
  });

  it('returns null/false for a missing file without leaking existence details', async () => {
    const missingId = randomUUID();
    expect(await reader.getFileSummary(missingId, { companyId: randomUUID() })).toBeNull();
    expect(await accessible(missingId, {})).toBe(false);
  });

  it('enforces company scope while allowing a company file from any branch in the same company', async () => {
    const companyId = randomUUID();
    const fileId = await seedFile({ companyId });

    expect(await accessible(fileId, { companyId })).toBe(true);
    expect(await accessible(fileId, { companyId, branchId: randomUUID() })).toBe(true);
    expect(await accessible(fileId, { companyId: randomUUID() })).toBe(false);
    expect(await accessible(fileId, {})).toBe(false);
  });

  it('enforces branch scope and rejects wrong or missing branch/company dimensions', async () => {
    const companyId = randomUUID();
    const branchId = randomUUID();
    const fileId = await seedFile({ companyId, branchId });

    expect(await accessible(fileId, { companyId, branchId })).toBe(true);
    expect(await accessible(fileId, { companyId, branchId: randomUUID() })).toBe(false);
    expect(await accessible(fileId, { companyId })).toBe(false);
    expect(await accessible(fileId, { companyId: randomUUID(), branchId })).toBe(false);
  });

  it('keeps global files globally accessible because both stored scope dimensions are null', async () => {
    const fileId = await seedFile();

    expect(await accessible(fileId, {})).toBe(true);
    expect(await accessible(fileId, { companyId: randomUUID() })).toBe(true);
    expect(await accessible(fileId, { companyId: randomUUID(), branchId: randomUUID() })).toBe(true);
  });
});
