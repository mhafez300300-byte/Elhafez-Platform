import { describe, expect, it } from 'vitest';
import {
  assertStatusTransition,
  assertSupplierEditable,
  normalizeAddressDraft,
  normalizeContactDraft,
  normalizePhone,
  normalizeStrongIdentifier,
  normalizeSupplierDraft,
  SupplierDomainError,
} from '../backend/domain/supplier';

describe('suppliers domain', () => {
  it('keeps phone optional and normalizes formatted phone numbers', () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(' +20 (100) 123-4567 ')).toBe('+201001234567');
  });

  it('requires legal name and validates email and website only when supplied', () => {
    expect(() => normalizeSupplierDraft({ supplierType: 'COMPANY', legalName: '   ' })).toThrow(SupplierDomainError);
    expect(() => normalizeSupplierDraft({ supplierType: 'COMPANY', legalName: 'Acme', email: 'bad-email' })).toThrow(SupplierDomainError);
    expect(() => normalizeSupplierDraft({ supplierType: 'COMPANY', legalName: 'Acme', website: 'ftp://example.com' })).toThrow(SupplierDomainError);
    expect(normalizeSupplierDraft({ supplierType: 'COMPANY', legalName: ' Acme   Egypt ', website: 'https://example.com' }).legalName).toBe('Acme Egypt');
  });

  it('canonicalizes all strong identifiers including commercial registration', () => {
    expect(normalizeStrongIdentifier(' ab-12 34 ')).toBe('AB1234');
    expect(normalizeSupplierDraft({ supplierType: 'COMPANY', legalName: 'Acme', commercialRegistration: ' cr-22 99 ' }).commercialRegistration).toBe('CR2299');
  });

  it('requires meaningful address data and a contact name', () => {
    expect(() => normalizeAddressDraft({ isDefault: true })).toThrow(SupplierDomainError);
    expect(normalizeAddressDraft({ city: 'Cairo', isDefault: true })).toMatchObject({ city: 'Cairo', isDefault: true });
    expect(() => normalizeContactDraft({ name: ' ' })).toThrow(SupplierDomainError);
    expect(normalizeContactDraft({ name: ' Ahmed ', phone: '0100 123 4567', isPrimary: true })).toMatchObject({ name: 'Ahmed', phone: '01001234567', isPrimary: true });
  });

  it('enforces lifecycle transitions and archived edit protection', () => {
    expect(() => assertStatusTransition('ACTIVE', 'SUSPENDED')).not.toThrow();
    expect(() => assertStatusTransition('ARCHIVED', 'SUSPENDED')).toThrow(SupplierDomainError);
    expect(() => assertSupplierEditable('ARCHIVED')).toThrow(SupplierDomainError);
    expect(() => assertSupplierEditable('SUSPENDED')).not.toThrow();
  });
});
