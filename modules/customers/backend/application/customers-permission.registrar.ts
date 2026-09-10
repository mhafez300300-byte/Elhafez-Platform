import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  PERMISSION_DEFINITION_REGISTRY,
  definePermissionDefinitions,
  type PermissionDefinitionRegistry,
} from '@elhafez/permissions/contracts';

export const CUSTOMER_PERMISSION_DEFINITIONS = definePermissionDefinitions([
  { key: 'customers.view', description: 'View customers in an authorized scope' },
  { key: 'customers.create', description: 'Create customers in an authorized scope' },
  { key: 'customers.update', description: 'Update customer-owned data in an authorized scope' },
  { key: 'customers.change-status', description: 'Change customer lifecycle status in an authorized scope' },
  { key: 'customers.view-sensitive', description: 'View sensitive customer identification data' },
  { key: 'customers.export', description: 'Export customer data from an authorized scope' },
  { key: 'customers.import', description: 'Import customer data into an authorized scope' },
] as const);

@Injectable()
export class CustomersPermissionRegistrar implements OnModuleInit {
  constructor(
    @Inject(PERMISSION_DEFINITION_REGISTRY)
    private readonly registry: PermissionDefinitionRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.registry.registerDefinitions(CUSTOMER_PERMISSION_DEFINITIONS);
  }
}
