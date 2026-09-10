import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, InvariantViolationError, NotFoundError, ValidationError } from '@elhafez/errors';
import { EventBus } from '@elhafez/events';
import { StructuredLogger } from '@elhafez/logging';
import type { AuditRequestedEvent } from '@elhafez/platform-contracts';
import { CUSTOMER_READER, type CustomerChangedEvent, type CustomerDetail, type CustomerReader, type CustomerStatus, type CustomerSummary } from '../../contracts';
import {
  assertCustomerEditable,
  assertStatusTransition,
  CustomerDomainError,
  normalizeAddressDraft,
  normalizeCustomerDraft,
  normalizeName,
  normalizeSearchText,
  type AddressDraftInput,
  type CustomerDraftInput,
} from '../domain/customer';
import {
  CUSTOMERS_REPOSITORY,
  CustomerClassificationError,
  CustomerConcurrentUpdateError,
  CustomerPersistenceConflictError,
  type CustomerCreateRecord,
  type CustomerListQuery,
  type CustomersRepository,
} from './customers.repository';

export interface CustomerMutationContext {
  companyId: string;
  actorId: string;
  branchId?: string;
  requestId?: string;
}

export interface CreateCustomerInput extends CustomerDraftInput {
  addresses?: AddressDraftInput[];
}

export interface UpdateCustomerInput extends CustomerDraftInput {
  version: number;
}

export interface CustomerImportRow extends CustomerDraftInput {
  addressLabel?: string | null;
  governorate?: string | null;
  city?: string | null;
  street?: string | null;
  addressDetails?: string | null;
  landmark?: string | null;
  addressPhone?: string | null;
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

@Injectable()
export class CustomersService implements CustomerReader {
  constructor(
    @Inject(CUSTOMERS_REPOSITORY) private readonly repository: CustomersRepository,
    private readonly events: EventBus,
    private readonly logger: StructuredLogger,
  ) {}

  list(query: CustomerListQuery) {
    return this.repository.list(query);
  }

  async get(companyId: string, customerId: string): Promise<CustomerDetail> {
    const customer = await this.repository.get(companyId, customerId);
    if (!customer) throw new NotFoundError('Customer not found in authorized company');
    return customer;
  }

  async getSensitive(companyId: string, customerId: string) {
    const sensitive = await this.repository.getSensitive(companyId, customerId);
    if (!sensitive) throw new NotFoundError('Customer not found in authorized company');
    return sensitive;
  }

  async getCustomerSummary(companyId: string, customerId: string): Promise<CustomerSummary | null> {
    const customer = await this.repository.get(companyId, customerId);
    if (!customer) return null;
    const { secondaryPhone: _secondaryPhone, email: _email, source: _source, notes: _notes, addresses: _addresses, ...summary } = customer;
    return summary;
  }

  async isCustomerAvailable(companyId: string, customerId: string): Promise<boolean> {
    const customer = await this.repository.get(companyId, customerId);
    return customer?.status === 'ACTIVE';
  }

  async findLikelyDuplicates(companyId: string, input: CustomerDraftInput) {
    const draft = this.normalizeDraft(input);
    return this.repository.findLikelyDuplicates(companyId, {
      normalizedName: draft.normalizedName,
      normalizedTradeName: draft.normalizedTradeName,
      primaryPhone: draft.primaryPhone,
      secondaryPhone: draft.secondaryPhone,
      whatsappPhone: draft.whatsappPhone,
    });
  }

  async create(input: CreateCustomerInput, idempotencyKey: string, context: CustomerMutationContext) {
    this.assertIdempotencyKey(idempotencyKey);
    const replay = await this.repository.findByCreateRequestKey(context.companyId, idempotencyKey);
    if (replay) return { customer: replay, warnings: [], replayed: true };

    const draft = this.normalizeDraft(input);
    const addresses = (input.addresses ?? []).map((address) => this.normalizeAddress(address));
    this.assertOneDefault(addresses);
    const warnings = await this.repository.findLikelyDuplicates(context.companyId, {
      normalizedName: draft.normalizedName,
      normalizedTradeName: draft.normalizedTradeName,
      primaryPhone: draft.primaryPhone,
      secondaryPhone: draft.secondaryPhone,
      whatsappPhone: draft.whatsappPhone,
    });

    const id = randomUUID();
    const record: CustomerCreateRecord = {
      id,
      companyId: context.companyId,
      customerCode: `CUS-${id.replaceAll('-', '').slice(0, 10).toUpperCase()}`,
      createRequestKey: idempotencyKey,
      draft,
      addresses,
    };
    const customer = await this.mapPersistence(() => this.repository.create(record));
    const sensitive = await this.repository.getSensitive(context.companyId, customer.id);
    await this.audit('customer.created', context, customer.id, undefined, { ...customer, sensitive });
    for (const address of customer.addresses) {
      await this.audit('customer.address-created', context, customer.id, undefined, address, { addressId: address.id });
    }
    await this.publishCustomerEvent('customers.customer.created', customer);
    this.logger.log({ action: 'customers.create', companyId: context.companyId, customerId: customer.id }, 'CustomersService');
    return { customer, warnings, replayed: false };
  }

