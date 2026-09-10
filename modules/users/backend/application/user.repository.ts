import type { UserIdentity, UserStatus, UserView } from '../../contracts';
export interface CreateUserInput { email: string; displayName: string; platformAdmin?: boolean; }
export interface UserRepository {
  create(input: CreateUserInput): Promise<UserView>;
  list(): Promise<UserView[]>;
  findById(id: string): Promise<UserIdentity | null>;
  findByEmail(email: string): Promise<UserIdentity | null>;
  setStatus(id: string, status: UserStatus): Promise<UserView | null>;
}
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
