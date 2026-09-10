import type { CustomerStatus, CustomerType } from '../../contracts';

export type CustomerDomainErrorCode =
  | 'INVALID_NAME'
  | 'INVALID_PHONE'
  | 'INVALID_EMAIL'
  | 'INVALID_IDENTIFIER'
  | 'INVALID_STATUS_TRANSITION'
  | 'CUSTOMER_ARCHIVED'
  | 'INVALID_ADDRESS';

export class CustomerDomainError extends Error {
  constructor(public readonly code: CustomerDomainErrorCode, message: string) {
    super(message);
    this.name = 'CustomerDomainError';
  }
}

export interface CustomerDraftInput {
  customerType: CustomerType;
  fullName: string;
  tradeName?: string | null;
  primaryPhone?: string | null;
  secondaryPhone?: string | null;
  whatsappPhone?: string | null;
  email?: string | null;
  nationalId?: string | null;
  taxNumber?: string | null;
  commercialRegistration?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  categoryId?: string | null;
  source?: string | null;
  notes?: string | null;
  tagIds?: string[];
}

export interface NormalizedCustomerDraft {
  customerType: CustomerType;
  fullName: string;
  normalizedName: string;
  tradeName: string | null;
  normalizedTradeName: string | null;
  primaryPhone: string | null;
  secondaryPhone: string | null;
  whatsappPhone: string | null;
  email: string | null;
  nationalId: string | null;
  taxNumber: string | null;
  commercialRegistration: string | null;
  birthDate: Date | null;
  gender: string | null;
  categoryId: string | null;
  source: string | null;
  notes: string | null;
  tagIds: string[];
}

export interface AddressDraftInput {
  label?: string | null;
  governorate?: string | null;
  city?: string | null;
  street?: string | null;
  details?: string | null;
  landmark?: string | null;
  phone?: string | null;
  isDefault?: boolean;
}

export interface NormalizedAddressDraft {
  label: string | null;
  governorate: string | null;
  city: string | null;
  street: string | null;
  details: string | null;
  landmark: string | null;
  phone: string | null;
  isDefault: boolean;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function cleanText(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) return null;
  if (cleaned.length > max || hasControlCharacter(cleaned)) {
    throw new CustomerDomainError('INVALID_NAME', 'Text value is invalid or too long');
  }
  return cleaned;
}

export function normalizeName(value: string): string {
  const cleaned = cleanText(value, 180);
  if (!cleaned) throw new CustomerDomainError('INVALID_NAME', 'Customer name is required');
  return cleaned;
}

export function normalizeSearchText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function normalizePhone(value: string | null | undefined): string | null {
  if (value == null || !value.trim()) return null;
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    throw new CustomerDomainError('INVALID_PHONE', 'Phone number must contain 7 to 15 digits');
  }
  return `${hasPlus ? '+' : ''}${digits}`;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  if (value == null || !value.trim()) return null;
  const email = value.trim().toLocaleLowerCase('en-US');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CustomerDomainError('INVALID_EMAIL', 'Email address is invalid');
  }
  return email;
}

export function normalizeStrongIdentifier(value: string | null | undefined): string | null {
  if (value == null || !value.trim()) return null;
  const identifier = value.trim().replace(/[\s-]+/g, '').toLocaleUpperCase('en-US');
  if (identifier.length < 4 || identifier.length > 40 || !/^[A-Z0-9]+$/.test(identifier)) {
    throw new CustomerDomainError('INVALID_IDENTIFIER', 'Identifier must contain 4 to 40 letters or digits');
  }
  return identifier;
}

function normalizeOptional(value: string | null | undefined, max: number): string | null {
  return cleanText(value, max);
}

export function normalizeCustomerDraft(input: CustomerDraftInput): NormalizedCustomerDraft {
  const fullName = normalizeName(input.fullName);
  const tradeName = normalizeOptional(input.tradeName, 180);
  const birthDate = input.birthDate ? new Date(`${input.birthDate}T00:00:00.000Z`) : null;
  if (birthDate && Number.isNaN(birthDate.getTime())) {
    throw new CustomerDomainError('INVALID_IDENTIFIER', 'Birth date is invalid');
  }
  return {
    customerType: input.customerType,
    fullName,
    normalizedName: normalizeSearchText(fullName),
    tradeName,
    normalizedTradeName: tradeName ? normalizeSearchText(tradeName) : null,
    primaryPhone: normalizePhone(input.primaryPhone),
    secondaryPhone: normalizePhone(input.secondaryPhone),
    whatsappPhone: normalizePhone(input.whatsappPhone),
    email: normalizeEmail(input.email),
    nationalId: normalizeStrongIdentifier(input.nationalId),
    taxNumber: normalizeStrongIdentifier(input.taxNumber),
    commercialRegistration: normalizeOptional(input.commercialRegistration, 80),
    birthDate,
    gender: normalizeOptional(input.gender, 30),
    categoryId: input.categoryId?.trim() || null,
    source: normalizeOptional(input.source, 40),
    notes: normalizeOptional(input.notes, 4000),
    tagIds: [...new Set(input.tagIds ?? [])],
  };
}

export function normalizeAddressDraft(input: AddressDraftInput): NormalizedAddressDraft {
  const address = {
    label: normalizeOptional(input.label, 80),
    governorate: normalizeOptional(input.governorate, 120),
    city: normalizeOptional(input.city, 120),
    street: normalizeOptional(input.street, 180),
    details: normalizeOptional(input.details, 600),
    landmark: normalizeOptional(input.landmark, 180),
    phone: normalizePhone(input.phone),
    isDefault: input.isDefault ?? false,
  };
  if (!address.label && !address.governorate && !address.city && !address.street && !address.details && !address.landmark) {
    throw new CustomerDomainError('INVALID_ADDRESS', 'Address must contain at least one location field');
  }
  return address;
}

const STATUS_TRANSITIONS: Record<CustomerStatus, readonly CustomerStatus[]> = {
  ACTIVE: ['SUSPENDED', 'ARCHIVED'],
  SUSPENDED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: ['ACTIVE'],
};

export function assertStatusTransition(from: CustomerStatus, to: CustomerStatus): void {
  if (!STATUS_TRANSITIONS[from].includes(to)) {
    throw new CustomerDomainError('INVALID_STATUS_TRANSITION', `Status transition ${from} -> ${to} is not allowed`);
  }
}

export function assertCustomerEditable(status: CustomerStatus): void {
  if (status === 'ARCHIVED') {
    throw new CustomerDomainError('CUSTOMER_ARCHIVED', 'Archived customers must be reactivated before modification');
  }
}
