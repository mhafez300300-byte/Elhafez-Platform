export const ROLE_STATUS_READER = Symbol('ROLE_STATUS_READER');
export type RoleStatus='ACTIVE'|'DISABLED';
export interface RoleIdentity { id:string; key:string; name:string; status:RoleStatus; companyId:string|null; }
export interface RoleStatusReader { getRole(roleId:string):Promise<RoleIdentity|null>; }
export interface RoleView extends RoleIdentity { createdAt:string; updatedAt:string; }
