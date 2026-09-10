import { InvariantViolationError } from '@elhafez/errors';
import type { UserStatus } from '../../contracts';

export class User {
  constructor(
    readonly id: string,
    readonly email: string,
    readonly displayName: string,
    readonly status: UserStatus,
    readonly platformAdmin: boolean,
    readonly tokenVersion: number,
  ) {
    if (!email.includes('@')) throw new InvariantViolationError('User email must be valid');
    if (!displayName.trim()) throw new InvariantViolationError('User display name is required');
  }
}
