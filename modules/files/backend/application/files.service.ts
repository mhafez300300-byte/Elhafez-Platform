import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '@elhafez/errors';
import { EventBus } from '@elhafez/events';
import type { AuditRequestedEvent } from '@elhafez/platform-contracts';
import type {
  FileAccessScope,
  FileReader,
  FileRecordView,
  FileSummary,
  StoredFile,
} from '../../contracts';
import {
  FILE_REPOSITORY,
  STORAGE_PROVIDER,
  type FileRepository,
  type PersistedFileRecord,
  type StorageProvider,
} from './file.repository';

function toPublicRecord(record: PersistedFileRecord): FileRecordView {
  const { storageKey: _storageKey, checksumSha256: _checksumSha256, ...publicRecord } = record;
  return publicRecord;
}

function toSummary(record: PersistedFileRecord): FileSummary {
  const publicRecord = toPublicRecord(record);
  const { uploadedBy: _uploadedBy, ...summary } = publicRecord;
  return summary;
}

function isAccessible(record: PersistedFileRecord, scope: FileAccessScope): boolean {
  if (record.companyId !== null && record.companyId !== scope.companyId) return false;
  if (record.branchId !== null && record.branchId !== scope.branchId) return false;
  return true;
}

@Injectable()
export class FilesService implements FileReader {
  constructor(
    @Inject(FILE_REPOSITORY) private readonly repo: FileRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly events: EventBus,
  ) {}

  async list(limit = 100, filter?: { companyId?: string; branchId?: string }): Promise<FileRecordView[]> {
    const records = await this.repo.list(Math.min(Math.max(limit, 1), 500), filter);
    return records.map(toPublicRecord);
  }

  async upload(input: {
    originalName: string;
    mimeType: string;
    bytes: Uint8Array;
    uploadedBy?: string;
    companyId?: string;
    branchId?: string;
  }): Promise<FileRecordView> {
    const key = randomUUID();
    const checksum = createHash('sha256').update(input.bytes).digest('hex');
    await this.storage.put(key, input.bytes);
    try {
      const record = await this.repo.create({
        originalName: input.originalName,
        mimeType: input.mimeType,
        size: input.bytes.byteLength,
        storageKey: key,
        checksumSha256: checksum,
        uploadedBy: input.uploadedBy ?? null,
        companyId: input.companyId ?? null,
        branchId: input.branchId ?? null,
      });
      const event: AuditRequestedEvent = {
        type: 'platform.audit.requested',
        occurredAt: new Date().toISOString(),
        actorId: input.uploadedBy,
        companyId: input.companyId,
        branchId: input.branchId,
        entityType: 'file',
        entityId: record.id,
        action: 'file.uploaded',
        metadata: { name: record.originalName, size: record.size, checksum },
      };
      await this.events.publish(event);
      return toPublicRecord(record);
    } catch (error) {
      await this.storage.remove(key).catch(() => undefined);
      throw error;
    }
  }

  async download(id: string): Promise<StoredFile> {
    const record = await this.repo.findById(id);
    if (!record) throw new NotFoundError('File not found');
    return {
      record: toPublicRecord(record),
      bytes: await this.storage.get(record.storageKey),
    };
  }

  async getFileSummary(fileId: string, scope: FileAccessScope): Promise<FileSummary | null> {
    const record = await this.repo.findById(fileId);
    if (!record || !isAccessible(record, scope)) return null;
    return toSummary(record);
  }

  async isFileAccessible(fileId: string, scope: FileAccessScope): Promise<boolean> {
    return (await this.getFileSummary(fileId, scope)) !== null;
  }
}
