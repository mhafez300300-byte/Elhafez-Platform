import { describe, expect, it } from 'vitest';
import {
  assertCustomerEditable,
  assertStatusTransition,
  CustomerDomainError,
  normalizeAddressDraft,
  normalizeCustomerDraft,
  normalizePhone,
  normalizeStrongIdentifier,
} from '../backend/domain/customer';

describe('customers domain', () => {
  it('keeps phone optional and normalizes formatted phone numbers', () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(' +20 (100) 123-4567 ')).toBe('+201001234567');
  });

  it('requires a customer name and validates email only when present', () => {
    expect(() => normalizeCustomerDraft({ customerType: 'INDIVIDUAL', fullName: '   ' })).toThrow(CustomerDomainError);
    expect(() => normalizeCustomerDraft({ customerType: 'INDIVIDUAL', fullName: 'Ahmed', email: 'bad-email' })).toThrow(CustomerDomainError);
    expect(normalizeCustomerDraft({ customerType: 'INDIVIDUAL', fullName: ' Ahmed   Ali ' }).fullName).toBe('Ahmed Ali');
  });

  it('canonicalizes strong identifiers for reliable company-scoped uniqueness', () => {
    expect(normalizeStrongIdentifier(' ab-12 34 ')).toBe('AB1234');
  });

  it('requires meaningful address data', () => {
    expect(() => normalizeAddressDraft({ isDefault: true })).toThrow(CustomerDomainError);
    expect(normalizeAddressDraft({ city: 'Cairo', isDefault: true })).toMatchObject({ city: 'Cairo', isDefault: true });
  });

  it('enforces lifecycle transitions and archived edit protection', () => {
    expect(() => assertStatusTransition('ACTIVE', 'SUSPENDED')).not.toThrow();
    expect(() => assertStatusTransition('ARCHIVED', 'SUSPENDED')).toThrow(CustomerDomainError);
    expect(() => assertCustomerEditable('ARCHIVED')).toThrow(CustomerDomainError);
    expect(() => assertCustomerEditable('SUSPENDED')).not.toThrow();
  });
});
