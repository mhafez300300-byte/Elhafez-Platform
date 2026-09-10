import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '@elhafez/events';
import { AuthorizationError, ConflictError, NotFoundError } from '@elhafez/errors';
import type { AuditRequestedEvent } from '@elhafez/platform-contracts';
import type { UserIdentity, UserIdentityReader, UserStatus, UserView } from '../../contracts';
import { USER_IDENTITY_READER } from '../../contracts';
import { USER_REPOSITORY, type CreateUserInput, type UserRepository } from './user.repository';

@Injectable()
export class UsersService implements UserIdentityReader {
  static readonly identityToken = USER_IDENTITY_READER;
  constructor(@Inject(USER_REPOSITORY) private readonly repo: UserRepository, private readonly events: EventBus) {}
  list(): Promise<UserView[]> { return this.repo.list(); }
  getIdentity(userId: string): Promise<UserIdentity | null> { return this.repo.findById(userId); }
  async create(input: CreateUserInput, actorId?: string, actorPlatformAdmin = false): Promise<UserView> {
    if (input.platformAdmin && !actorPlatformAdmin) throw new AuthorizationError('Only a platform administrator can create another platform administrator');
    if (await this.repo.findByEmail(input.email.toLowerCase())) throw new ConflictError('User email already exists');
    const created = await this.repo.create({ ...input, email: input.email.toLowerCase() });
    await this.audit('user.created', created.id, actorId, undefined, created);
    return created;
  }
  async setStatus(id: string, status: UserStatus, actorId?: string): Promise<UserView> {
    const before = await this.repo.findById(id);
    if (!before) throw new NotFoundError('User not found');
    const updated = await this.repo.setStatus(id, status);
    if (!updated) throw new NotFoundError('User not found');
    await this.audit('user.status.changed', id, actorId, before, updated);
    return updated;
  }
  private audit(action: string, entityId: string, actorId?: string, before?: unknown, after?: unknown): Promise<void> {
    const event: AuditRequestedEvent = { type: 'platform.audit.requested', occurredAt: new Date().toISOString(), actorId, entityType: 'user', entityId, action, before, after };
    return this.events.publish(event);
  }
}
