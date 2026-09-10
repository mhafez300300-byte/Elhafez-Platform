import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, InvariantViolationError, NotFoundError, ValidationError } from '@elhafez/errors';
import { EventBus } from '@elhafez/events';
import { StructuredLogger } from '@elhafez/logging';
import type { AuditRequestedEvent } from '@elhafez/platform-contracts';
import type {
  SupplierChangedEvent,
  SupplierDetail,
  SupplierReader,
  SupplierStatus,
  SupplierSummary,
} from '../../contracts';
import {
  assertStatusTransition,
  assertSupplierEditable,
  normalizeAddressDraft,
  normalizeContactDraft,
  normalizeName,
  normalizeSupplierDraft,
  SupplierDomainError,
  type AddressDraftInput,
  type ContactDraftInput,
  type SupplierDraftInput,
} from '../domain/supplier';
import {
  SUPPLIERS_REPOSITORY,
  SupplierClassificationError,
  SupplierConcurrentUpdateError,
  SupplierPersistenceConflictError,
  type SupplierCreateRecord,
  type SupplierListQuery,
  type SuppliersRepository,
} from './suppliers.repository';

export interface SupplierMutationContext {
  companyId: string;
  actorId: string;
  branchId?: string;
  requestId?: string;
}

export interface CreateSupplierInput extends SupplierDraftInput {
  addresses?: AddressDraftInput[];
  contacts?: ContactDraftInput[];
}

export type UpdateSupplierInput = Partial<SupplierDraftInput> & { version: number };
export type UpdateAddressInput = Partial<AddressDraftInput> & { version: number };
export type UpdateContactInput = Partial<ContactDraftInput> & { version: number };

