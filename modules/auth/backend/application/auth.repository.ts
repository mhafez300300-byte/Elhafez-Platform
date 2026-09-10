export interface AuthCredential { userId:string; login:string; passwordHash:string; createdAt:Date; updatedAt:Date; }
export interface AuthSessionRecord { id:string; userId:string; refreshTokenHash:string; expiresAt:Date; revokedAt:Date|null; createdAt:Date; updatedAt:Date; }
export interface AuthRepository {
  findCredentialByLogin(login:string):Promise<AuthCredential|null>;
  findCredentialByUserId(userId:string):Promise<AuthCredential|null>;
  upsertCredential(input:{userId:string;login:string;passwordHash:string}):Promise<AuthCredential>;
  createSession(input:{id:string;userId:string;refreshTokenHash:string;expiresAt:Date}):Promise<AuthSessionRecord>;
  findSession(id:string):Promise<AuthSessionRecord|null>;
  rotateSession(id:string,expectedRefreshTokenHash:string,input:{refreshTokenHash:string;expiresAt:Date}):Promise<boolean>;
  revokeSession(id:string):Promise<void>;
  revokeAllUserSessions(userId:string):Promise<void>;
}
export const AUTH_REPOSITORY=Symbol('AUTH_REPOSITORY');
export interface PasswordHasher { hash(value:string):Promise<string>; verify(value:string,hash:string):Promise<boolean>; }
export const PASSWORD_HASHER=Symbol('PASSWORD_HASHER');
export interface TokenPayload { sub:string; sid:string; tokenVersion:number; platformAdmin:boolean; typ:'access'|'refresh'; }
export interface TokenCodec { signAccess(payload:TokenPayload):string; signRefresh(payload:TokenPayload):string; verifyAccess(token:string):TokenPayload; verifyRefresh(token:string):TokenPayload; accessTtl:number; refreshTtl:number; }
export const TOKEN_CODEC=Symbol('TOKEN_CODEC');