  async quickAdd(input: Pick<CreateCustomerInput, 'fullName' | 'primaryPhone'> & { customerType?: 'INDIVIDUAL' | 'COMPANY' }, idempotencyKey: string, context: CustomerMutationContext) {
    return this.create({ customerType: input.customerType ?? 'INDIVIDUAL', fullName: input.fullName, primaryPhone: input.primaryPhone }, idempotencyKey, context);
  }

  async update(customerId: string, input: UpdateCustomerInput, context: CustomerMutationContext) {
    const before = await this.get(context.companyId, customerId);
    this.assertEditable(before.status);
    const sensitiveBefore = await this.repository.getSensitive(context.companyId, customerId);
    const draft = this.normalizeDraft(input);
    const customer = await this.mapPersistence(() => this.repository.update({
      companyId: context.companyId,
      customerId,
      expectedVersion: input.version,
      draft,
    }));
    const sensitiveAfter = await this.repository.getSensitive(context.companyId, customerId);
    await this.audit('customer.updated', context, customerId, { ...before, sensitive: sensitiveBefore }, { ...customer, sensitive: sensitiveAfter });
    if (JSON.stringify(sensitiveBefore) !== JSON.stringify(sensitiveAfter)) {
      await this.audit('customer.sensitive-identifiers-changed', context, customerId, sensitiveBefore, sensitiveAfter);
    }
    await this.publishCustomerEvent('customers.customer.updated', customer);
    return customer;
  }

  async changeStatus(customerId: string, status: CustomerStatus, expectedVersion: number, context: CustomerMutationContext) {
    const before = await this.get(context.companyId, customerId);
    try {
      assertStatusTransition(before.status, status);
    } catch (error) {
      this.rethrowDomain(error);
    }
    const customer = await this.mapPersistence(() => this.repository.changeStatus(context.companyId, customerId, expectedVersion, status));
    await this.audit('customer.status-changed', context, customerId, { status: before.status }, { status: customer.status });
    await this.publishCustomerEvent('customers.customer.status-changed', customer);
    return customer;
  }

  async addAddress(customerId: string, input: AddressDraftInput, context: CustomerMutationContext) {
    const customer = await this.get(context.companyId, customerId);
    this.assertEditable(customer.status);
    const address = await this.mapPersistence(() => this.repository.addAddress(context.companyId, customerId, this.normalizeAddress(input)));
    await this.audit('customer.address-created', context, customerId, undefined, address, { addressId: address.id });
    return address;
  }

  async updateAddress(customerId: string, addressId: string, input: AddressDraftInput & { version: number }, context: CustomerMutationContext) {
    const customer = await this.get(context.companyId, customerId);
    this.assertEditable(customer.status);
    const before = customer.addresses.find((address) => address.id === addressId);
    if (!before) throw new NotFoundError('Customer address not found');
    const address = await this.mapPersistence(() => this.repository.updateAddress(context.companyId, customerId, addressId, {
      ...this.normalizeAddress(input),
      expectedVersion: input.version,
    }));
    await this.audit('customer.address-updated', context, customerId, before, address, { addressId });
    return address;
  }

  async setDefaultAddress(customerId: string, addressId: string, context: CustomerMutationContext) {
    const customer = await this.get(context.companyId, customerId);
    this.assertEditable(customer.status);
    const before = customer.addresses.find((address) => address.isDefault) ?? null;
    const address = await this.mapPersistence(() => this.repository.setDefaultAddress(context.companyId, customerId, addressId));
    await this.audit('customer.default-address-changed', context, customerId, before, address, { addressId });
    return address;
  }

  async deactivateAddress(customerId: string, addressId: string, version: number, context: CustomerMutationContext) {
    const customer = await this.get(context.companyId, customerId);
    this.assertEditable(customer.status);
    const before = customer.addresses.find((address) => address.id === addressId);
    if (!before) throw new NotFoundError('Customer address not found');
    const address = await this.mapPersistence(() => this.repository.deactivateAddress(context.companyId, customerId, addressId, version));
    await this.audit('customer.address-deactivated', context, customerId, before, address, { addressId });
    return address;
  }