export interface SupplierImportRow extends SupplierDraftInput {
  addressLabel?: string | null;
  governorate?: string | null;
  city?: string | null;
  street?: string | null;
  addressDetails?: string | null;
  landmark?: string | null;
  addressPhone?: string | null;
  contactName?: string | null;
  contactJobTitle?: string | null;
  contactPhone?: string | null;
  contactWhatsappPhone?: string | null;
  contactEmail?: string | null;
  contactIsPrimary?: boolean;
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function hasOwn<T extends object>(value: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

@Injectable()
export class SuppliersService implements SupplierReader {
  constructor(
    @Inject(SUPPLIERS_REPOSITORY) private readonly repository: SuppliersRepository,
    private readonly events: EventBus,
    private readonly logger: StructuredLogger,
  ) {}

  list(query: SupplierListQuery) {
    return this.repository.list(query);
  }

  async get(companyId: string, supplierId: string): Promise<SupplierDetail> {
    const supplier = await this.repository.get(companyId, supplierId);
    if (!supplier) throw new NotFoundError('Supplier not found in authorized company');
    return supplier;
  }

  async getSensitive(companyId: string, supplierId: string) {
    const sensitive = await this.repository.getSensitive(companyId, supplierId);
    if (!sensitive) throw new NotFoundError('Supplier not found in authorized company');
    return sensitive;
  }

  async getSupplierSummary(companyId: string, supplierId: string): Promise<SupplierSummary | null> {
    const supplier = await this.repository.get(companyId, supplierId);
    if (!supplier) return null;
    const {
      secondaryPhone: _secondaryPhone,
      email: _email,
      website: _website,
      notes: _notes,
      addresses: _addresses,
      contacts: _contacts,
      ...summary
    } = supplier;
    return summary;
  }

  async isSupplierAvailable(companyId: string, supplierId: string): Promise<boolean> {
    const supplier = await this.repository.get(companyId, supplierId);
    return supplier?.status === 'ACTIVE';
  }

  async findLikelyDuplicates(companyId: string, input: SupplierDraftInput) {
    const draft = this.normalizeDraft(input);
    return this.repository.findLikelyDuplicates(companyId, this.duplicateProbe(draft));
  }

  async create(input: CreateSupplierInput, idempotencyKey: string, context: SupplierMutationContext) {
    this.assertIdempotencyKey(idempotencyKey);
    const replay = await this.repository.findByCreateRequestKey(context.companyId, idempotencyKey);
    if (replay) {
      return { supplier: replay, warnings: [], replayed: true };
    }

    const draft = this.normalizeDraft(input);
    const addresses = (input.addresses ?? []).map((address) => this.normalizeAddress(address));
    const contacts = (input.contacts ?? []).map((contact) => this.normalizeContact(contact));
    this.assertOneDefault(addresses);
    this.assertOnePrimary(contacts);
    const warnings = await this.repository.findLikelyDuplicates(context.companyId, this.duplicateProbe(draft));

    const id = randomUUID();
    const record: SupplierCreateRecord = {
      id,
      companyId: context.companyId,
      supplierCode: `SUP-${id.replaceAll('-', '').slice(0, 10).toUpperCase()}`,
      createRequestKey: idempotencyKey,
      draft,
      addresses,
      contacts,
    };
    const supplier = await this.mapPersistence(() => this.repository.create(record));
    const sensitive = await this.repository.getSensitive(context.companyId, supplier.id);
    await this.audit('supplier.created', context, supplier.id, undefined, { ...supplier, sensitive }, { idempotencyKey });
    for (const address of supplier.addresses) {
      await this.audit('supplier.address-created', context, supplier.id, undefined, address, { addressId: address.id });
    }
    for (const contact of supplier.contacts) {
      await this.audit('supplier.contact-created', context, supplier.id, undefined, contact, { contactId: contact.id });
    }
    await this.publishSupplierEvent('suppliers.supplier.created', supplier);
    this.logger.log({ action: 'suppliers.create', companyId: context.companyId, supplierId: supplier.id }, 'SuppliersService');
    return { supplier, warnings, replayed: false };
  }

  async update(supplierId: string, input: UpdateSupplierInput, context: SupplierMutationContext) {
    const before = await this.get(context.companyId, supplierId);
    this.assertEditable(before.status);
    const sensitiveBefore = await this.repository.getSensitive(context.companyId, supplierId);
    if (!sensitiveBefore) throw new NotFoundError('Supplier not found in authorized company');

    const merged: SupplierDraftInput = {
      supplierType: input.supplierType ?? before.supplierType,
      legalName: input.legalName ?? before.legalName,
      tradeName: hasOwn(input, 'tradeName') ? input.tradeName : before.tradeName,
      primaryPhone: hasOwn(input, 'primaryPhone') ? input.primaryPhone : before.primaryPhone,
      secondaryPhone: hasOwn(input, 'secondaryPhone') ? input.secondaryPhone : before.secondaryPhone,
      whatsappPhone: hasOwn(input, 'whatsappPhone') ? input.whatsappPhone : before.whatsappPhone,
      email: hasOwn(input, 'email') ? input.email : before.email,
      website: hasOwn(input, 'website') ? input.website : before.website,
      nationalId: hasOwn(input, 'nationalId') ? input.nationalId : sensitiveBefore.nationalId,
      taxNumber: hasOwn(input, 'taxNumber') ? input.taxNumber : sensitiveBefore.taxNumber,
      commercialRegistration: hasOwn(input, 'commercialRegistration') ? input.commercialRegistration : sensitiveBefore.commercialRegistration,
      categoryId: hasOwn(input, 'categoryId') ? input.categoryId : before.category?.id ?? null,
      notes: hasOwn(input, 'notes') ? input.notes : before.notes,
      tagIds: hasOwn(input, 'tagIds') ? input.tagIds : before.tags.map((tag) => tag.id),
    };

    const draft = this.normalizeDraft(merged);
    const supplier = await this.mapPersistence(() => this.repository.update({
      companyId: context.companyId,
      supplierId,
      expectedVersion: input.version,
      draft,
    }));
    const sensitiveAfter = await this.repository.getSensitive(context.companyId, supplierId);
    await this.audit('supplier.updated', context, supplierId, { ...before, sensitive: sensitiveBefore }, { ...supplier, sensitive: sensitiveAfter });
    if (JSON.stringify(sensitiveBefore) !== JSON.stringify(sensitiveAfter)) {
      await this.audit('supplier.sensitive-identifiers-changed', context, supplierId, sensitiveBefore, sensitiveAfter);
    }
    const contactBefore = [before.primaryPhone, before.secondaryPhone, before.whatsappPhone, before.email, before.website];
    const contactAfter = [supplier.primaryPhone, supplier.secondaryPhone, supplier.whatsappPhone, supplier.email, supplier.website];
    if (JSON.stringify(contactBefore) !== JSON.stringify(contactAfter)) {
      await this.audit('supplier.contact-information-changed', context, supplierId, contactBefore, contactAfter);
    }
    const classBefore = { categoryId: before.category?.id ?? null, tagIds: before.tags.map((tag) => tag.id).sort() };
    const classAfter = { categoryId: supplier.category?.id ?? null, tagIds: supplier.tags.map((tag) => tag.id).sort() };
    if (JSON.stringify(classBefore) !== JSON.stringify(classAfter)) {
      await this.audit('supplier.classification-changed', context, supplierId, classBefore, classAfter);
    }
    await this.publishSupplierEvent('suppliers.supplier.updated', supplier);
    return supplier;
  }

  async changeStatus(supplierId: string, status: SupplierStatus, expectedVersion: number, context: SupplierMutationContext) {
    const before = await this.get(context.companyId, supplierId);
    try {
      assertStatusTransition(before.status, status);
    } catch (error) {
      this.rethrowDomain(error);
    }
    const supplier = await this.mapPersistence(() => this.repository.changeStatus(context.companyId, supplierId, expectedVersion, status));
    await this.audit('supplier.status-changed', context, supplierId, { status: before.status }, { status: supplier.status });
    await this.publishSupplierEvent('suppliers.supplier.status-changed', supplier);
    return supplier;
  }

  async addAddress(supplierId: string, input: AddressDraftInput, context: SupplierMutationContext) {
    const supplier = await this.get(context.companyId, supplierId);
    this.assertEditable(supplier.status);
    const address = await this.mapPersistence(() => this.repository.addAddress(context.companyId, supplierId, this.normalizeAddress(input)));
    await this.audit('supplier.address-created', context, supplierId, undefined, address, { addressId: address.id });
    return address;
  }

  async updateAddress(supplierId: string, addressId: string, input: UpdateAddressInput, context: SupplierMutationContext) {
    const supplier = await this.get(context.companyId, supplierId);
    this.assertEditable(supplier.status);
    const before = supplier.addresses.find((address) => address.id === addressId && address.active);
    if (!before) throw new NotFoundError('Active supplier address not found');
    const merged: AddressDraftInput = {
      label: hasOwn(input, 'label') ? input.label : before.label,
      governorate: hasOwn(input, 'governorate') ? input.governorate : before.governorate,
      city: hasOwn(input, 'city') ? input.city : before.city,
      street: hasOwn(input, 'street') ? input.street : before.street,
      details: hasOwn(input, 'details') ? input.details : before.details,
      landmark: hasOwn(input, 'landmark') ? input.landmark : before.landmark,
      phone: hasOwn(input, 'phone') ? input.phone : before.phone,
      isDefault: hasOwn(input, 'isDefault') ? input.isDefault : before.isDefault,
    };
    const address = await this.mapPersistence(() => this.repository.updateAddress(context.companyId, supplierId, addressId, {
      ...this.normalizeAddress(merged), expectedVersion: input.version,
    }));
    await this.audit('supplier.address-updated', context, supplierId, before, address, { addressId });
    return address;
  }

  async setDefaultAddress(supplierId: string, addressId: string, context: SupplierMutationContext) {
    const supplier = await this.get(context.companyId, supplierId);
    this.assertEditable(supplier.status);
    const before = supplier.addresses.find((address) => address.isDefault && address.active) ?? null;
    const address = await this.mapPersistence(() => this.repository.setDefaultAddress(context.companyId, supplierId, addressId));
    await this.audit('supplier.default-address-changed', context, supplierId, before, address, { addressId });
    return address;
  }

  async deactivateAddress(supplierId: string, addressId: string, version: number, context: SupplierMutationContext) {
    const supplier = await this.get(context.companyId, supplierId);
    this.assertEditable(supplier.status);
    const before = supplier.addresses.find((address) => address.id === addressId && address.active);
    if (!before) throw new NotFoundError('Active supplier address not found');
    const address = await this.mapPersistence(() => this.repository.deactivateAddress(context.companyId, supplierId, addressId, version));
    await this.audit('supplier.address-deactivated', context, supplierId, before, address, { addressId });
    return address;
  }

  async addContact(supplierId: string, input: ContactDraftInput, context: SupplierMutationContext) {
    const supplier = await this.get(context.companyId, supplierId);
    this.assertEditable(supplier.status);
    const contact = await this.mapPersistence(() => this.repository.addContact(context.companyId, supplierId, this.normalizeContact(input)));
    await this.audit('supplier.contact-created', context, supplierId, undefined, contact, { contactId: contact.id });
    if (contact.isPrimary) await this.audit('supplier.primary-contact-changed', context, supplierId, supplier.primaryContact, contact, { contactId: contact.id });
    return contact;
  }

  async updateContact(supplierId: string, contactId: string, input: UpdateContactInput, context: SupplierMutationContext) {
    const supplier = await this.get(context.companyId, supplierId);
    this.assertEditable(supplier.status);
    const before = supplier.contacts.find((contact) => contact.id === contactId && contact.active);
    if (!before) throw new NotFoundError('Active supplier contact not found');
    const merged: ContactDraftInput = {
      name: input.name ?? before.name,
      jobTitle: hasOwn(input, 'jobTitle') ? input.jobTitle : before.jobTitle,
      phone: hasOwn(input, 'phone') ? input.phone : before.phone,
      whatsappPhone: hasOwn(input, 'whatsappPhone') ? input.whatsappPhone : before.whatsappPhone,
      email: hasOwn(input, 'email') ? input.email : before.email,
      isPrimary: hasOwn(input, 'isPrimary') ? input.isPrimary : before.isPrimary,
    };
    const contact = await this.mapPersistence(() => this.repository.updateContact(context.companyId, supplierId, contactId, {
      ...this.normalizeContact(merged), expectedVersion: input.version,
    }));
    await this.audit('supplier.contact-updated', context, supplierId, before, contact, { contactId });
    if (before.isPrimary !== contact.isPrimary || (contact.isPrimary && supplier.primaryContact?.id !== contact.id)) {
      await this.audit('supplier.primary-contact-changed', context, supplierId, supplier.primaryContact, contact, { contactId });
    }
    return contact;
  }

  async setPrimaryContact(supplierId: string, contactId: string, context: SupplierMutationContext) {
    const supplier = await this.get(context.companyId, supplierId);
    this.assertEditable(supplier.status);
    const contact = await this.mapPersistence(() => this.repository.setPrimaryContact(context.companyId, supplierId, contactId));
    await this.audit('supplier.primary-contact-changed', context, supplierId, supplier.primaryContact, contact, { contactId });
    return contact;
  }

  async deactivateContact(supplierId: string, contactId: string, version: number, context: SupplierMutationContext) {
    const supplier = await this.get(context.companyId, supplierId);
    this.assertEditable(supplier.status);
    const before = supplier.contacts.find((contact) => contact.id === contactId && contact.active);
    if (!before) throw new NotFoundError('Active supplier contact not found');
    const contact = await this.mapPersistence(() => this.repository.deactivateContact(context.companyId, supplierId, contactId, version));
    await this.audit('supplier.contact-deactivated', context, supplierId, before, contact, { contactId });
    if (before.isPrimary) await this.audit('supplier.primary-contact-changed', context, supplierId, before, null, { contactId });
    return contact;
  }

  listCategories(companyId: string, includeInactive = false) {
    return this.repository.listCategories(companyId, includeInactive);
  }

  async createCategory(name: string, context: SupplierMutationContext) {
    const category = await this.mapPersistence(() => this.repository.createCategory(context.companyId, this.classificationName(name)));
    await this.audit('supplier.classification-category-created', context, category.id, undefined, category);
    return category;
  }

  async updateCategory(id: string, name: string, active: boolean, context: SupplierMutationContext) {
    const before = (await this.repository.listCategories(context.companyId, true)).find((item) => item.id === id);
    if (!before) throw new NotFoundError('Supplier category not found');
    const category = await this.mapPersistence(() => this.repository.updateCategory(context.companyId, id, this.classificationName(name), active));
    await this.audit('supplier.classification-category-updated', context, category.id, before, category);
    return category;
  }

  listTags(companyId: string, includeInactive = false) {
    return this.repository.listTags(companyId, includeInactive);
  }

  async createTag(name: string, context: SupplierMutationContext) {
    const tag = await this.mapPersistence(() => this.repository.createTag(context.companyId, this.classificationName(name)));
    await this.audit('supplier.classification-tag-created', context, tag.id, undefined, tag);
    return tag;
  }

  async updateTag(id: string, name: string, active: boolean, context: SupplierMutationContext) {
    const before = (await this.repository.listTags(context.companyId, true)).find((item) => item.id === id);
    if (!before) throw new NotFoundError('Supplier tag not found');
    const tag = await this.mapPersistence(() => this.repository.updateTag(context.companyId, id, this.classificationName(name), active));
    await this.audit('supplier.classification-tag-updated', context, tag.id, before, tag);
    return tag;
  }

  async import(rows: SupplierImportRow[], idempotencyKey: string, context: SupplierMutationContext) {
    this.assertIdempotencyKey(idempotencyKey);
    if (rows.length === 0 || rows.length > 1000) throw new ValidationError('Import must contain between 1 and 1000 rows');

    const replayed = await Promise.all(
      rows.map((_, index) => this.repository.findByCreateRequestKey(context.companyId, `${idempotencyKey}:${index + 1}`)),
    );
    const replayCount = replayed.filter(Boolean).length;
    if (replayCount > 0) {
      if (replayCount !== rows.length) throw new ConflictError('Import idempotency state is inconsistent');
      const suppliers = replayed.filter((supplier): supplier is SupplierDetail => supplier !== null);
      return { committed: true, created: suppliers.length, rejected: [], suppliers, replayed: true };
    }

    const rejected: Array<{ row: number; reason: string }> = [];
    const normalized = rows.map((row, index) => {
      try {
        const draft = this.normalizeDraft(row);
        const hasAddress = [row.addressLabel, row.governorate, row.city, row.street, row.addressDetails, row.landmark]
          .some((value) => Boolean(value?.trim()));
        const addresses = hasAddress ? [this.normalizeAddress({
          label: row.addressLabel, governorate: row.governorate, city: row.city, street: row.street,
          details: row.addressDetails, landmark: row.landmark, phone: row.addressPhone, isDefault: true,
        })] : [];
        const contacts = row.contactName?.trim() ? [this.normalizeContact({
          name: row.contactName, jobTitle: row.contactJobTitle, phone: row.contactPhone,
          whatsappPhone: row.contactWhatsappPhone, email: row.contactEmail, isPrimary: row.contactIsPrimary ?? true,
        })] : [];
        return { draft, addresses, contacts };
      } catch (error) {
        rejected.push({ row: index + 1, reason: error instanceof Error ? error.message : 'Invalid row' });
        return null;
      }
    });

    const seenNational = new Set<string>();
    const seenTax = new Set<string>();
    const seenCommercial = new Set<string>();
    normalized.forEach((entry, index) => {
      if (!entry) return;
      for (const [value, seen, label] of [
        [entry.draft.nationalId, seenNational, 'national ID'],
        [entry.draft.taxNumber, seenTax, 'tax number'],
        [entry.draft.commercialRegistration, seenCommercial, 'commercial registration'],
      ] as const) {
        if (!value) continue;
        if (seen.has(value)) rejected.push({ row: index + 1, reason: `Duplicate ${label} inside import` });
        seen.add(value);
      }
    });

    const valid = normalized.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    const conflicts = await this.repository.findStrongIdentifierConflicts(
      context.companyId,
      valid.flatMap((entry) => entry.draft.nationalId ? [entry.draft.nationalId] : []),
      valid.flatMap((entry) => entry.draft.taxNumber ? [entry.draft.taxNumber] : []),
      valid.flatMap((entry) => entry.draft.commercialRegistration ? [entry.draft.commercialRegistration] : []),
    );
    normalized.forEach((entry, index) => {
      if (!entry) return;
      if (entry.draft.nationalId && conflicts.nationalIds.has(entry.draft.nationalId)) rejected.push({ row: index + 1, reason: 'National ID already exists' });
      if (entry.draft.taxNumber && conflicts.taxNumbers.has(entry.draft.taxNumber)) rejected.push({ row: index + 1, reason: 'Tax number already exists' });
      if (entry.draft.commercialRegistration && conflicts.commercialRegistrations.has(entry.draft.commercialRegistration)) rejected.push({ row: index + 1, reason: 'Commercial registration already exists' });
    });

    if (rejected.length > 0) {
      const uniqueRejected = [...new Map(rejected.map((item) => [`${item.row}:${item.reason}`, item])).values()];
      return { committed: false, created: 0, rejected: uniqueRejected.sort((a, b) => a.row - b.row), suppliers: [], replayed: false };
    }

    const records: SupplierCreateRecord[] = valid.map((entry, index) => {
      const id = randomUUID();
      return {
        id,
        companyId: context.companyId,
        supplierCode: `SUP-${id.replaceAll('-', '').slice(0, 10).toUpperCase()}`,
        createRequestKey: `${idempotencyKey}:${index + 1}`,
        draft: entry.draft,
        addresses: entry.addresses,
        contacts: entry.contacts,
      };
    });
    const suppliers = await this.mapPersistence(() => this.repository.importSuppliers(records));
    for (const supplier of suppliers) {
      await this.audit('supplier.created', context, supplier.id, undefined, supplier, { imported: true, importKey: idempotencyKey });
      await this.publishSupplierEvent('suppliers.supplier.created', supplier);
    }
    await this.audit('supplier.import-summary', context, context.companyId, undefined, undefined, { importKey: idempotencyKey, created: suppliers.length });
    return { committed: true, created: suppliers.length, rejected: [], suppliers, replayed: false };
  }

  async exportCsv(query: Omit<SupplierListQuery, 'page' | 'pageSize'>) {
    const suppliers = await this.repository.exportList(query);
    const rows = [
      ['supplierCode','supplierType','legalName','tradeName','primaryPhone','secondaryPhone','whatsappPhone','email','website','categoryId','category','tagIds','tags','status','addressLabel','governorate','city','street','addressDetails','landmark','addressPhone','contactName','contactJobTitle','contactPhone','contactWhatsappPhone','contactEmail','contactIsPrimary','notes','createdAt','updatedAt'],
      ...suppliers.map((supplier) => {
        const address = supplier.addresses.find((item) => item.active && item.isDefault) ?? supplier.addresses.find((item) => item.active) ?? null;
        const contact = supplier.contacts.find((item) => item.active && item.isPrimary) ?? supplier.contacts.find((item) => item.active) ?? null;
        return [
          supplier.supplierCode, supplier.supplierType, supplier.legalName, supplier.tradeName,
          supplier.primaryPhone, supplier.secondaryPhone, supplier.whatsappPhone, supplier.email, supplier.website,
          supplier.category?.id ?? '', supplier.category?.name ?? '', supplier.tags.map((tag) => tag.id).join('|'), supplier.tags.map((tag) => tag.name).join('|'), supplier.status,
          address?.label, address?.governorate, address?.city, address?.street, address?.details, address?.landmark, address?.phone,
          contact?.name, contact?.jobTitle, contact?.phone, contact?.whatsappPhone, contact?.email, contact?.isPrimary ?? false,
          supplier.notes, supplier.createdAt, supplier.updatedAt,
        ];
      }),
    ];
    return {
      filename: `suppliers-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: rows.map((row) => row.map(csvCell).join(',')).join('\n'),
      count: suppliers.length,
    };
  }

  private duplicateProbe(draft: ReturnType<typeof normalizeSupplierDraft>) {
    return {
      normalizedName: draft.normalizedName,
      normalizedTradeName: draft.normalizedTradeName,
      primaryPhone: draft.primaryPhone,
      secondaryPhone: draft.secondaryPhone,
      whatsappPhone: draft.whatsappPhone,
      email: draft.email,
      nationalId: draft.nationalId,
      taxNumber: draft.taxNumber,
      commercialRegistration: draft.commercialRegistration,
    };
  }

  private normalizeDraft(input: SupplierDraftInput) {
    try { return normalizeSupplierDraft(input); }
    catch (error) { this.rethrowDomain(error); }
  }

  private normalizeAddress(input: AddressDraftInput) {
    try { return normalizeAddressDraft(input); }
    catch (error) { this.rethrowDomain(error); }
  }

  private normalizeContact(input: ContactDraftInput) {
    try { return normalizeContactDraft(input); }
    catch (error) { this.rethrowDomain(error); }
  }

  private assertEditable(status: SupplierStatus): void {
    try { assertSupplierEditable(status); }
    catch (error) { this.rethrowDomain(error); }
  }

  private assertOneDefault(addresses: Array<{ isDefault: boolean }>): void {
    if (addresses.filter((address) => address.isDefault).length > 1) throw new ValidationError('Only one default supplier address is allowed');
  }

  private assertOnePrimary(contacts: Array<{ isPrimary: boolean }>): void {
    if (contacts.filter((contact) => contact.isPrimary).length > 1) throw new ValidationError('Only one primary supplier contact is allowed');
  }

  private assertIdempotencyKey(key: string): void {
    if (key.trim().length < 8 || key.length > 100 || hasControlCharacter(key)) {
      throw new ValidationError('Idempotency key must contain 8 to 100 visible characters');
    }
  }

  private classificationName(value: string): string {
    const name = normalizeName(value);
    if (name.length > 120) throw new ValidationError('Classification name must be 120 characters or fewer');
    return name;
  }

  private rethrowDomain(error: unknown): never {
    if (error instanceof SupplierDomainError) {
      if (error.code === 'INVALID_STATUS_TRANSITION' || error.code === 'SUPPLIER_ARCHIVED') throw new InvariantViolationError(error.message);
      throw new ValidationError(error.message);
    }
    throw error;
  }

  private async mapPersistence<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) {
      if (error instanceof SupplierConcurrentUpdateError) throw new ConflictError('Supplier data changed on another request; reload and retry');
      if (error instanceof SupplierClassificationError) throw new ValidationError(error.message);
      if (error instanceof SupplierPersistenceConflictError) throw new ConflictError(error.message || 'Supplier data conflicts with an existing record');
      throw error;
    }
  }

  private async audit(
    action: string,
    context: SupplierMutationContext,
    entityId: string,
    before?: unknown,
    after?: unknown,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const event: AuditRequestedEvent = {
      type: 'platform.audit.requested',
      occurredAt: new Date().toISOString(),
      actorId: context.actorId,
      companyId: context.companyId,
      branchId: context.branchId,
      entityType: 'supplier',
      entityId,
      action,
      before,
      after,
      metadata,
      requestId: context.requestId,
    };
    await this.events.publish(event);
  }

  private async publishSupplierEvent(type: SupplierChangedEvent['type'], supplier: SupplierSummary): Promise<void> {
    const event: SupplierChangedEvent = {
      type,
      occurredAt: new Date().toISOString(),
      companyId: supplier.companyId,
      supplierId: supplier.id,
      status: supplier.status,
    };
    await this.events.publish(event);
  }
}
