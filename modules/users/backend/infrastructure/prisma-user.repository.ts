import { Injectable } from '@nestjs/common';
import { PrismaService } from '@elhafez/database';
import type { UserIdentity, UserStatus, UserView } from '../../contracts';
import type { CreateUserInput, UserRepository } from '../application/user.repository';

const map = (row: { id: string; email: string; displayName: string; status: string; platformAdmin: boolean; tokenVersion: number; createdAt: Date; updatedAt: Date }): UserView => ({
  id: row.id, email: row.email, displayName: row.displayName, status: row.status as UserStatus,
  platformAdmin: row.platformAdmin, tokenVersion: row.tokenVersion, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}
  async create(input: CreateUserInput): Promise<UserView> { return map(await this.prisma.coreUser.create({ data: { email: input.email, displayName: input.displayName, platformAdmin: input.platformAdmin ?? false } })); }
  async list(): Promise<UserView[]> { return (await this.prisma.coreUser.findMany({ orderBy: { createdAt: 'desc' } })).map(map); }
  async findById(id: string): Promise<UserIdentity | null> { const row = await this.prisma.coreUser.findUnique({ where: { id } }); return row ? map(row) : null; }
  async findByEmail(email: string): Promise<UserIdentity | null> { const row = await this.prisma.coreUser.findUnique({ where: { email } }); return row ? map(row) : null; }
  async setStatus(id: string, status: UserStatus): Promise<UserView | null> { try { return map(await this.prisma.coreUser.update({ where: { id }, data: status === 'DISABLED' ? { status, tokenVersion: { increment: 1 } } : { status } })); } catch { return null; } }
}
