import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, ValidationError } from '@elhafez/errors';
import { EventBus } from '@elhafez/events';
import { FILE_READER, type FileReader } from '@elhafez/files/contracts';
import { StructuredLogger } from '@elhafez/logging';
import type { AuditRequestedEvent } from '@elhafez/platform-contracts';
import type { ProductStatus } from '../../contracts';
import {
  PRODUCTS_REPOSITORY,
  ProductClassificationError,
  ProductConcurrentUpdateError,
  ProductPersistenceConflictError,
  type CentralImportRow,
  type CompanyImportRow,
  type ProductsRepository,
} from './products.repository';
import {
  PRODUCTS_HARDENING_REPOSITORY,
  type BulkProductPatch,
  type CentralGovernanceInput,
  type ProductsHardeningRepository,
} from './products-hardening.repository';
import { ProductsService, type GlobalMutationContext, type ProductMutationContext } from './products.service';

@Injectable()
export class ProductsV1Service extends ProductsService {
  constructor(
    @Inject(PRODUCTS_REPOSITORY) repository: ProductsRepository,
    @Inject(FILE_READER) files: FileReader,
    events: EventBus,
    logger: StructuredLogger,
    @Inject(PRODUCTS_HARDENING_REPOSITORY) private readonly hardening: ProductsHardeningRepository,
    private readonly v1Events: EventBus,
  ) {
    super(repository, files, events, logger);
  }

  override async bulkUpdate(
    productIds: string[],
    patch: BulkProductPatch,
    idempotencyKey: string,
    context: ProductMutationContext,
  ) {
    this.validateIdempotency(idempotencyKey);
    const unique = [...new Set(productIds)];
    if (unique.length === 0 || unique.length > 5000) throw new ValidationError('Bulk update requires 1 to 5000 product IDs');
    const result = await this.mapPersistence(() => this.hardening.executeBulk(context.companyId, unique, patch, idempotencyKey, context.actorId));
    if (!result.replayed) {
      await this.publishAudit('product.bulk-update', 'product-bulk-update', idempotencyKey, context, undefined, result, {
        idempotencyKey,
        requested: result.requested,
        patch,
      });
    }
    return result;
  }

  async previewBulkV1(companyId: string, productIds: string[], patch: BulkProductPatch) {
    const unique = [...new Set(productIds)];
    if (unique.length === 0 || unique.length > 5000) throw new ValidationError('Bulk update requires 1 to 5000 product IDs');
    return this.mapPersistence(() => this.hardening.previewBulk(companyId, unique, patch));
  }

  override async processCompanyImportChunk(
    sessionId: string,
    chunkKey: string,
    rows: CompanyImportRow[],
    context: ProductMutationContext,
  ) {
    const before = await this.hardening.getImportChunkState(sessionId, chunkKey);
    const recovered = this.isRecoveryCandidate(before);
    const result = await super.processCompanyImportChunk(sessionId, chunkKey, rows, context);
    if (!result.replayed && recovered) {
      await this.publishAudit('product.import-resumed', 'product-import-session', sessionId, context, undefined, result.result, { chunkKey });
    }
    if (!result.replayed && result.session.status === 'COMPLETED') {
      await this.publishAudit('product.import-completed', 'product-import-session', sessionId, context, undefined, result.session, { chunkKey });
    }
    return result;
  }

  override async processCentralImportChunk(
    sessionId: string,
    chunkKey: string,
    rows: CentralImportRow[],
    publishedAt: Date | null,
    context: GlobalMutationContext,
  ) {
    const before = await this.hardening.getImportChunkState(sessionId, chunkKey);
    const recovered = this.isRecoveryCandidate(before);
    const result = await super.processCentralImportChunk(sessionId, chunkKey, rows, publishedAt, context);
    if (!result.replayed && recovered) {
      await this.publishGlobalAudit('central.ingestion-resumed', 'central-import-session', sessionId, context, undefined, result.result, { chunkKey });
    }
    if (!result.replayed && result.session.status === 'COMPLETED') {
      await this.publishGlobalAudit('central.ingestion-completed', 'central-import-session', sessionId, context, undefined, result.session, { chunkKey });
    }
    return result;
  }

