import { describe, expect, it } from 'vitest';
import {
  normalizePermissionDefinitions,
  PermissionDefinitionConflictError,
  PermissionDefinitionValidationError,
} from '../backend/domain/permission-definition';

describe('permission definition registration rules', () => {
  it('normalizes valid generic permission definitions and collapses identical duplicates', () => {
    expect(
      normalizePermissionDefinitions([
        { key: 'trial-module.records.read', description: ' Read trial records ' },
        { key: 'trial-module.records.read', description: 'Read trial records' },
        { key: 'trial-module.records.write', description: 'Write trial records' },
      ]),
    ).toEqual([
      { key: 'trial-module.records.read', description: 'Read trial records' },
      { key: 'trial-module.records.write', description: 'Write trial records' },
    ]);
  });

  it.each([
    'Trial-module.records.read',
    'trial-module',
    '.trial-module.read',
    'trial-module..read',
    'trial-module.records.*',
    'trial-module-.records.read',
  ])('rejects invalid permission key %s', (key) => {
    expect(() => normalizePermissionDefinitions([{ key, description: 'Valid description' }])).toThrow(
      PermissionDefinitionValidationError,
    );
  });

  it('rejects invalid descriptions', () => {
    expect(() =>
      normalizePermissionDefinitions([{ key: 'trial-module.records.read', description: '   ' }]),
    ).toThrow(PermissionDefinitionValidationError);
    expect(() =>
      normalizePermissionDefinitions([
        { key: 'trial-module.records.read', description: `bad\ncontrol` },
      ]),
    ).toThrow(PermissionDefinitionValidationError);
  });

  it('rejects conflicting duplicate definitions in one registration request', () => {
    expect(() =>
      normalizePermissionDefinitions([
        { key: 'trial-module.records.read', description: 'Read trial records' },
        { key: 'trial-module.records.read', description: 'Different meaning' },
      ]),
    ).toThrow(PermissionDefinitionConflictError);
  });
});
