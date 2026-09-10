import { InvariantViolationError } from '@elhafez/errors';
export class AuthSession { constructor(readonly id:string,readonly userId:string,readonly expiresAt:Date,readonly revokedAt:Date|null){if(expiresAt.getTime()<=0)throw new InvariantViolationError('Invalid session expiry');} get active():boolean{return this.revokedAt===null&&this.expiresAt.getTime()>Date.now();} }
