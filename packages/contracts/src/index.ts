import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'elhafez:isPublic';
export const REQUIRED_PERMISSION_KEY = 'elhafez:requiredPermission';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const RequirePermission = (permission: string) => SetMetadata(REQUIRED_PERMISSION_KEY, permission);

export interface AccessPrincipal {
  userId: string;
  sessionId: string;
  platformAdmin: boolean;
  tokenVersion: number;
}

export interface AuditRequestedEvent {
  type: 'platform.audit.requested';
  occurredAt: string;
  actorId?: string;
  companyId?: string;
  branchId?: string;
  entityType: string;
  entityId?: string;
  action: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  requestId?: string;
}