  listCategories(companyId: string, includeInactive = false) {
    return this.repository.listCategories(companyId, includeInactive);
  }

  async createCategory(name: string, context: CustomerMutationContext) {
    const category = await this.mapPersistence(() => this.repository.createCategory(context.companyId, this.classificationName(name)));
    await this.audit('customer.classification-category-created', context, category.id, undefined, category);
    return category;
  }

  async updateCategory(id: string, name: string, active: boolean, context: CustomerMutationContext) {
    const category = await this.mapPersistence(() => this.repository.updateCategory(context.companyId, id, this.classificationName(name), active));
    await this.audit('customer.classification-category-updated', context, category.id, undefined, category);
    return category;
  }

  listTags(companyId: string, includeInactive = false) {
    return this.repository.listTags(companyId, includeInactive);
  }

  async createTag(name: string, context: CustomerMutationContext) {
    const tag = await this.mapPersistence(() => this.repository.createTag(context.companyId, this.classificationName(name)));
    await this.audit('customer.classification-tag-created', context, tag.id, undefined, tag);
    return tag;
  }

  async updateTag(id: string, name: string, active: boolean, context: CustomerMutationContext) {
    const tag = await this.mapPersistence(() => this.repository.updateTag(context.companyId, id, this.classificationName(name), active));
    await this.audit('customer.classification-tag-updated', context, tag.id, undefined, tag);
    return tag;
  }

  async import(rows: CustomerImportRow[], idempotencyKey: string, context: CustomerMutationContext) {
    this.assertIdempotencyKey(idempotencyKey);
    if (rows.length === 0 || rows.length > 1000) throw new ValidationError('Import must contain between 1 and 1000 rows');

    const firstReplay = await this.repository.findByCreateRequestKey(context.companyId, `${idempotencyKey}:1`);
    if (firstReplay) {
      const replayed = await Promise.all(rows.map((_, index) => this.repository.findByCreateRequestKey(context.companyId, `${idempotencyKey}:${index + 1}`)));
      if (replayed.every((customer): customer is CustomerDetail => customer !== null)) {
        return { committed: true, created: replayed.length, rejected: [], customers: replayed, replayed: true };
      }
      throw new ConflictError('Import idempotency state is inconsistent');
    }

    const rejected: Array<{ row: number; reason: string }> = [];
    const normalized = rows.map((row, index) => {
      try {
        const draft = this.normalizeDraft(row);
        const hasAddress = [row.addressLabel, row.governorate, row.city, row.street, row.addressDetails, row.landmark].some((value) => Boolean(value?.trim()));
        const addresses = hasAddress ? [this.normalizeAddress({
          label: row.addressLabel,
          governorate: row.governorate,
          city: row.city,
          street: row.street,
          details: row.addressDetails,
          landmark: row.landmark,
          phone: row.addressPhone,
          isDefault: true,
        })] : [];
        return { draft, addresses };
      } catch (error) {
        rejected.push({ row: index + 1, reason: error instanceof Error ? error.message : 'Invalid row' });
        return null;
      }
    });

    const seenNational = new Set<string>();
    const seenTax = new Set<string>();
    normalized.forEach((entry, index) => {
      if (!entry) return;
      if (entry.draft.nationalId) {
        if (seenNational.has(entry.draft.nationalId)) rejected.push({ row: index + 1, reason: 'Duplicate national ID inside import' });
        seenNational.add(entry.draft.nationalId);
      }
      if (entry.draft.taxNumber) {
        if (seenTax.has(entry.draft.taxNumber)) rejected.push({ row: index + 1, reason: 'Duplicate tax number inside import' });
        seenTax.add(entry.draft.taxNumber);
      }
    });

    const valid = normalized.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    const conflicts = await this.repository.findStrongIdentifierConflicts(
      context.companyId,
      valid.flatMap((entry) => entry.draft.nationalId ? [entry.draft.nationalId] : []),
      valid.flatMap((entry) => entry.draft.taxNumber ? [entry.draft.taxNumber] : []),
    );
    normalized.forEach((entry, index) => {
      if (!entry) return;
      if (entry.draft.nationalId && conflicts.nationalIds.has(entry.draft.nationalId)) rejected.push({ row: index + 1, reason: 'National ID already exists' });
      if (entry.draft.taxNumber && conflicts.taxNumbers.has(entry.draft.taxNumber)) rejected.push({ row: index + 1, reason: 'Tax number already exists' });
    });

    if (rejected.length > 0) {
      return { committed: false, created: 0, rejected: rejected.sort((a, b) => a.row - b.row), customers: [], replayed: false };
    }

    const records: CustomerCreateRecord[] = valid.map((entry, index) => {
      const id = randomUUID();
      return {
        id,
        companyId: context.companyId,
        customerCode: `CUS-${id.replaceAll('-', '').slice(0, 10).toUpperCase()}`,
        createRequestKey: `${idempotencyKey}:${index + 1}`,
        draft: entry.draft,
        addresses: entry.addresses,
      };
    });
    const customers = await this.mapPersistence(() => this.repository.importCustomers(records));
    for (const customer of customers) {
      await this.audit('customer.created', context, customer.id, undefined, customer, { imported: true, importKey: idempotencyKey });
      await this.publishCustomerEvent('customers.customer.created', customer);
    }
    return { committed: true, created: customers.length, rejected: [], customers, replayed: false };
  }

