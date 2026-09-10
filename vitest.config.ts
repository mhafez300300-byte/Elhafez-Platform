import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = __dirname;
const aliases: Record<string, string> = {
  '@elhafez/database': 'packages/database/src/index.ts',
  '@elhafez/transactions': 'packages/transactions/src/index.ts',
  '@elhafez/events': 'packages/events/src/index.ts',
  '@elhafez/validation': 'packages/validation/src/index.ts',
  '@elhafez/errors': 'packages/errors/src/index.ts',
  '@elhafez/logging': 'packages/logging/src/index.ts',
  '@elhafez/printing': 'packages/printing/src/index.ts',
  '@elhafez/testing': 'packages/testing/src/index.ts',
  '@elhafez/platform-contracts': 'packages/contracts/src/index.ts',
  '@elhafez/shared-kernel': 'packages/shared-kernel/src/index.ts',
  '@elhafez/ui': 'packages/ui/src/index.tsx',
  '@elhafez/config': 'packages/config/src/index.ts',
  '@elhafez/auth': 'modules/auth/index.ts',
  '@elhafez/auth/contracts': 'modules/auth/contracts/index.ts',
  '@elhafez/users': 'modules/users/index.ts',
  '@elhafez/users/contracts': 'modules/users/contracts/index.ts',
  '@elhafez/roles': 'modules/roles/index.ts',
  '@elhafez/roles/contracts': 'modules/roles/contracts/index.ts',
  '@elhafez/permissions': 'modules/permissions/index.ts',
  '@elhafez/permissions/contracts': 'modules/permissions/contracts/index.ts',
  '@elhafez/companies': 'modules/companies/index.ts',
  '@elhafez/companies/contracts': 'modules/companies/contracts/index.ts',
  '@elhafez/branches': 'modules/branches/index.ts',
  '@elhafez/branches/contracts': 'modules/branches/contracts/index.ts',
  '@elhafez/audit': 'modules/audit/index.ts',
  '@elhafez/audit/contracts': 'modules/audit/contracts/index.ts',
  '@elhafez/files': 'modules/files/index.ts',
  '@elhafez/files/contracts': 'modules/files/contracts/index.ts',
  '@elhafez/notifications': 'modules/notifications/index.ts',
  '@elhafez/notifications/contracts': 'modules/notifications/contracts/index.ts',
};

export default defineConfig({
  resolve: {
    alias: Object.fromEntries(Object.entries(aliases).map(([key, value]) => [key, path.resolve(root, value)])),
  },
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
