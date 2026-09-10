import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  PERMISSION_DEFINITION_REGISTRY,
  definePermissionDefinitions,
  type PermissionDefinitionRegistry,
} from '@elhafez/permissions/contracts';

export const SUPPLIER_PERMISSION_DEFINITIONS = definePermissionDefinitions([
  { key: 'suppliers.view', description: 'View suppliers in an authorized scope' },
  { key: 'suppliers.create', description: 'Create suppliers in an authorized scope' },
  { key: 'suppliers.update', description: 'Update supplier-owned data in an authorized scope' },
  { key: 'suppliers.change-status', description: 'Change supplier lifecycle status in an authorized scope' },
  { key: 'suppliers.view-sensitive', description: 'View sensitive supplier identification data' },
  { key: 'suppliers.export', description: 'Export supplier data from an authorized scope' },
  { key: 'suppliers.import', description: 'Import supplier data into an authorized scope' },
] as const);

@Injectable()
export class SuppliersPermissionRegistrar implements OnModuleInit {
  constructor(
    @Inject(PERMISSION_DEFINITION_REGISTRY)
    private readonly registry: PermissionDefinitionRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.registry.registerDefinitions(SUPPLIER_PERMISSION_DEFINITIONS);
  }
}
