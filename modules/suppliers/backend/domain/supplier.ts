import type { SupplierStatus, SupplierType } from '../../contracts';

export type SupplierDomainErrorCode =
  | 'INVALID_NAME'
  | 'INVALID_PHONE'
  | 'INVALID_EMAIL'
  | 'INVALID_WEBSITE'
  | 'INVALID_IDENTIFIER'
  | 'INVALID_STATUS_TRANSITION'
  | 'SUPPLIER_ARCHIVED'
  | 'INVALID_ADDRESS'
  | 'INVALID_CONTACT';

export class SupplierDomainError extends Error {
  constructor(public readonly code: SupplierDomainErrorCode, message: string) {
    super(message);
    this.name = 'SupplierDomainError';
  }
}

export interface SupplierDraftInput {
  supplierType: SupplierType;
  legalName: string;
  tradeName?: string | null;
  primaryPhone?: string | null;
  secondaryPhone?: string | null;
  whatsappPhone?: string | null;
  email?: string | null;
  website?: string | null;
  nationalId?: string | null;
  taxNumber?: string | null;
  commercialRegistration?: string | null;
  categoryId?: string | null;
  notes?: string | null;
  tagIds?: string[];
}

export interface NormalizedSupplierDraft {
  supplierType: SupplierType;
  legalName: string;
  normalizedName: string;
  tradeName: string | null;
  normalizedTradeName: string | null;
  primaryPhone: string | null;
  secondaryPhone: string | null;
  whatsappPhone: string | null;
  email: string | null;
  website: string | null;
  nationalId: string | null;
  taxNumber: string | null;
  commercialRegistration: string | null;
  categoryId: string | null;
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

export interface ContactDraftInput {
  name: string;
  jobTitle?: string | null;
  phone?: string | null;
  whatsappPhone?: string | null;
  email?: string | null;
  isPrimary?: boolean;
}

export interface NormalizedContactDraft {
  name: string;
  jobTitle: string | null;
  phone: string | null;
  whatsappPhone: string | null;
  email: string | null;
  isPrimary: boolean;
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
    throw new SupplierDomainError('INVALID_NAME', 'Text value is invalid or too long');
  }
  return cleaned;
}

export function normalizeSearchText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function normalizeName(value: string): string {
  const cleaned = cleanText(value, 180);
  if (!cleaned) throw new SupplierDomainError('INVALID_NAME', 'Supplier legal name is required');
  return cleaned;
}

export function normalizePhone(value: string | null | undefined): string | null {
  if (value == null || !value.trim()) return null;
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    throw new SupplierDomainError('INVALID_PHONE', 'Phone number must contain 7 to 15 digits');
  }
  return `${hasPlus ? '+' : ''}${digits}`;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  if (value == null || !value.trim()) return null;
  const email = value.trim().toLocaleLowerCase('en-US');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new SupplierDomainError('INVALID_EMAIL', 'Email address is invalid');
  }
  return email;
}

export function normalizeWebsite(value: string | null | undefined): string | null {
  if (value == null || !value.trim()) return null;
  const website = value.trim();
  if (website.length > 300) throw new SupplierDomainError('INVALID_WEBSITE', 'Website is too long');
  try {
    const parsed = new URL(website);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocol');
    return parsed.toString();
  } catch {
    throw new SupplierDomainError('INVALID_WEBSITE', 'Website must be a valid HTTP or HTTPS URL');
  }
}

export function normalizeStrongIdentifier(value: string | null | undefined, max = 40): string | null {
  if (value == null || !value.trim()) return null;
  const identifier = value.trim().replace(/[\s-]+/g, '').toLocaleUpperCase('en-US');
  if (identifier.length < 4 || identifier.length > max || !/^[A-Z0-9]+$/.test(identifier)) {
    throw new SupplierDomainError('INVALID_IDENTIFIER', `Identifier must contain 4 to ${max} letters or digits`);
  }
  return identifier;
}

function normalizeOptional(value: string | null | undefined, max: number): string | null {
  return cleanText(value, max);
}

export function normalizeSupplierDraft(input: SupplierDraftInput): NormalizedSupplierDraft {
  const legalName = normalizeName(input.legalName);
  const tradeName = normalizeOptional(input.tradeName, 180);
  return {
    supplierType: input.supplierType,
    legalName,
    normalizedName: normalizeSearchText(legalName),
    tradeName,
    normalizedTradeName: tradeName ? normalizeSearchText(tradeName) : null,
    primaryPhone: normalizePhone(input.primaryPhone),
    secondaryPhone: normalizePhone(input.secondaryPhone),
    whatsappPhone: normalizePhone(input.whatsappPhone),
    email: normalizeEmail(input.email),
    website: normalizeWebsite(input.website),
    nationalId: normalizeStrongIdentifier(input.nationalId),
    taxNumber: normalizeStrongIdentifier(input.taxNumber),
    commercialRegistration: normalizeStrongIdentifier(input.commercialRegistration, 80),
    categoryId: input.categoryId?.trim() || null,
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
    throw new SupplierDomainError('INVALID_ADDRESS', 'Address must contain at least one location field');
  }
  return address;
}

export function normalizeContactDraft(input: ContactDraftInput): NormalizedContactDraft {
  const name = cleanText(input.name, 180);
  if (!name) throw new SupplierDomainError('INVALID_CONTACT', 'Contact person name is required');
  return {
    name,
    jobTitle: normalizeOptional(input.jobTitle, 120),
    phone: normalizePhone(input.phone),
    whatsappPhone: normalizePhone(input.whatsappPhone),
    email: normalizeEmail(input.email),
    isPrimary: input.isPrimary ?? false,
  };
}

const STATUS_TRANSITIONS: Record<SupplierStatus, readonly SupplierStatus[]> = {
  ACTIVE: ['SUSPENDED', 'ARCHIVED'],
  SUSPENDED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: ['ACTIVE'],
};

export function assertStatusTransition(from: SupplierStatus, to: SupplierStatus): void {
  if (!STATUS_TRANSITIONS[from].includes(to)) {
    throw new SupplierDomainError('INVALID_STATUS_TRANSITION', `Status transition ${from} -> ${to} is not allowed`);
  }
}

export function assertSupplierEditable(status: SupplierStatus): void {
  if (status === 'ARCHIVED') {
    throw new SupplierDomainError('SUPPLIER_ARCHIVED', 'Archived suppliers must be reactivated before modification');
  }
}
