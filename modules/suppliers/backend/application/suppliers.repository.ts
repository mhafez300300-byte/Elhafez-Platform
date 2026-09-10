import type {
  SupplierAddressView,
  SupplierCategoryView,
  SupplierContactView,
  SupplierDetail,
  SupplierSensitiveView,
  SupplierStatus,
  SupplierSummary,
  SupplierTagView,
  SupplierType,
} from '../../contracts';
import type {
  NormalizedAddressDraft,
  NormalizedContactDraft,
  NormalizedSupplierDraft,
} from '../domain/supplier';

export class SupplierConcurrentUpdateError extends Error {}
export class SupplierPersistenceConflictError extends Error {}
export class SupplierClassificationError extends Error {}

export interface SupplierListQuery {
  companyId: string;
  search?: string;
  status?: SupplierStatus;
  supplierType?: SupplierType;
  categoryId?: string;
  governorate?: string;
  city?: string;
  tagIds?: string[];
  createdFrom?: Date;
  createdTo?: Date;
  page: number;
  pageSize: number;
}

export interface SupplierListResult {
  items: SupplierSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SupplierCreateRecord {
  id: string;
  companyId: string;
  supplierCode: string;
  createRequestKey: string;
  draft: NormalizedSupplierDraft;
  addresses: NormalizedAddressDraft[];
  contacts: NormalizedContactDraft[];
}

export interface SupplierUpdateRecord {
  companyId: string;
  supplierId: string;
  expectedVersion: number;
  draft: NormalizedSupplierDraft;
}

export interface AddressUpdateRecord extends NormalizedAddressDraft {
  expectedVersion: number;
}

export interface ContactUpdateRecord extends NormalizedContactDraft {
  expectedVersion: number;
}

export interface LikelyDuplicateProbe {
  normalizedName: string;
  normalizedTradeName: string | null;
  primaryPhone: string | null;
  secondaryPhone: string | null;
  whatsappPhone: string | null;
  email: string | null;
  nationalId: string | null;
  taxNumber: string | null;
  commercialRegistration: string | null;
}

export interface StrongIdentifierConflicts {
  nationalIds: Set<string>;
  taxNumbers: Set<string>;
  commercialRegistrations: Set<string>;
}

export interface SuppliersRepository {
  list(query: SupplierListQuery): Promise<SupplierListResult>;
  exportList(query: Omit<SupplierListQuery, 'page' | 'pageSize'>): Promise<SupplierDetail[]>;
  get(companyId: string, supplierId: string): Promise<SupplierDetail | null>;
  getSensitive(companyId: string, supplierId: string): Promise<SupplierSensitiveView | null>;
  findByCreateRequestKey(companyId: string, key: string): Promise<SupplierDetail | null>;
  findLikelyDuplicates(companyId: string, probe: LikelyDuplicateProbe): Promise<SupplierSummary[]>;
  create(record: SupplierCreateRecord): Promise<SupplierDetail>;
  update(record: SupplierUpdateRecord): Promise<SupplierDetail>;
  changeStatus(companyId: string, supplierId: string, expectedVersion: number, status: SupplierStatus): Promise<SupplierDetail>;

  addAddress(companyId: string, supplierId: string, address: NormalizedAddressDraft): Promise<SupplierAddressView>;
  updateAddress(companyId: string, supplierId: string, addressId: string, input: AddressUpdateRecord): Promise<SupplierAddressView>;
  setDefaultAddress(companyId: string, supplierId: string, addressId: string): Promise<SupplierAddressView>;
  deactivateAddress(companyId: string, supplierId: string, addressId: string, expectedVersion: number): Promise<SupplierAddressView>;

  addContact(companyId: string, supplierId: string, contact: NormalizedContactDraft): Promise<SupplierContactView>;
  updateContact(companyId: string, supplierId: string, contactId: string, input: ContactUpdateRecord): Promise<SupplierContactView>;
  setPrimaryContact(companyId: string, supplierId: string, contactId: string): Promise<SupplierContactView>;
  deactivateContact(companyId: string, supplierId: string, contactId: string, expectedVersion: number): Promise<SupplierContactView>;

  listCategories(companyId: string, includeInactive: boolean): Promise<SupplierCategoryView[]>;
  createCategory(companyId: string, name: string): Promise<SupplierCategoryView>;
  updateCategory(companyId: string, id: string, name: string, active: boolean): Promise<SupplierCategoryView>;
  listTags(companyId: string, includeInactive: boolean): Promise<SupplierTagView[]>;
  createTag(companyId: string, name: string): Promise<SupplierTagView>;
  updateTag(companyId: string, id: string, name: string, active: boolean): Promise<SupplierTagView>;

  findStrongIdentifierConflicts(
    companyId: string,
    nationalIds: string[],
    taxNumbers: string[],
    commercialRegistrations: string[],
  ): Promise<StrongIdentifierConflicts>;
  importSuppliers(records: SupplierCreateRecord[]): Promise<SupplierDetail[]>;
}

export const SUPPLIERS_REPOSITORY = Symbol('SUPPLIERS_REPOSITORY');