  async exportCsv(query: Omit<CustomerListQuery, 'page' | 'pageSize'>) {
    const customers = await this.repository.exportList(query);
    const rows = [
      ['customerCode','customerType','fullName','tradeName','primaryPhone','secondaryPhone','whatsappPhone','email','category','tags','city','status','source','createdAt','updatedAt'],
      ...customers.map((customer) => [
        customer.customerCode,
        customer.customerType,
        customer.fullName,
        customer.tradeName,
        customer.primaryPhone,
        '',
        customer.whatsappPhone,
        '',
        customer.category?.name ?? '',
        customer.tags.map((tag) => tag.name).join('|'),
        customer.city,
        customer.status,
        '',
        customer.createdAt,
        customer.updatedAt,
      ]),
    ];
    return {
      filename: `customers-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: rows.map((row) => row.map(csvCell).join(',')).join('\n'),
      count: customers.length,
    };
  }

  private normalizeDraft(input: CustomerDraftInput) {
    try {
      return normalizeCustomerDraft(input);
    } catch (error) {
      this.rethrowDomain(error);
    }
  }

  private normalizeAddress(input: AddressDraftInput) {
    try {
      return normalizeAddressDraft(input);
    } catch (error) {
      this.rethrowDomain(error);
    }
  }

  private assertEditable(status: CustomerStatus): void {
    try {
      assertCustomerEditable(status);
    } catch (error) {
      this.rethrowDomain(error);
    }
  }

  private assertOneDefault(addresses: Array<{ isDefault: boolean }>): void {
    if (addresses.filter((address) => address.isDefault).length > 1) {
      throw new ValidationError('Only one default customer address is allowed');
    }
  }

  private assertIdempotencyKey(key: string): void {
    if (key.trim().length < 8 || key.length > 100 || /[\u0000-\u001f\u007f]/.test(key)) {
      throw new ValidationError('Idempotency key must contain 8 to 100 visible characters');
    }
  }

  private classificationName(value: string): string {
    const name = normalizeName(value);
    if (name.length > 120) throw new ValidationError('Classification name must be 120 characters or fewer');
    return name;
  }

  private rethrowDomain(error: unknown): never {
    if (error instanceof CustomerDomainError) {
      if (error.code === 'INVALID_STATUS_TRANSITION' || error.code === 'CUSTOMER_ARCHIVED') {
        throw new InvariantViolationError(error.message);
      }
      throw new ValidationError(error.message);
    }
    throw error;
  }

  private async mapPersistence<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof CustomerConcurrentUpdateError) throw new ConflictError('Customer data changed on another request; reload and retry');
      if (error instanceof CustomerClassificationError) throw new ValidationError(error.message);
      if (error instanceof CustomerPersistenceConflictError) throw new ConflictError(error.message || 'Customer data conflicts with an existing record');
      throw error;
    }
  }

  private async audit(action: string, context: CustomerMutationContext, entityId: string, before?: unknown, after?: unknown, metadata?: Record<string, unknown>): Promise<void> {
    const event: AuditRequestedEvent = {
      type: 'platform.audit.requested',
      occurredAt: new Date().toISOString(),
      actorId: context.actorId,
      companyId: context.companyId,
      branchId: context.branchId,
      entityType: 'customer',
      entityId,
      action,
      before,
      after,
      metadata,
      requestId: context.requestId,
    };
    await this.events.publish(event);
  }

  private async publishCustomerEvent(type: CustomerChangedEvent['type'], customer: CustomerSummary): Promise<void> {
    const event: CustomerChangedEvent = {
      type,
      occurredAt: new Date().toISOString(),
      companyId: customer.companyId,
      customerId: customer.id,
      status: customer.status,
    };
    await this.events.publish(event);
  }
}

void CUSTOMER_READER;
