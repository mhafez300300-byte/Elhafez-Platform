export const CUSTOMER_READER = Symbol('CUSTOMER_READER');

export type CustomerType = 'INDIVIDUAL' | 'COMPANY';
export type CustomerStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

export interface CustomerCategoryView {
  id: string;
  companyId: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerTagView {
  id: string;
  companyId: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerAddressView {
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
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSummary {
  id: string;
  companyId: string;
  customerCode: string;
  customerType: CustomerType;
  fullName: string;
  tradeName: string | null;
  primaryPhone: string | null;
  whatsappPhone: string | null;
  category: CustomerCategoryView | null;
  tags: CustomerTagView[];
  city: string | null;
  status: CustomerStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDetail extends CustomerSummary {
  secondaryPhone: string | null;
  email: string | null;
  source: string | null;
  notes: string | null;
  addresses: CustomerAddressView[];
}

export interface CustomerSensitiveView {
  customerId: string;
  nationalId: string | null;
  taxNumber: string | null;
  commercialRegistration: string | null;
  birthDate: string | null;
  gender: string | null;
}

export interface CustomerReader {
  getCustomerSummary(companyId: string, customerId: string): Promise<CustomerSummary | null>;
  isCustomerAvailable(companyId: string, customerId: string): Promise<boolean>;
}

export interface CustomerChangedEvent {
  type: 'customers.customer.created' | 'customers.customer.updated' | 'customers.customer.status-changed';
  occurredAt: string;
  companyId: string;
  customerId: string;
  status: CustomerStatus;
}
