import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
const requiredModuleDirs = [
  'backend/domain',
  'backend/application',
  'backend/infrastructure',
  'backend/api',
  'frontend',
  'contracts',
  'tests',
];

function fixture(): string {
  const target = mkdtempSync(path.join(tmpdir(), 'elhafez-arch-'));
  roots.push(target);
  cpSync(path.join(process.cwd(), 'modules'), path.join(target, 'modules'), { recursive: true });
  cpSync(path.join(process.cwd(), 'packages'), path.join(target, 'packages'), { recursive: true });
  cpSync(path.join(process.cwd(), 'apps'), path.join(target, 'apps'), { recursive: true });
  cpSync(path.join(process.cwd(), 'prisma'), path.join(target, 'prisma'), { recursive: true });
  cpSync(path.join(process.cwd(), 'package.json'), path.join(target, 'package.json'));
  return target;
}

function pascal(name: string): string {
  return name.split('-').map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join('');
}

function addBusinessModule(root: string, name: string, models: string[] = []): void {
  const moduleDir = path.join(root, 'modules', name);
  for (const dir of requiredModuleDirs) mkdirSync(path.join(moduleDir, dir), { recursive: true });
  writeFileSync(
    path.join(moduleDir, 'package.json'),
    `${JSON.stringify({
      name: `@elhafez/${name}`,
      version: '0.1.0',
      private: true,
      exports: {
        '.': './index.ts',
        './contracts': './contracts/index.ts',
        './frontend': './frontend/index.ts',
      },
    }, null, 2)}\n`,
  );
  writeFileSync(path.join(moduleDir, 'index.ts'), `export class ${pascal(name)}Module {}\n`);
  writeFileSync(path.join(moduleDir, 'contracts/index.ts'), `export interface ${pascal(name)}Contract { readonly id: string; }\n`);
  writeFileSync(path.join(moduleDir, 'frontend/index.ts'), `export const ${pascal(name)}Frontend = '${name}';\n`);

  if (models.length > 0) {
    const schemaDir = path.join(root, 'prisma/schema/modules');
    mkdirSync(schemaDir, { recursive: true });
    const schema = models.map((model) => `model ${model} {\n  id String @id @default(uuid()) @db.Uuid\n}\n`).join('\n');
    writeFileSync(path.join(schemaDir, `${name}.prisma`), schema);
  }
}

