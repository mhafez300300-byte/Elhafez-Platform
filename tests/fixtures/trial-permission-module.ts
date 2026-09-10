import { Inject, Injectable, Module, OnModuleInit } from '@nestjs/common';
import {
  PERMISSION_CHECKER,
  PERMISSION_DEFINITION_REGISTRY,
  definePermissionDefinitions,
  type PermissionChecker,
  type PermissionDefinitionRegistry,
} from '@elhafez/permissions/contracts';

export const TRIAL_PERMISSION_DEFINITIONS = definePermissionDefinitions([
  { key: 'trial-module.records.read', description: 'Read trial module records' },
] as const);

@Injectable()
class TrialPermissionRegistration implements OnModuleInit {
  constructor(
    @Inject(PERMISSION_DEFINITION_REGISTRY)
    private readonly registry: PermissionDefinitionRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.registry.registerDefinitions(TRIAL_PERMISSION_DEFINITIONS);
  }
}

@Injectable()
export class TrialPermissionProbe {
  constructor(@Inject(PERMISSION_CHECKER) private readonly checker: PermissionChecker) {}

  canRead(userId: string, companyId: string): Promise<boolean> {
    return this.checker.hasPermission(userId, TRIAL_PERMISSION_DEFINITIONS[0].key, { companyId });
  }

  canUseUnregistered(userId: string, companyId: string): Promise<boolean> {
    return this.checker.hasPermission(userId, 'trial-module.records.unregistered', { companyId });
  }
}

@Module({
  providers: [TrialPermissionRegistration, TrialPermissionProbe],
  exports: [TrialPermissionProbe],
})
export class TrialBusinessModule {}
