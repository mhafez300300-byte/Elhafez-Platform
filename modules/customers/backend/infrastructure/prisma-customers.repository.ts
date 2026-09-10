import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@elhafez/database';
import type {
  CustomerAddressView,
  CustomerCategoryView,
  CustomerDetail,
  CustomerSensitiveView,
  CustomerSummary,
  CustomerTagView,
} from '../../contracts';
import { normalizeSearchText } from '../domain/customer';
import {
  CustomerClassificationError,
  CustomerConcurrentUpdateError,
  CustomerPersistenceConflictError,
  type AddressUpdateRecord,
  type CustomerCreateRecord,
  type CustomerListQuery,
  type CustomerListResult,
  type CustomerUpdateRecord,
  type CustomersRepository,
  type LikelyDuplicateProbe,
  type StrongIdentifierConflicts,
} from '../application/customers.repository';

const customerInclude = {
  category: true,
  addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] },
  tags: { include: { tag: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.CustomerInclude;

type CustomerRow = Prisma.CustomerGetPayload<{ include: typeof customerInclude }>;
type CustomerTx = Prisma.TransactionClient;

function mapCategory(row: {
  id: string;
  companyId: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}): CustomerCategoryView {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function mapTag(row: {
  id: string;
  companyId: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}): CustomerTagView {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function mapAddress(row: {
  id: string;
  customerId: string;
  label: string | null;
  governorate: string | null;
  city: string | null;
  street: string | null;
  details: string | null;
  landmark: string | null;
  phone: string | null;
  isDefault: boolean;
  active: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): CustomerAddressView {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function mapSummary(row: CustomerRow): CustomerSummary {
  const address = row.addresses.find((candidate) => candidate.active && candidate.isDefault)
    ?? row.addresses.find((candidate) => candidate.active)
    ?? null;
  return {
    id: row.id,
    companyId: row.companyId,
    customerCode: row.customerCode,
    customerType: row.customerType as CustomerSummary['customerType'],
    fullName: row.fullName,
    tradeName: row.tradeName,
    primaryPhone: row.primaryPhone,
    whatsappPhone: row.whatsappPhone,
    category: row.category ? mapCategory(row.category) : null,
    tags: row.tags.filter((link) => link.tag.active).map((link) => mapTag(link.tag)),
    city: address?.city ?? null,
    status: row.status as CustomerSummary['status'],
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapDetail(row: CustomerRow): CustomerDetail {
  return {
    ...mapSummary(row),
    secondaryPhone: row.secondaryPhone,
    email: row.email,
    source: row.source,
    notes: row.notes,
    addresses: row.addresses.map(mapAddress),
  };
}

@Injectable()
export class PrismaCustomersRepository implements CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: CustomerListQuery): Promise<CustomerListResult> {
    const where = this.where(query);
    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        include: customerInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { items: rows.map(mapSummary), page: query.page, pageSize: query.pageSize, total };
  }

  async exportList(query: Omit<CustomerListQuery, 'page' | 'pageSize'>): Promise<CustomerDetail[]> {
    const rows = await this.prisma.customer.findMany({
      where: this.where({ ...query, page: 1, pageSize: 10_000 }),
      include: customerInclude,
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      take: 10_000,
    });
    return rows.map(mapDetail);
  }

  async get(companyId: string, customerId: string): Promise<CustomerDetail | null> {
    const row = await this.prisma.customer.findFirst({ where: { id: customerId, companyId }, include: customerInclude });
    return row ? mapDetail(row) : null;
  }

  async getSensitive(companyId: string, customerId: string): Promise<CustomerSensitiveView | null> {
    const row = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId },
      select: {
        id: true,
        nationalId: true,
        taxNumber: true,
        commercialRegistration: true,
        birthDate: true,
        gender: true,
      },
    });
    return row ? {
      customerId: row.id,
      nationalId: row.nationalId,
      taxNumber: row.taxNumber,
      commercialRegistration: row.commercialRegistration,
      birthDate: row.birthDate?.toISOString().slice(0, 10) ?? null,
      gender: row.gender,
    } : null;
  }

  async findByCreateRequestKey(companyId: string, key: string): Promise<CustomerDetail | null> {
    const row = await this.prisma.customer.findFirst({
      where: { companyId, createRequestKey: key },
      include: customerInclude,
    });
    return row ? mapDetail(row) : null;
  }

  async findLikelyDuplicates(companyId: string, probe: LikelyDuplicateProbe): Promise<CustomerSummary[]> {
    const or: Prisma.CustomerWhereInput[] = [{ normalizedName: probe.normalizedName }];
    if (probe.normalizedTradeName) or.push({ normalizedTradeName: probe.normalizedTradeName });
    if (probe.nationalId) or.push({ nationalId: probe.nationalId });
    if (probe.taxNumber) or.push({ taxNumber: probe.taxNumber });
    for (const phone of [probe.primaryPhone, probe.secondaryPhone, probe.whatsappPhone]
      .filter((value): value is string => Boolean(value))) {
      or.push({ primaryPhone: phone }, { secondaryPhone: phone }, { whatsappPhone: phone });
    }
    const rows = await this.prisma.customer.findMany({
      where: { companyId, OR: or },
      include: customerInclude,
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });
    return rows.map(mapSummary);
  }

  async create(record: CustomerCreateRecord): Promise<CustomerDetail> {
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

  async update(record: CustomerUpdateRecord): Promise<CustomerDetail> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertClassification(tx, record.companyId, record.draft.categoryId, record.draft.tagIds);
        const result = await tx.customer.updateMany({
          where: { id: record.customerId, companyId: record.companyId, version: record.expectedVersion },
          data: {
            customerType: record.draft.customerType,
            fullName: record.draft.fullName,
            normalizedName: record.draft.normalizedName,
            tradeName: record.draft.tradeName,
            normalizedTradeName: record.draft.normalizedTradeName,
            primaryPhone: record.draft.primaryPhone,
            secondaryPhone: record.draft.secondaryPhone,
            whatsappPhone: record.draft.whatsappPhone,
            email: record.draft.email,
            nationalId: record.draft.nationalId,
            taxNumber: record.draft.taxNumber,
            commercialRegistration: record.draft.commercialRegistration,
            birthDate: record.draft.birthDate,
            gender: record.draft.gender,
            categoryId: record.draft.categoryId,
            source: record.draft.source,
            notes: record.draft.notes,
            version: { increment: 1 },
          },
        });
        if (result.count !== 1) throw new CustomerConcurrentUpdateError();
        await tx.customerTagAssignment.deleteMany({ where: { customerId: record.customerId } });
        if (record.draft.tagIds.length > 0) {
          await tx.customerTagAssignment.createMany({
            data: record.draft.tagIds.map((tagId) => ({ customerId: record.customerId, tagId })),
          });
        }
        const row = await tx.customer.findFirst({
          where: { id: record.customerId, companyId: record.companyId },
          include: customerInclude,
        });
        if (!row) throw new CustomerConcurrentUpdateError();
        return mapDetail(row);
      });
    } catch (error) {
      this.rethrowPersistence(error);
    }
  }

  async changeStatus(
    companyId: string,
    customerId: string,
    expectedVersion: number,
    status: CustomerSummary['status'],
  ): Promise<CustomerDetail> {
    const result = await this.prisma.customer.updateMany({
      where: { id: customerId, companyId, version: expectedVersion },
      data: { status, version: { increment: 1 } },
    });
    if (result.count !== 1) throw new CustomerConcurrentUpdateError();
    const row = await this.prisma.customer.findFirst({ where: { id: customerId, companyId }, include: customerInclude });
    if (!row) throw new CustomerConcurrentUpdateError();
    return mapDetail(row);
  }

  async addAddress(
    companyId: string,
    customerId: string,
    address: Parameters<CustomersRepository['addAddress']>[2],
  ): Promise<CustomerAddressView> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireCustomer(tx, companyId, customerId);
        if (address.isDefault) {
          await tx.customerAddress.updateMany({
            where: { customerId, active: true, isDefault: true },
            data: { isDefault: false, version: { increment: 1 } },
          });
        }
        return mapAddress(await tx.customerAddress.create({ data: { customerId, ...address } }));
      });
    } catch (error) {
      this.rethrowPersistence(error);
    }
  }

  async updateAddress(
    companyId: string,
    customerId: string,
    addressId: string,
    input: AddressUpdateRecord,
  ): Promise<CustomerAddressView> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireCustomer(tx, companyId, customerId);
        if (input.isDefault) {
          await tx.customerAddress.updateMany({
            where: { customerId, active: true, isDefault: true, NOT: { id: addressId } },
            data: { isDefault: false, version: { increment: 1 } },
          });
        }
        const result = await tx.customerAddress.updateMany({
          where: { id: addressId, customerId, version: input.expectedVersion, active: true },
          data: {
            label: input.label,
            governorate: input.governorate,
            city: input.city,
            street: input.street,
            details: input.details,
            landmark: input.landmark,
            phone: input.phone,
            isDefault: input.isDefault,
            version: { increment: 1 },
          },
        });
        if (result.count !== 1) throw new CustomerConcurrentUpdateError();
        const row = await tx.customerAddress.findFirst({ where: { id: addressId, customerId } });
        if (!row) throw new CustomerConcurrentUpdateError();
        return mapAddress(row);
      });
    } catch (error) {
      this.rethrowPersistence(error);
    }
  }

  async setDefaultAddress(companyId: string, customerId: string, addressId: string): Promise<CustomerAddressView> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireCustomer(tx, companyId, customerId);
        const target = await tx.customerAddress.findFirst({ where: { id: addressId, customerId, active: true } });
        if (!target) throw new CustomerClassificationError('Active customer address not found');
        await tx.customerAddress.updateMany({
          where: { customerId, active: true, isDefault: true, NOT: { id: addressId } },
          data: { isDefault: false, version: { increment: 1 } },
        });
        const row = await tx.customerAddress.update({
          where: { id: addressId },
          data: { isDefault: true, version: { increment: 1 } },
        });
        return mapAddress(row);
      });
    } catch (error) {
      this.rethrowPersistence(error);
    }
  }

  async deactivateAddress(
    companyId: string,
    customerId: string,
    addressId: string,
    expectedVersion: number,
  ): Promise<CustomerAddressView> {
    await this.requireCustomer(this.prisma, companyId, customerId);
    const result = await this.prisma.customerAddress.updateMany({
      where: { id: addressId, customerId, version: expectedVersion, active: true },
      data: { active: false, isDefault: false, version: { increment: 1 } },
    });
    if (result.count !== 1) throw new CustomerConcurrentUpdateError();
    const row = await this.prisma.customerAddress.findFirst({ where: { id: addressId, customerId } });
    if (!row) throw new CustomerConcurrentUpdateError();
    return mapAddress(row);
  }

  async listCategories(companyId: string, includeInactive: boolean): Promise<CustomerCategoryView[]> {
    const rows = await this.prisma.customerCategory.findMany({
      where: { companyId, ...(includeInactive ? {} : { active: true }) },
      orderBy: { name: 'asc' },
    });
    return rows.map(mapCategory);
  }

  async createCategory(companyId: string, name: string): Promise<CustomerCategoryView> {
    try {
      return mapCategory(await this.prisma.customerCategory.create({
        data: { companyId, name, normalizedName: normalizeSearchText(name) },
      }));
    } catch (error) {
      this.rethrowPersistence(error);
    }
  }

  async updateCategory(companyId: string, id: string, name: string, active: boolean): Promise<CustomerCategoryView> {
    try {
      const result = await this.prisma.customerCategory.updateMany({
        where: { id, companyId },
        data: { name, normalizedName: normalizeSearchText(name), active },
      });
      if (result.count !== 1) throw new CustomerClassificationError('Customer category not found');
      const row = await this.prisma.customerCategory.findFirst({ where: { id, companyId } });
      if (!row) throw new CustomerClassificationError('Customer category not found');
      return mapCategory(row);
    } catch (error) {
      this.rethrowPersistence(error);
    }
  }

  async listTags(companyId: string, includeInactive: boolean): Promise<CustomerTagView[]> {
    const rows = await this.prisma.customerTag.findMany({
      where: { companyId, ...(includeInactive ? {} : { active: true }) },
      orderBy: { name: 'asc' },
    });
    return rows.map(mapTag);
  }

  async createTag(companyId: string, name: string): Promise<CustomerTagView> {
    try {
      return mapTag(await this.prisma.customerTag.create({
        data: { companyId, name, normalizedName: normalizeSearchText(name) },
      }));
    } catch (error) {
      this.rethrowPersistence(error);
    }
  }

  async updateTag(companyId: string, id: string, name: string, active: boolean): Promise<CustomerTagView> {
    try {
      const result = await this.prisma.customerTag.updateMany({
        where: { id, companyId },
        data: { name, normalizedName: normalizeSearchText(name), active },
      });
      if (result.count !== 1) throw new CustomerClassificationError('Customer tag not found');
      const row = await this.prisma.customerTag.findFirst({ where: { id, companyId } });
      if (!row) throw new CustomerClassificationError('Customer tag not found');
      return mapTag(row);
    } catch (error) {
      this.rethrowPersistence(error);
    }
  }

  async findStrongIdentifierConflicts(
    companyId: string,
    nationalIds: string[],
    taxNumbers: string[],
  ): Promise<StrongIdentifierConflicts> {
    if (nationalIds.length === 0 && taxNumbers.length === 0) {
      return { nationalIds: new Set(), taxNumbers: new Set() };
    }
    const rows = await this.prisma.customer.findMany({
      where: {
        companyId,
        OR: [
          ...(nationalIds.length > 0 ? [{ nationalId: { in: nationalIds } }] : []),
          ...(taxNumbers.length > 0 ? [{ taxNumber: { in: taxNumbers } }] : []),
        ],
      },
      select: { nationalId: true, taxNumber: true },
    });
    return {
      nationalIds: new Set(rows.flatMap((row) => row.nationalId ? [row.nationalId] : [])),
      taxNumbers: new Set(rows.flatMap((row) => row.taxNumber ? [row.taxNumber] : [])),
    };
  }

  async importCustomers(records: CustomerCreateRecord[]): Promise<CustomerDetail[]> {
    try {
      const rows = await this.prisma.$transaction(async (tx) => {
        const output: CustomerRow[] = [];
        for (const record of records) output.push(await this.createInside(tx, record));
        return output;
      });
      return rows.map(mapDetail);
    } catch (error) {
      this.rethrowPersistence(error);
    }
  }

  private where(query: CustomerListQuery): Prisma.CustomerWhereInput {
    const search = query.search?.trim();
    const and: Prisma.CustomerWhereInput[] = [];
    if (query.tagIds?.length) {
      and.push(...query.tagIds.map((tagId) => ({ tags: { some: { tagId } } })));
    }
    let searchOr: Prisma.CustomerWhereInput[] | undefined;
    if (search) {
      const normalized = normalizeSearchText(search);
      const digits = search.replace(/\D/g, '');
      const identifier = search.replace(/[\s-]+/g, '').toLocaleUpperCase('en-US');
      searchOr = [
        { normalizedName: { contains: normalized } },
        { normalizedTradeName: { contains: normalized } },
        { customerCode: { contains: search.toLocaleUpperCase('en-US') } },
        { email: { contains: search.toLocaleLowerCase('en-US') } },
        ...(digits ? [
          { primaryPhone: { contains: digits } },
          { secondaryPhone: { contains: digits } },
          { whatsappPhone: { contains: digits } },
        ] : []),
        ...(identifier ? [
          { nationalId: { contains: identifier } },
          { taxNumber: { contains: identifier } },
        ] : []),
      ];
    }
    return {
      companyId: query.companyId,
      status: query.status ?? { not: 'ARCHIVED' },
      customerType: query.customerType,
      categoryId: query.categoryId,
      createdAt: query.createdFrom || query.createdTo
        ? { gte: query.createdFrom, lte: query.createdTo }
        : undefined,
      addresses: query.governorate || query.city ? {
        some: {
          active: true,
          governorate: query.governorate ? { contains: query.governorate, mode: 'insensitive' } : undefined,
          city: query.city ? { contains: query.city, mode: 'insensitive' } : undefined,
        },
      } : undefined,
      AND: and.length > 0 ? and : undefined,
      OR: searchOr,
    };
  }

  private async createInside(tx: CustomerTx, record: CustomerCreateRecord): Promise<CustomerRow> {
    await this.assertClassification(tx, record.companyId, record.draft.categoryId, record.draft.tagIds);
    return tx.customer.create({
      data: {
        id: record.id,
        companyId: record.companyId,
        customerCode: record.customerCode,
        createRequestKey: record.createRequestKey,
        customerType: record.draft.customerType,
        fullName: record.draft.fullName,
        normalizedName: record.draft.normalizedName,
        tradeName: record.draft.tradeName,
        normalizedTradeName: record.draft.normalizedTradeName,
        primaryPhone: record.draft.primaryPhone,
        secondaryPhone: record.draft.secondaryPhone,
        whatsappPhone: record.draft.whatsappPhone,
        email: record.draft.email,
        nationalId: record.draft.nationalId,
        taxNumber: record.draft.taxNumber,
        commercialRegistration: record.draft.commercialRegistration,
        birthDate: record.draft.birthDate,
        gender: record.draft.gender,
        categoryId: record.draft.categoryId,
        source: record.draft.source,
        notes: record.draft.notes,
        addresses: record.addresses.length > 0 ? { create: record.addresses } : undefined,
        tags: record.draft.tagIds.length > 0
          ? { create: record.draft.tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      include: customerInclude,
    });
  }

  private async assertClassification(
    tx: CustomerTx,
    companyId: string,
    categoryId: string | null,
    tagIds: string[],
  ): Promise<void> {
    if (categoryId) {
      const count = await tx.customerCategory.count({ where: { id: categoryId, companyId, active: true } });
      if (count !== 1) {
        throw new CustomerClassificationError('Customer category does not belong to the authorized company or is inactive');
      }
    }
    if (tagIds.length > 0) {
      const uniqueTags = [...new Set(tagIds)];
      const count = await tx.customerTag.count({ where: { id: { in: uniqueTags }, companyId, active: true } });
      if (count !== uniqueTags.length) {
        throw new CustomerClassificationError('One or more customer tags are invalid for the authorized company');
      }
    }
  }

  private async requireCustomer(
    client: Pick<PrismaService, 'customer'> | CustomerTx,
    companyId: string,
    customerId: string,
  ): Promise<void> {
    const count = await client.customer.count({ where: { id: customerId, companyId } });
    if (count !== 1) throw new CustomerClassificationError('Customer not found in authorized company');
  }

  private isUniqueConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private rethrowPersistence(error: unknown): never {
    if (
      error instanceof CustomerConcurrentUpdateError
      || error instanceof CustomerClassificationError
      || error instanceof CustomerPersistenceConflictError
    ) {
      throw error;
    }
    if (this.isUniqueConflict(error)) {
      throw new CustomerPersistenceConflictError('Customer data conflicts with an existing unique record');
    }
    throw error;
  }
}
