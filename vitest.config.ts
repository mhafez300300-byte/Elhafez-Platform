import path from 'node:path';
import swc from 'unplugin-swc';
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
  '@elhafez/customers': 'modules/customers/index.ts',
  '@elhafez/customers/contracts': 'modules/customers/contracts/index.ts',
  '@elhafez/customers/frontend': 'modules/customers/frontend/index.ts',
};

const resolvedAliases = Object.entries(aliases)
  .sort(([left], [right]) => right.length - left.length)
  .map(([find, value]) => ({ find, replacement: path.resolve(root, value) }));

export default defineConfig({
  plugins: [
    swc.vite({
      tsconfigFile: path.resolve(root, 'tsconfig.base.json'),
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
        target: 'es2022',
      },
    }),
  ],
  resolve: {
    alias: resolvedAliases,
  },
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
