import { describe, expect, it } from 'vitest';
import type { PermissionDefinition, PermissionDefinitionRegistry, PermissionView } from '@elhafez/permissions/contracts';
import { SUPPLIER_PERMISSION_DEFINITIONS, SuppliersPermissionRegistrar } from '../backend/application/suppliers-permission.registrar';

class CapturingRegistry implements PermissionDefinitionRegistry {
  definitions: readonly PermissionDefinition[] = [];
  async registerDefinitions(definitions: readonly PermissionDefinition[]): Promise<PermissionView[]> {
    this.definitions = definitions;
    return [];
  }
}

describe('suppliers permission registration', () => {
  it('registers exactly the approved suppliers.* permissions through the public contract', async () => {
    const registry = new CapturingRegistry();
    await new SuppliersPermissionRegistrar(registry).onModuleInit();
    expect(registry.definitions).toEqual(SUPPLIER_PERMISSION_DEFINITIONS);
    expect(registry.definitions.map((definition) => definition.key)).toEqual([
      'suppliers.view',
      'suppliers.create',
      'suppliers.update',
      'suppliers.change-status',
      'suppliers.view-sensitive',
      'suppliers.export',
      'suppliers.import',
    ]);
  });
});
