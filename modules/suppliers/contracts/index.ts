export const SUPPLIER_READER = Symbol('SUPPLIER_READER');

export type SupplierType = 'INDIVIDUAL' | 'COMPANY';
export type SupplierStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

export interface SupplierCategoryView {
  id: string;
  companyId: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierTagView {
  id: string;
  companyId: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierAddressView {
  id: string;
  supplierId: string;
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

export interface SupplierContactView {
  id: string;
  supplierId: string;
  name: string;
  jobTitle: string | null;
  phone: string | null;
  whatsappPhone: string | null;
  email: string | null;
  isPrimary: boolean;
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierSummary {
  id: string;
  companyId: string;
  supplierCode: string;
  supplierType: SupplierType;
  legalName: string;
  tradeName: string | null;
  primaryPhone: string | null;
  whatsappPhone: string | null;
  category: SupplierCategoryView | null;
  tags: SupplierTagView[];
  city: string | null;
  primaryContact: SupplierContactView | null;
  status: SupplierStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierDetail extends SupplierSummary {
  secondaryPhone: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
  addresses: SupplierAddressView[];
  contacts: SupplierContactView[];
}

export interface SupplierSensitiveView {
  supplierId: string;
  nationalId: string | null;
  taxNumber: string | null;
  commercialRegistration: string | null;
}

export interface SupplierReader {
  getSupplierSummary(companyId: string, supplierId: string): Promise<SupplierSummary | null>;
  isSupplierAvailable(companyId: string, supplierId: string): Promise<boolean>;
}

export interface SupplierChangedEvent {
  type: 'suppliers.supplier.created' | 'suppliers.supplier.updated' | 'suppliers.supplier.status-changed';
  occurredAt: string;
  companyId: string;
  supplierId: string;
  status: SupplierStatus;
}
