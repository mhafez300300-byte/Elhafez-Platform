import type {
  CustomerAddressView,
  CustomerCategoryView,
  CustomerDetail,
  CustomerSensitiveView,
  CustomerStatus,
  CustomerSummary,
  CustomerTagView,
  CustomerType,
} from '../../contracts';
import type { NormalizedAddressDraft, NormalizedCustomerDraft } from '../domain/customer';

export class CustomerConcurrentUpdateError extends Error {}
export class CustomerPersistenceConflictError extends Error {}
export class CustomerClassificationError extends Error {}

export interface CustomerListQuery {
  companyId: string;
  search?: string;
  status?: CustomerStatus;
  customerType?: CustomerType;
  categoryId?: string;
  governorate?: string;
  city?: string;
  tagIds?: string[];
  createdFrom?: Date;
  createdTo?: Date;
  page: number;
  pageSize: number;
}

export interface CustomerListResult {
  items: CustomerSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CustomerCreateRecord {
  id: string;
  companyId: string;
  customerCode: string;
  createRequestKey: string;
  draft: NormalizedCustomerDraft;
  addresses: NormalizedAddressDraft[];
}

export interface CustomerUpdateRecord {
  companyId: string;
  customerId: string;
  expectedVersion: number;
  draft: NormalizedCustomerDraft;
}

export interface AddressUpdateRecord extends NormalizedAddressDraft {
  expectedVersion: number;
}

export interface LikelyDuplicateProbe {
  normalizedName: string;
  normalizedTradeName: string | null;
  primaryPhone: string | null;
  secondaryPhone: string | null;
  whatsappPhone: string | null;
  nationalId: string | null;
  taxNumber: string | null;
}

export interface StrongIdentifierConflicts {
  nationalIds: Set<string>;
  taxNumbers: Set<string>;
}

export interface CustomersRepository {
  list(query: CustomerListQuery): Promise<CustomerListResult>;
  exportList(query: Omit<CustomerListQuery, 'page' | 'pageSize'>): Promise<CustomerDetail[]>;
  get(companyId: string, customerId: string): Promise<CustomerDetail | null>;
  getSensitive(companyId: string, customerId: string): Promise<CustomerSensitiveView | null>;
  findByCreateRequestKey(companyId: string, key: string): Promise<CustomerDetail | null>;
  findLikelyDuplicates(companyId: string, probe: LikelyDuplicateProbe): Promise<CustomerSummary[]>;
  create(record: CustomerCreateRecord): Promise<CustomerDetail>;
  update(record: CustomerUpdateRecord): Promise<CustomerDetail>;
  changeStatus(companyId: string, customerId: string, expectedVersion: number, status: CustomerStatus): Promise<CustomerDetail>;
  addAddress(companyId: string, customerId: string, address: NormalizedAddressDraft): Promise<CustomerAddressView>;
  updateAddress(companyId: string, customerId: string, addressId: string, input: AddressUpdateRecord): Promise<CustomerAddressView>;
  setDefaultAddress(companyId: string, customerId: string, addressId: string): Promise<CustomerAddressView>;
  deactivateAddress(companyId: string, customerId: string, addressId: string, expectedVersion: number): Promise<CustomerAddressView>;
  listCategories(companyId: string, includeInactive: boolean): Promise<CustomerCategoryView[]>;
  createCategory(companyId: string, name: string): Promise<CustomerCategoryView>;
  updateCategory(companyId: string, id: string, name: string, active: boolean): Promise<CustomerCategoryView>;
  listTags(companyId: string, includeInactive: boolean): Promise<CustomerTagView[]>;
  createTag(companyId: string, name: string): Promise<CustomerTagView>;
  updateTag(companyId: string, id: string, name: string, active: boolean): Promise<CustomerTagView>;
  findStrongIdentifierConflicts(companyId: string, nationalIds: string[], taxNumbers: string[]): Promise<StrongIdentifierConflicts>;
  importCustomers(records: CustomerCreateRecord[]): Promise<CustomerDetail[]>;
}

export const CUSTOMERS_REPOSITORY = Symbol('CUSTOMERS_REPOSITORY');
