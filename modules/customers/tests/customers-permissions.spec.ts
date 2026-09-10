import { describe, expect, it } from 'vitest';
import type { PermissionDefinition, PermissionDefinitionRegistry, PermissionView } from '@elhafez/permissions/contracts';
import { CUSTOMER_PERMISSION_DEFINITIONS, CustomersPermissionRegistrar } from '../backend/application/customers-permission.registrar';

class CapturingRegistry implements PermissionDefinitionRegistry {
  definitions: readonly PermissionDefinition[] = [];

  async registerDefinitions(definitions: readonly PermissionDefinition[]): Promise<PermissionView[]> {
    this.definitions = definitions;
    return [];
  }
}

describe('customers permission registration', () => {
  it('registers exactly the approved customers.* permissions through the public contract', async () => {
    const registry = new CapturingRegistry();
    await new CustomersPermissionRegistrar(registry).onModuleInit();
    expect(registry.definitions).toEqual(CUSTOMER_PERMISSION_DEFINITIONS);
    expect(registry.definitions.map((definition) => definition.key)).toEqual([
      'customers.view',
      'customers.create',
      'customers.update',
      'customers.change-status',
      'customers.view-sensitive',
      'customers.export',
      'customers.import',
    ]);
  });
});
