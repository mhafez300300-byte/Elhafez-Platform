import type {
  PermissionDefinition,
  PermissionScope,
  PermissionView,
  RoleAssignmentView,
} from '../../contracts';

export interface PermissionRepository {
  listPermissions(): Promise<PermissionView[]>;
  findPermissionByKey(key: string): Promise<PermissionView | null>;
  registerDefinitions(definitions: readonly PermissionDefinition[]): Promise<PermissionView[]>;
  roleHasPermission(roleId: string, permissionId: string): Promise<boolean>;
  grantRolePermission(roleId: string, permissionId: string): Promise<void>;
  listAssignmentsForUser(userId: string): Promise<RoleAssignmentView[]>;
  assignRole(input: {
    userId: string;
    roleId: string;
    scopeType: PermissionScope;
    companyId: string | null;
    branchId: string | null;
    scopeKey: string;
  }): Promise<RoleAssignmentView>;
}

export const PERMISSION_REPOSITORY = Symbol('PERMISSION_REPOSITORY');
