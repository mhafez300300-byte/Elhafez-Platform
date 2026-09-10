export const USER_IDENTITY_READER = Symbol('USER_IDENTITY_READER');
export type UserStatus = 'ACTIVE' | 'DISABLED';
export interface UserIdentity {
  id: string;
  email: string;
  displayName: string;
  status: UserStatus;
  platformAdmin: boolean;
  tokenVersion: number;
}
export interface UserIdentityReader { getIdentity(userId: string): Promise<UserIdentity | null>; }
export interface UserView extends UserIdentity { createdAt: string; updatedAt: string; }