  listCompanyImportSessions(companyId: string, limit = 25) {
    return this.hardening.listCompanyImportSessions(companyId, Math.min(Math.max(limit, 1), 100));
  }

  listCentralImportSessions(limit = 25) {
    return this.hardening.listCentralImportSessions(Math.min(Math.max(limit, 1), 100));
  }

  listCentralDatasets(limit = 25) {
    return this.hardening.listCentralDatasets(Math.min(Math.max(limit, 1), 100));
  }

  async getCentralAdmin(referenceId: string) {
    const result = await this.hardening.getCentralAdmin(referenceId);
    if (!result) throw new ValidationError('Central reference not found');
    return result;
  }

  async governCentralReference(referenceId: string, input: CentralGovernanceInput, context: GlobalMutationContext) {
    const before = await this.hardening.getCentralAdmin(referenceId);
    if (!before) throw new ValidationError('Central reference not found');
    const after = await this.mapPersistence(() => this.hardening.governCentralReference(referenceId, input));
    const action = before.reference.status === 'QUARANTINED' && after.reference.status !== 'QUARANTINED'
      ? 'central.conflict-resolved'
      : 'central.reference-status-changed';
    await this.publishGlobalAudit(action, 'central-drug-reference', referenceId, context, before.reference, after.reference, {
      resolutionNote: input.resolutionNote,
      fromStatus: before.reference.status,
      toStatus: after.reference.status,
      sourceId: after.source.id,
      datasetId: after.dataset?.id ?? null,
    });
    return after;
  }

  private isRecoveryCandidate(state: { status: string; updatedAt: string } | null): boolean {
    if (!state) return false;
    if (state.status === 'FAILED') return true;
    if (state.status !== 'PROCESSING') return false;
    return Date.now() - new Date(state.updatedAt).getTime() >= 5 * 60 * 1000;
  }

  private validateIdempotency(value: string) {
    if (value.length < 8 || value.length > 120) throw new ValidationError('Idempotency-Key must contain 8 to 120 characters');
  }

  private async mapPersistence<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ProductConcurrentUpdateError) throw new ConflictError('Product changed by another request; reload before saving');
      if (error instanceof ProductPersistenceConflictError) throw new ConflictError(error.message || 'Product data conflicts with an existing record');
      if (error instanceof ProductClassificationError) throw new ValidationError(error.message || 'Product classification reference is invalid');
      throw error;
    }
  }

  private async publishAudit(
    action: string,
    entityType: string,
    entityId: string,
    context: ProductMutationContext,
    before?: unknown,
    after?: unknown,
    metadata?: Record<string, unknown>,
  ) {
    const event: AuditRequestedEvent = {
      type: 'platform.audit.requested',
      occurredAt: new Date().toISOString(),
      actorId: context.actorId,
      companyId: context.companyId,
      branchId: context.branchId,
      entityType,
      entityId,
      action,
      before,
      after,
      metadata,
      requestId: context.requestId,
    };
    await this.v1Events.publish(event);
  }

  private async publishGlobalAudit(
    action: string,
    entityType: string,
    entityId: string,
    context: GlobalMutationContext,
    before?: unknown,
    after?: unknown,
    metadata?: Record<string, unknown>,
  ) {
    const event: AuditRequestedEvent = {
      type: 'platform.audit.requested',
      occurredAt: new Date().toISOString(),
      actorId: context.actorId,
      entityType,
      entityId,
      action,
      before,
      after,
      metadata,
      requestId: context.requestId,
    };
    await this.v1Events.publish(event);
  }
}

export type { BulkProductPatch, CentralGovernanceInput };
export type BulkStatus = ProductStatus;