function check(root: string): boolean {
  try {
    execFileSync(process.execPath, [path.join(process.cwd(), 'scripts/check-architecture.mjs'), root], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('architecture boundaries', () => {
  it('accepts the real approved tree', () => expect(check(process.cwd())).toBe(true));

  it('rejects cross-module internals', () => {
    const root = fixture();
    writeFileSync(path.join(root, 'modules/users/backend/application/bad.ts'), "import '@elhafez/roles';\n");
    expect(check(root)).toBe(false);
  });

  it('rejects frontend to backend', () => {
    const root = fixture();
    writeFileSync(path.join(root, 'modules/users/frontend/bad.ts'), "import '../backend/application/users.service';\n");
    expect(check(root)).toBe(false);
  });

  it('rejects application database access', () => {
    const root = fixture();
    writeFileSync(path.join(root, 'modules/users/backend/application/bad.ts'), "import '@elhafez/database';\n");
    expect(check(root)).toBe(false);
  });

  it('rejects domain to infrastructure', () => {
    const root = fixture();
    writeFileSync(path.join(root, 'modules/users/backend/domain/bad.ts'), "import '../infrastructure/prisma-user.repository';\n");
    expect(check(root)).toBe(false);
  });

  it('rejects cross-module table ownership', () => {
    const root = fixture();
    writeFileSync(path.join(root, 'modules/users/backend/infrastructure/bad.ts'), 'const x = prisma.coreCompany;\n');
    expect(check(root)).toBe(false);
  });

  it('rejects circular module contracts dependencies', () => {
    const root = fixture();
    writeFileSync(path.join(root, 'modules/users/backend/application/cycle.ts'), "import '@elhafez/roles/contracts';\n");
    writeFileSync(path.join(root, 'modules/roles/backend/application/cycle.ts'), "import '@elhafez/users/contracts';\n");
    expect(check(root)).toBe(false);
  });

  it('accepts a valid business module without a Core allowlist entry', () => {
    const root = fixture();
    addBusinessModule(root, 'test-business-module', ['TestBusinessRecord']);
    expect(check(root)).toBe(true);
  });

  it('rejects a business module with incomplete required structure', () => {
    const root = fixture();
    mkdirSync(path.join(root, 'modules/incomplete-business'), { recursive: true });
    expect(check(root)).toBe(false);
  });

  it('rejects a business module importing another module internal surface', () => {
    const root = fixture();
    addBusinessModule(root, 'business-alpha');
    addBusinessModule(root, 'business-beta');
    writeFileSync(
      path.join(root, 'modules/business-alpha/backend/application/bad.ts'),
      "import '@elhafez/business-beta';\n",
    );
    expect(check(root)).toBe(false);
  });

  it('accepts an acyclic business-to-business contracts dependency', () => {
    const root = fixture();
    addBusinessModule(root, 'business-alpha');
    addBusinessModule(root, 'business-beta');
    writeFileSync(
      path.join(root, 'modules/business-alpha/backend/application/ok.ts'),
      "import type { BusinessBetaContract } from '@elhafez/business-beta/contracts';\nexport type UsesBeta = BusinessBetaContract;\n",
    );
    expect(check(root)).toBe(true);
  });

  it('rejects a business module accessing a Core-owned Prisma model', () => {
    const root = fixture();
    addBusinessModule(root, 'business-alpha', ['BusinessAlphaRecord']);
    writeFileSync(
      path.join(root, 'modules/business-alpha/backend/infrastructure/bad.ts'),
      'const x = prisma.coreCompany;\n',
    );
    expect(check(root)).toBe(false);
  });

  it('rejects cross-business Prisma model ownership violations', () => {
    const root = fixture();
    addBusinessModule(root, 'business-alpha', ['BusinessAlphaRecord']);
    addBusinessModule(root, 'business-beta', ['BusinessBetaRecord']);
    writeFileSync(
      path.join(root, 'modules/business-beta/backend/infrastructure/bad.ts'),
      'const x = prisma.businessAlphaRecord;\n',
    );
    expect(check(root)).toBe(false);
  });

  it('rejects circular dependencies between business modules', () => {
    const root = fixture();
    addBusinessModule(root, 'business-alpha');
    addBusinessModule(root, 'business-beta');
    writeFileSync(
      path.join(root, 'modules/business-alpha/backend/application/cycle.ts'),
      "import '@elhafez/business-beta/contracts';\n",
    );
    writeFileSync(
      path.join(root, 'modules/business-beta/backend/application/cycle.ts'),
      "import '@elhafez/business-alpha/contracts';\n",
    );
    expect(check(root)).toBe(false);
  });

  it('rejects business application database access outside infrastructure', () => {
    const root = fixture();
    addBusinessModule(root, 'business-alpha');
    writeFileSync(
      path.join(root, 'modules/business-alpha/backend/application/bad.ts'),
      "import '@elhafez/database';\n",
    );
    expect(check(root)).toBe(false);
  });

  it('rejects platform packages importing a business module', () => {
    const root = fixture();
    addBusinessModule(root, 'business-alpha');
    writeFileSync(path.join(root, 'packages/testing/src/bad-business-import.ts'), "import '@elhafez/business-alpha/contracts';\n");
    expect(check(root)).toBe(false);
  });

  it('accepts a newly named future module without changing a Core module list', () => {
    const root = fixture();
    addBusinessModule(root, 'future-operations-hub', ['FutureOperationsRecord']);
    expect(check(root)).toBe(true);
  });
});
