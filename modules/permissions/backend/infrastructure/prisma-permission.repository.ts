import { Injectable } from '@nestjs/common';
import { PrismaService } from '@elhafez/database';
import type {
  PermissionDefinition,
  PermissionScope,
  PermissionView,
  RoleAssignmentView,
} from '../../contracts';
import { PermissionDefinitionConflictError } from '../domain/permission-definition';
import type { PermissionRepository } from '../application/permission.repository';

const mapPermission = (row: {
  id: string;
  key: string;
  description: string;
  createdAt: Date;
}): PermissionView => ({
  id: row.id,
  key: row.key,
  description: row.description,
  createdAt: row.createdAt.toISOString(),
});

const mapAssignment = (row: {
  id: string;
  userId: string;
  roleId: string;
  scopeType: string;
  companyId: string | null;
  branchId: string | null;
  scopeKey: string;
  createdAt: Date;
}): RoleAssignmentView => ({
  id: row.id,
  userId: row.userId,
  roleId: row.roleId,
  scopeType: row.scopeType as PermissionScope,
  companyId: row.companyId,
  branchId: row.branchId,
  scopeKey: row.scopeKey,
  createdAt: row.createdAt.toISOString(),
});

@Injectable()
export class PrismaPermissionRepository implements PermissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listPermissions(): Promise<PermissionView[]> {
    return (await this.prisma.corePermission.findMany({ orderBy: { key: 'asc' } })).map(mapPermission);
  }

  async findPermissionByKey(key: string): Promise<PermissionView | null> {
    const row = await this.prisma.corePermission.findUnique({ where: { key } });
    return row ? mapPermission(row) : null;
  }

  async registerDefinitions(definitions: readonly PermissionDefinition[]): Promise<PermissionView[]> {
    if (definitions.length === 0) return [];
    const keys = definitions.map(({ key }) => key);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.corePermission.findMany({ where: { key: { in: keys } } });
      const existingByKey = new Map(existing.map((row) => [row.key, row]));

      for (const definition of definitions) {
        const row = existingByKey.get(definition.key);
        if (row && row.description !== definition.description) {
          throw new PermissionDefinitionConflictError(definition.key);
        }
      }

      const missing = definitions.filter(({ key }) => !existingByKey.has(key));
      if (missing.length > 0) {
        await tx.corePermission.createMany({ data: missing, skipDuplicates: true });
      }

      const registered = await tx.corePermission.findMany({
        where: { key: { in: keys } },
        orderBy: { key: 'asc' },
      });
      const registeredByKey = new Map(registered.map((row) => [row.key, row]));

      for (const definition of definitions) {
        const row = registeredByKey.get(definition.key);
        if (!row || row.description !== definition.description) {
          throw new PermissionDefinitionConflictError(definition.key);
        }
      }

      return registered.map(mapPermission);
    });
  }

  async roleHasPermission(roleId: string, permissionId: string): Promise<boolean> {
    return (await this.prisma.coreRolePermission.count({ where: { roleId, permissionId } })) > 0;
  }

  async grantRolePermission(roleId: string, permissionId: string): Promise<void> {
    await this.prisma.coreRolePermission.create({ data: { roleId, permissionId } });
  }

  async listAssignmentsForUser(userId: string): Promise<RoleAssignmentView[]> {
    return (await this.prisma.coreUserRoleAssignment.findMany({ where: { userId } })).map(mapAssignment);
  }

  async assignRole(input: {
    userId: string;
    roleId: string;
    scopeType: PermissionScope;
    companyId: string | null;
    branchId: string | null;
    scopeKey: string;
  }): Promise<RoleAssignmentView> {
    return mapAssignment(
      await this.prisma.coreUserRoleAssignment.upsert({
        where: {
          userId_roleId_scopeKey: {
            userId: input.userId,
            roleId: input.roleId,
            scopeKey: input.scopeKey,
          },
        },
        create: input,
        update: {
          scopeType: input.scopeType,
          companyId: input.companyId,
          branchId: input.branchId,
        },
      }),
    );
  }
}
