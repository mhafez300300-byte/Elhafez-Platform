import type { FileRecordView } from '../../contracts';

export interface PersistedFileRecord extends FileRecordView {
  storageKey: string;
  checksumSha256: string;
}

export interface CreateFileRecord {
  originalName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  checksumSha256: string;
  uploadedBy: string | null;
  companyId: string | null;
  branchId: string | null;
}

export interface FileRepository {
  create(input: CreateFileRecord): Promise<PersistedFileRecord>;
  findById(id: string): Promise<PersistedFileRecord | null>;
  list(limit: number, filter?: { companyId?: string; branchId?: string }): Promise<PersistedFileRecord[]>;
}

export const FILE_REPOSITORY = Symbol('FILE_REPOSITORY');

export interface StorageProvider {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
