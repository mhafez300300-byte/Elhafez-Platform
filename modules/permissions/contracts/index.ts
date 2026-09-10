export const PERMISSION_CHECKER = Symbol('PERMISSION_CHECKER');
export const PERMISSION_DEFINITION_REGISTRY = Symbol('PERMISSION_DEFINITION_REGISTRY');

export type PermissionScope = 'GLOBAL' | 'COMPANY' | 'BRANCH';

export interface PermissionDefinition {
  key: string;
  description: string;
}

export interface PermissionView {
  id: string;
  key: string;
  description: string;
  createdAt: string;
}

export interface RoleAssignmentView {
  id: string;
  userId: string;
  roleId: string;
  scopeType: PermissionScope;
  companyId: string | null;
  branchId: string | null;
  scopeKey: string;
  createdAt: string;
}

export interface PermissionChecker {
  hasPermission(
    userId: string,
    permission: string,
    context?: { companyId?: string; branchId?: string },
  ): Promise<boolean>;
}

export interface PermissionDefinitionRegistry {
  registerDefinitions(definitions: readonly PermissionDefinition[]): Promise<PermissionView[]>;
}

export function definePermissionDefinitions<const T extends readonly PermissionDefinition[]>(
  definitions: T,
): T {
  return definitions;
}
