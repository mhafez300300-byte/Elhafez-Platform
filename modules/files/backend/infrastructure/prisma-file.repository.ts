import { Injectable } from '@nestjs/common';
import { PrismaService } from '@elhafez/database';
import type {
  CreateFileRecord,
  FileRepository,
  PersistedFileRecord,
} from '../application/file.repository';

const map = (record: {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  checksumSha256: string;
  uploadedBy: string | null;
  companyId: string | null;
  branchId: string | null;
  createdAt: Date;
}): PersistedFileRecord => ({ ...record, createdAt: record.createdAt.toISOString() });

@Injectable()
export class PrismaFileRepository implements FileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateFileRecord): Promise<PersistedFileRecord> {
    return map(await this.prisma.coreFileRecord.create({ data: input }));
  }

  async findById(id: string): Promise<PersistedFileRecord | null> {
    const record = await this.prisma.coreFileRecord.findUnique({ where: { id } });
    return record ? map(record) : null;
  }

  async list(
    limit: number,
    filter?: { companyId?: string; branchId?: string },
  ): Promise<PersistedFileRecord[]> {
    const records = await this.prisma.coreFileRecord.findMany({
      where: {
        ...(filter?.companyId ? { companyId: filter.companyId } : {}),
        ...(filter?.branchId ? { branchId: filter.branchId } : {}),
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    return records.map(map);
  }
}
