import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AuthenticationError, ConflictError, NotFoundError } from '@elhafez/errors';
import type { AccessPrincipal } from '@elhafez/platform-contracts';
import { EventBus } from '@elhafez/events';
import type { AuditRequestedEvent } from '@elhafez/platform-contracts';
import { USER_IDENTITY_READER, type UserIdentityReader } from '@elhafez/users/contracts';
import type { AuthTokens, CredentialView } from '../../contracts';
import { AUTH_REPOSITORY, PASSWORD_HASHER, TOKEN_CODEC, type AuthRepository, type PasswordHasher, type TokenCodec } from './auth.repository';

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repo:AuthRepository,
    @Inject(PASSWORD_HASHER) private readonly passwords:PasswordHasher,
    @Inject(TOKEN_CODEC) private readonly tokens:TokenCodec,
    @Inject(USER_IDENTITY_READER) private readonly users:UserIdentityReader,
    private readonly events:EventBus,
  ) {}
  private tokenHash(token:string):string{return createHash('sha256').update(token).digest('hex');}
  async login(login:string,password:string):Promise<AuthTokens>{
    const credential=await this.repo.findCredentialByLogin(login.toLowerCase());
    if(!credential||!(await this.passwords.verify(password,credential.passwordHash)))throw new AuthenticationError('Invalid credentials');
    const user=await this.users.getIdentity(credential.userId);
    if(!user||user.status!=='ACTIVE')throw new AuthenticationError('User is inactive');
    const sid=randomUUID();
    const base={sub:user.id,sid,tokenVersion:user.tokenVersion,platformAdmin:user.platformAdmin} as const;
    const access=this.tokens.signAccess({...base,typ:'access'});
    const refresh=this.tokens.signRefresh({...base,typ:'refresh'});
    await this.repo.createSession({id:sid,userId:user.id,refreshTokenHash:this.tokenHash(refresh),expiresAt:new Date(Date.now()+this.tokens.refreshTtl*1000)});
    return{accessToken:access,refreshToken:refresh,accessExpiresInSeconds:this.tokens.accessTtl,refreshExpiresInSeconds:this.tokens.refreshTtl};
  }
  async refresh(refreshToken:string):Promise<AuthTokens>{
    let payload; try{payload=this.tokens.verifyRefresh(refreshToken);}catch{throw new AuthenticationError('Invalid refresh token');}
    const session=await this.repo.findSession(payload.sid);
    if(!session||session.userId!==payload.sub||session.revokedAt||session.expiresAt.getTime()<=Date.now()||session.refreshTokenHash!==this.tokenHash(refreshToken))throw new AuthenticationError('Refresh session is invalid');
    const user=await this.users.getIdentity(payload.sub);
    if(!user||user.status!=='ACTIVE'||user.tokenVersion!==payload.tokenVersion)throw new AuthenticationError('User session is no longer valid');
    const nextBase={sub:user.id,sid:payload.sid,tokenVersion:user.tokenVersion,platformAdmin:user.platformAdmin} as const;
    const access=this.tokens.signAccess({...nextBase,typ:'access'}); const refresh=this.tokens.signRefresh({...nextBase,typ:'refresh'});
    await this.repo.rotateSession(payload.sid,{refreshTokenHash:this.tokenHash(refresh),expiresAt:new Date(Date.now()+this.tokens.refreshTtl*1000)});
    return{accessToken:access,refreshToken:refresh,accessExpiresInSeconds:this.tokens.accessTtl,refreshExpiresInSeconds:this.tokens.refreshTtl};
  }
  async verifyAccess(token:string):Promise<AccessPrincipal>{
    let payload;try{payload=this.tokens.verifyAccess(token);}catch{throw new AuthenticationError('Invalid access token');}
    const session=await this.repo.findSession(payload.sid); if(!session||session.revokedAt||session.userId!==payload.sub)throw new AuthenticationError('Session is revoked');
    const user=await this.users.getIdentity(payload.sub);if(!user||user.status!=='ACTIVE'||user.tokenVersion!==payload.tokenVersion)throw new AuthenticationError('User session is no longer valid');
    return{userId:user.id,sessionId:payload.sid,platformAdmin:user.platformAdmin,tokenVersion:user.tokenVersion};
  }
  async logout(sessionId:string):Promise<void>{await this.repo.revokeSession(sessionId);}
  async setCredential(input:{userId:string;login:string;password:string},actorId?:string):Promise<CredentialView>{
    const user=await this.users.getIdentity(input.userId);if(!user)throw new NotFoundError('User not found');
    const login=input.login.toLowerCase();const existing=await this.repo.findCredentialByLogin(login);if(existing&&existing.userId!==input.userId)throw new ConflictError('Login already used');
    const row=await this.repo.upsertCredential({userId:input.userId,login,passwordHash:await this.passwords.hash(input.password)});
    await this.repo.revokeAllUserSessions(input.userId);
    const audit:AuditRequestedEvent={type:'platform.audit.requested',occurredAt:new Date().toISOString(),actorId,entityType:'auth-credential',entityId:input.userId,action:'auth.credential.set',metadata:{login}};await this.events.publish(audit);
    return{userId:row.userId,login:row.login,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()};
  }
}
