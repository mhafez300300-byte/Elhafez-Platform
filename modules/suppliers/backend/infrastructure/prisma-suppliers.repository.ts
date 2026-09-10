import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@elhafez/database';
import type {
  SupplierAddressView,
  SupplierCategoryView,
  SupplierContactView,
  SupplierDetail,
  SupplierSensitiveView,
  SupplierSummary,
  SupplierTagView,
} from '../../contracts';
import { normalizeSearchText } from '../domain/supplier';
import {
  SupplierClassificationError,
  SupplierConcurrentUpdateError,
  SupplierPersistenceConflictError,
  type AddressUpdateRecord,
  type ContactUpdateRecord,
  type LikelyDuplicateProbe,
  type StrongIdentifierConflicts,
  type SupplierCreateRecord,
  type SupplierListQuery,
  type SupplierListResult,
  type SupplierUpdateRecord,
  type SuppliersRepository,
} from '../application/suppliers.repository';

const supplierInclude = {
  category: true,
  addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] },
  contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
  tags: { include: { tag: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.SupplierInclude;

type SupplierRow = Prisma.SupplierGetPayload<{ include: typeof supplierInclude }>;
type SupplierTx = Prisma.TransactionClient;

function mapCategory(row: {
  id: string; companyId: string; name: string; active: boolean; createdAt: Date; updatedAt: Date;
}): SupplierCategoryView {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function mapTag(row: {
  id: string; companyId: string; name: string; active: boolean; createdAt: Date; updatedAt: Date;
}): SupplierTagView {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function mapAddress(row: {
  id: string; supplierId: string; label: string | null; governorate: string | null; city: string | null;
  street: string | null; details: string | null; landmark: string | null; phone: string | null;
  isDefault: boolean; active: boolean; version: number; createdAt: Date; updatedAt: Date;
}): SupplierAddressView {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function mapContact(row: {
  id: string; supplierId: string; name: string; jobTitle: string | null; phone: string | null;
  whatsappPhone: string | null; email: string | null; isPrimary: boolean; active: boolean;
  version: number; createdAt: Date; updatedAt: Date;
}): SupplierContactView {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function mapSummary(row: SupplierRow): SupplierSummary {
  const address = row.addresses.find((candidate) => candidate.active && candidate.isDefault)
    ?? row.addresses.find((candidate) => candidate.active)
    ?? null;
  const primaryContact = row.contacts.find((candidate) => candidate.active && candidate.isPrimary) ?? null;
  return {
    id: row.id,
    companyId: row.companyId,
    supplierCode: row.supplierCode,
    supplierType: row.supplierType as SupplierSummary['supplierType'],
    legalName: row.legalName,
    tradeName: row.tradeName,
    primaryPhone: row.primaryPhone,
    whatsappPhone: row.whatsappPhone,
    category: row.category ? mapCategory(row.category) : null,
    tags: row.tags.filter((link) => link.tag.active).map((link) => mapTag(link.tag)),
    city: address?.city ?? null,
    primaryContact: primaryContact ? mapContact(primaryContact) : null,
    status: row.status as SupplierSummary['status'],
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapDetail(row: SupplierRow): SupplierDetail {
  return {
    ...mapSummary(row),
    secondaryPhone: row.secondaryPhone,
    email: row.email,
    website: row.website,
    notes: row.notes,
    addresses: row.addresses.map(mapAddress),
    contacts: row.contacts.map(mapContact),
  };
}

@Injectable()
export class PrismaSuppliersRepository implements SuppliersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: SupplierListQuery): Promise<SupplierListResult> {
    const where = this.where(query);
    const [rows, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        include: supplierInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return { items: rows.map(mapSummary), page: query.page, pageSize: query.pageSize, total };
  }

  async exportList(query: Omit<SupplierListQuery, 'page' | 'pageSize'>): Promise<SupplierDetail[]> {
    const rows = await this.prisma.supplier.findMany({
      where: this.where({ ...query, page: 1, pageSize: 10_000 }),
      include: supplierInclude,
      orderBy: [{ legalName: 'asc' }, { id: 'asc' }],
      take: 10_000,
    });
    return rows.map(mapDetail);
  }

  async get(companyId: string, supplierId: string): Promise<SupplierDetail | null> {
    const row = await this.prisma.supplier.findFirst({ where: { id: supplierId, companyId }, include: supplierInclude });
    return row ? mapDetail(row) : null;
  }

  async getSensitive(companyId: string, supplierId: string): Promise<SupplierSensitiveView | null> {
    const row = await this.prisma.supplier.findFirst({
      where: { id: supplierId, companyId },
      select: { id: true, nationalId: true, taxNumber: true, commercialRegistration: true },
    });
    return row ? {
      supplierId: row.id,
      nationalId: row.nationalId,
      taxNumber: row.taxNumber,
      commercialRegistration: row.commercialRegistration,
    } : null;
  }

  async findByCreateRequestKey(companyId: string, key: string): Promise<SupplierDetail | null> {
    const row = await this.prisma.supplier.findFirst({ where: { companyId, createRequestKey: key }, include: supplierInclude });
    return row ? mapDetail(row) : null;
  }

  async findLikelyDuplicates(companyId: string, probe: LikelyDuplicateProbe): Promise<SupplierSummary[]> {
    const or: Prisma.SupplierWhereInput[] = [{ normalizedName: probe.normalizedName }];
    if (probe.normalizedTradeName) or.push({ normalizedTradeName: probe.normalizedTradeName });
    if (probe.email) or.push({ email: probe.email });
    if (probe.nationalId) or.push({ nationalId: probe.nationalId });
    if (probe.taxNumber) or.push({ taxNumber: probe.taxNumber });
    if (probe.commercialRegistration) or.push({ commercialRegistration: probe.commercialRegistration });
    for (const phone of [probe.primaryPhone, probe.secondaryPhone, probe.whatsappPhone]
      .filter((value): value is string => Boolean(value))) {
      or.push({ primaryPhone: phone }, { secondaryPhone: phone }, { whatsappPhone: phone });
    }
    const rows = await this.prisma.supplier.findMany({
      where: { companyId, OR: or },
      include: supplierInclude,
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });
    return rows.map(mapSummary);
  }

  async create(record: SupplierCreateRecord): Promise<SupplierDetail> {
    try {
      const row = await this.prisma.$transaction((tx) => this.createInside(tx, record));
      return mapDetail(row);
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const replay = await this.findByCreateRequestKey(record.companyId, record.createRequestKey);
        if (replay) return replay;
      }
      this.rethrowPersistence(error);
    }
  }

  async update(record: SupplierUpdateRecord): Promise<SupplierDetail> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertClassification(tx, record.companyId, record.draft.categoryId, record.draft.tagIds);
        const result = await tx.supplier.updateMany({
          where: { id: record.supplierId, companyId: record.companyId, version: record.expectedVersion },
          data: {
            supplierType: record.draft.supplierType,
            legalName: record.draft.legalName,
            normalizedName: record.draft.normalizedName,
            tradeName: record.draft.tradeName,
            normalizedTradeName: record.draft.normalizedTradeName,
            primaryPhone: record.draft.primaryPhone,
            secondaryPhone: record.draft.secondaryPhone,
            whatsappPhone: record.draft.whatsappPhone,
            email: record.draft.email,
            website: record.draft.website,
            nationalId: record.draft.nationalId,
            taxNumber: record.draft.taxNumber,
            commercialRegistration: record.draft.commercialRegistration,
            categoryId: record.draft.categoryId,
            notes: record.draft.notes,
            version: { increment: 1 },
          },
        });
        if (result.count !== 1) throw new SupplierConcurrentUpdateError();
        await tx.supplierTagAssignment.deleteMany({ where: { supplierId: record.supplierId } });
        if (record.draft.tagIds.length > 0) {
          await tx.supplierTagAssignment.createMany({
            data: record.draft.tagIds.map((tagId) => ({ supplierId: record.supplierId, tagId })),
          });
        }
        const row = await tx.supplier.findFirst({ where: { id: record.supplierId, companyId: record.companyId }, include: supplierInclude });
        if (!row) throw new SupplierConcurrentUpdateError();
        return mapDetail(row);
      });
    } catch (error) {
      this.rethrowPersistence(error);
    }
  }

  async changeStatus(
    companyId: string,
    supplierId: string,
    expectedVersion: number,
    status: SupplierSummary['status'],
  ): Promise<SupplierDetail> {
    const result = await this.prisma.supplier.updateMany({
      where: { id: supplierId, companyId, version: expectedVersion },
      data: { status, version: { increment: 1 } },
    });
    if (result.count !== 1) throw new SupplierConcurrentUpdateError();
    const row = await this.prisma.supplier.findFirst({ where: { id: supplierId, companyId }, include: supplierInclude });
    if (!row) throw new SupplierConcurrentUpdateError();
    return mapDetail(row);
  }

  async addAddress(companyId: string, supplierId: string, address: Parameters<SuppliersRepository['addAddress']>[2]): Promise<SupplierAddressView> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireSupplier(tx, companyId, supplierId);
        if (address.isDefault) {
          await tx.supplierAddress.updateMany({
            where: { supplierId, active: true, isDefault: true },
            data: { isDefault: false, version: { increment: 1 } },
          });
        }
        return mapAddress(await tx.supplierAddress.create({ data: { supplierId, ...address } }));
      });
    } catch (error) { this.rethrowPersistence(error); }
  }

  async updateAddress(companyId: string, supplierId: string, addressId: string, input: AddressUpdateRecord): Promise<SupplierAddressView> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireSupplier(tx, companyId, supplierId);
        if (input.isDefault) {
          await tx.supplierAddress.updateMany({
            where: { supplierId, active: true, isDefault: true, NOT: { id: addressId } },
            data: { isDefault: false, version: { increment: 1 } },
          });
        }
        const result = await tx.supplierAddress.updateMany({
          where: { id: addressId, supplierId, version: input.expectedVersion, active: true },
          data: {
            label: input.label, governorate: input.governorate, city: input.city, street: input.street,
            details: input.details, landmark: input.landmark, phone: input.phone, isDefault: input.isDefault,
            version: { increment: 1 },
          },
        });
        if (result.count !== 1) throw new SupplierConcurrentUpdateError();
        const row = await tx.supplierAddress.findFirst({ where: { id: addressId, supplierId } });
        if (!row) throw new SupplierConcurrentUpdateError();
        return mapAddress(row);
      });
    } catch (error) { this.rethrowPersistence(error); }
  }

  async setDefaultAddress(companyId: string, supplierId: string, addressId: string): Promise<SupplierAddressView> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireSupplier(tx, companyId, supplierId);
        const target = await tx.supplierAddress.findFirst({ where: { id: addressId, supplierId, active: true } });
        if (!target) throw new SupplierClassificationError('Active supplier address not found');
        await tx.supplierAddress.updateMany({
          where: { supplierId, active: true, isDefault: true, NOT: { id: addressId } },
          data: { isDefault: false, version: { increment: 1 } },
        });
        const row = await tx.supplierAddress.update({ where: { id: addressId }, data: { isDefault: true, version: { increment: 1 } } });
        return mapAddress(row);
      });
    } catch (error) { this.rethrowPersistence(error); }
  }

  async deactivateAddress(companyId: string, supplierId: string, addressId: string, expectedVersion: number): Promise<SupplierAddressView> {
    await this.requireSupplier(this.prisma, companyId, supplierId);
    const result = await this.prisma.supplierAddress.updateMany({
      where: { id: addressId, supplierId, version: expectedVersion, active: true },
      data: { active: false, isDefault: false, version: { increment: 1 } },
    });
    if (result.count !== 1) throw new SupplierConcurrentUpdateError();
    const row = await this.prisma.supplierAddress.findFirst({ where: { id: addressId, supplierId } });
    if (!row) throw new SupplierConcurrentUpdateError();
    return mapAddress(row);
  }

  async addContact(companyId: string, supplierId: string, contact: Parameters<SuppliersRepository['addContact']>[2]): Promise<SupplierContactView> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireSupplier(tx, companyId, supplierId);
        if (contact.isPrimary) {
          await tx.supplierContact.updateMany({
            where: { supplierId, active: true, isPrimary: true },
            data: { isPrimary: false, version: { increment: 1 } },
          });
        }
        return mapContact(await tx.supplierContact.create({ data: { supplierId, ...contact } }));
      });
    } catch (error) { this.rethrowPersistence(error); }
  }

  async updateContact(companyId: string, supplierId: string, contactId: string, input: ContactUpdateRecord): Promise<SupplierContactView> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireSupplier(tx, companyId, supplierId);
        if (input.isPrimary) {
          await tx.supplierContact.updateMany({
            where: { supplierId, active: true, isPrimary: true, NOT: { id: contactId } },
            data: { isPrimary: false, version: { increment: 1 } },
          });
        }
        const result = await tx.supplierContact.updateMany({
          where: { id: contactId, supplierId, version: input.expectedVersion, active: true },
          data: {
            name: input.name, jobTitle: input.jobTitle, phone: input.phone, whatsappPhone: input.whatsappPhone,
            email: input.email, isPrimary: input.isPrimary, version: { increment: 1 },
          },
        });
        if (result.count !== 1) throw new SupplierConcurrentUpdateError();
        const row = await tx.supplierContact.findFirst({ where: { id: contactId, supplierId } });
        if (!row) throw new SupplierConcurrentUpdateError();
        return mapContact(row);
      });
    } catch (error) { this.rethrowPersistence(error); }
  }

  async setPrimaryContact(companyId: string, supplierId: string, contactId: string): Promise<SupplierContactView> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireSupplier(tx, companyId, supplierId);
        const target = await tx.supplierContact.findFirst({ where: { id: contactId, supplierId, active: true } });
        if (!target) throw new SupplierClassificationError('Active supplier contact not found');
        await tx.supplierContact.updateMany({
          where: { supplierId, active: true, isPrimary: true, NOT: { id: contactId } },
          data: { isPrimary: false, version: { increment: 1 } },
        });
        const row = await tx.supplierContact.update({ where: { id: contactId }, data: { isPrimary: true, version: { increment: 1 } } });
        return mapContact(row);
      });
    } catch (error) { this.rethrowPersistence(error); }
  }

  async deactivateContact(companyId: string, supplierId: string, contactId: string, expectedVersion: number): Promise<SupplierContactView> {
    await this.requireSupplier(this.prisma, companyId, supplierId);
    const result = await this.prisma.supplierContact.updateMany({
      where: { id: contactId, supplierId, version: expectedVersion, active: true },
      data: { active: false, isPrimary: false, version: { increment: 1 } },
    });
    if (result.count !== 1) throw new SupplierConcurrentUpdateError();
    const row = await this.prisma.supplierContact.findFirst({ where: { id: contactId, supplierId } });
    if (!row) throw new SupplierConcurrentUpdateError();
    return mapContact(row);
  }

  async listCategories(companyId: string, includeInactive: boolean): Promise<SupplierCategoryView[]> {
    const rows = await this.prisma.supplierCategory.findMany({ where: { companyId, ...(includeInactive ? {} : { active: true }) }, orderBy: { name: 'asc' } });
    return rows.map(mapCategory);
  }

  async createCategory(companyId: string, name: string): Promise<SupplierCategoryView> {
    try {
      return mapCategory(await this.prisma.supplierCategory.create({ data: { companyId, name, normalizedName: normalizeSearchText(name) } }));
    } catch (error) { this.rethrowPersistence(error); }
  }

  async updateCategory(companyId: string, id: string, name: string, active: boolean): Promise<SupplierCategoryView> {
    try {
      const result = await this.prisma.supplierCategory.updateMany({ where: { id, companyId }, data: { name, normalizedName: normalizeSearchText(name), active } });
      if (result.count !== 1) throw new SupplierClassificationError('Supplier category not found');
      const row = await this.prisma.supplierCategory.findFirst({ where: { id, companyId } });
      if (!row) throw new SupplierClassificationError('Supplier category not found');
      return mapCategory(row);
    } catch (error) { this.rethrowPersistence(error); }
  }

  async listTags(companyId: string, includeInactive: boolean): Promise<SupplierTagView[]> {
    const rows = await this.prisma.supplierTag.findMany({ where: { companyId, ...(includeInactive ? {} : { active: true }) }, orderBy: { name: 'asc' } });
    return rows.map(mapTag);
  }

  async createTag(companyId: string, name: string): Promise<SupplierTagView> {
    try {
      return mapTag(await this.prisma.supplierTag.create({ data: { companyId, name, normalizedName: normalizeSearchText(name) } }));
    } catch (error) { this.rethrowPersistence(error); }
  }

  async updateTag(companyId: string, id: string, name: string, active: boolean): Promise<SupplierTagView> {
    try {
      const result = await this.prisma.supplierTag.updateMany({ where: { id, companyId }, data: { name, normalizedName: normalizeSearchText(name), active } });
      if (result.count !== 1) throw new SupplierClassificationError('Supplier tag not found');
      const row = await this.prisma.supplierTag.findFirst({ where: { id, companyId } });
      if (!row) throw new SupplierClassificationError('Supplier tag not found');
      return mapTag(row);
    } catch (error) { this.rethrowPersistence(error); }
  }

  async findStrongIdentifierConflicts(
    companyId: string,
    nationalIds: string[],
    taxNumbers: string[],
    commercialRegistrations: string[],
  ): Promise<StrongIdentifierConflicts> {
    if (nationalIds.length === 0 && taxNumbers.length === 0 && commercialRegistrations.length === 0) {
      return { nationalIds: new Set(), taxNumbers: new Set(), commercialRegistrations: new Set() };
    }
    const rows = await this.prisma.supplier.findMany({
      where: {
        companyId,
        OR: [
          ...(nationalIds.length > 0 ? [{ nationalId: { in: nationalIds } }] : []),
          ...(taxNumbers.length > 0 ? [{ taxNumber: { in: taxNumbers } }] : []),
          ...(commercialRegistrations.length > 0 ? [{ commercialRegistration: { in: commercialRegistrations } }] : []),
        ],
      },
      select: { nationalId: true, taxNumber: true, commercialRegistration: true },
    });
    return {
      nationalIds: new Set(rows.flatMap((row) => row.nationalId ? [row.nationalId] : [])),
      taxNumbers: new Set(rows.flatMap((row) => row.taxNumber ? [row.taxNumber] : [])),
      commercialRegistrations: new Set(rows.flatMap((row) => row.commercialRegistration ? [row.commercialRegistration] : [])),
    };
  }

  async importSuppliers(records: SupplierCreateRecord[]): Promise<SupplierDetail[]> {
    try {
      const rows = await this.prisma.$transaction(async (tx) => {
        const output: SupplierRow[] = [];
        for (const record of records) output.push(await this.createInside(tx, record));
        return output;
      });
      return rows.map(mapDetail);
    } catch (error) { this.rethrowPersistence(error); }
  }

  private where(query: SupplierListQuery): Prisma.SupplierWhereInput {
    const search = query.search?.trim();
    const and: Prisma.SupplierWhereInput[] = [];
    if (query.tagIds?.length) and.push(...query.tagIds.map((tagId) => ({ tags: { some: { tagId } } })));
    let searchOr: Prisma.SupplierWhereInput[] | undefined;
    if (search) {
      const normalized = normalizeSearchText(search);
      const digits = search.replace(/\D/g, '');
      const identifier = search.replace(/[\s-]+/g, '').toLocaleUpperCase('en-US');
      searchOr = [
        { normalizedName: { contains: normalized } },
        { normalizedTradeName: { contains: normalized } },
        { supplierCode: { contains: search.toLocaleUpperCase('en-US') } },
        { email: { contains: search.toLocaleLowerCase('en-US') } },
        ...(digits ? [
          { primaryPhone: { contains: digits } }, { secondaryPhone: { contains: digits } }, { whatsappPhone: { contains: digits } },
          { contacts: { some: { active: true, OR: [{ phone: { contains: digits } }, { whatsappPhone: { contains: digits } }] } } },
        ] : []),
        ...(identifier ? [
          { nationalId: { contains: identifier } }, { taxNumber: { contains: identifier } }, { commercialRegistration: { contains: identifier } },
        ] : []),
        { contacts: { some: { active: true, OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ] } } },
      ];
    }
    return {
      companyId: query.companyId,
      status: query.status ?? { not: 'ARCHIVED' },
      supplierType: query.supplierType,
      categoryId: query.categoryId,
      createdAt: query.createdFrom || query.createdTo ? { gte: query.createdFrom, lte: query.createdTo } : undefined,
      addresses: query.governorate || query.city ? { some: {
        active: true,
        governorate: query.governorate ? { contains: query.governorate, mode: 'insensitive' } : undefined,
        city: query.city ? { contains: query.city, mode: 'insensitive' } : undefined,
      } } : undefined,
      AND: and.length > 0 ? and : undefined,
      OR: searchOr,
    };
  }

  private async createInside(tx: SupplierTx, record: SupplierCreateRecord): Promise<SupplierRow> {
    await this.assertClassification(tx, record.companyId, record.draft.categoryId, record.draft.tagIds);
    return tx.supplier.create({
      data: {
        id: record.id,
        companyId: record.companyId,
        supplierCode: record.supplierCode,
        createRequestKey: record.createRequestKey,
        supplierType: record.draft.supplierType,
        legalName: record.draft.legalName,
        normalizedName: record.draft.normalizedName,
        tradeName: record.draft.tradeName,
        normalizedTradeName: record.draft.normalizedTradeName,
        primaryPhone: record.draft.primaryPhone,
        secondaryPhone: record.draft.secondaryPhone,
        whatsappPhone: record.draft.whatsappPhone,
        email: record.draft.email,
        website: record.draft.website,
        nationalId: record.draft.nationalId,
        taxNumber: record.draft.taxNumber,
        commercialRegistration: record.draft.commercialRegistration,
        categoryId: record.draft.categoryId,
        notes: record.draft.notes,
        addresses: record.addresses.length > 0 ? { create: record.addresses } : undefined,
        contacts: record.contacts.length > 0 ? { create: record.contacts } : undefined,
        tags: record.draft.tagIds.length > 0 ? { create: record.draft.tagIds.map((tagId) => ({ tagId })) } : undefined,
      },
      include: supplierInclude,
    });
  }

  private async assertClassification(tx: SupplierTx, companyId: string, categoryId: string | null, tagIds: string[]): Promise<void> {
    if (categoryId) {
      const count = await tx.supplierCategory.count({ where: { id: categoryId, companyId, active: true } });
      if (count !== 1) throw new SupplierClassificationError('Supplier category does not belong to the authorized company or is inactive');
    }
    if (tagIds.length > 0) {
      const uniqueTags = [...new Set(tagIds)];
      const count = await tx.supplierTag.count({ where: { id: { in: uniqueTags }, companyId, active: true } });
      if (count !== uniqueTags.length) throw new SupplierClassificationError('One or more supplier tags are invalid for the authorized company');
    }
  }

  private async requireSupplier(client: Pick<PrismaService, 'supplier'> | SupplierTx, companyId: string, supplierId: string): Promise<void> {
    const count = await client.supplier.count({ where: { id: supplierId, companyId } });
    if (count !== 1) throw new SupplierClassificationError('Supplier not found in authorized company');
  }

  private isUniqueConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private rethrowPersistence(error: unknown): never {
    if (error instanceof SupplierConcurrentUpdateError || error instanceof SupplierClassificationError || error instanceof SupplierPersistenceConflictError) throw error;
    if (this.isUniqueConflict(error)) throw new SupplierPersistenceConflictError('Supplier data conflicts with an existing unique record');
    throw error;
  }
}
