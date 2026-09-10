export const FILE_READER = Symbol('FILE_READER');

export interface FileAccessScope {
  companyId?: string;
  branchId?: string;
}

export interface FileRecordView {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: string | null;
  companyId: string | null;
  branchId: string | null;
  createdAt: string;
}

export interface FileSummary {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  companyId: string | null;
  branchId: string | null;
  createdAt: string;
}

export interface FileReader {
  getFileSummary(fileId: string, scope: FileAccessScope): Promise<FileSummary | null>;
  isFileAccessible(fileId: string, scope: FileAccessScope): Promise<boolean>;
}

export interface StoredFile {
  record: FileRecordView;
  bytes: Uint8Array;
}
