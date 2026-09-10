import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];

function fixture(): string {
  const target = mkdtempSync(path.join(tmpdir(), 'elhafez-arch-'));
  roots.push(target);
  cpSync(path.join(process.cwd(), 'modules'), path.join(target, 'modules'), { recursive: true });
  cpSync(path.join(process.cwd(), 'packages'), path.join(target, 'packages'), { recursive: true });
  cpSync(path.join(process.cwd(), 'apps'), path.join(target, 'apps'), { recursive: true });
  cpSync(path.join(process.cwd(), 'package.json'), path.join(target, 'package.json'));
  return target;
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

  it('rejects forbidden business modules', () => {
    const root = fixture();
    mkdirSync(path.join(root, 'modules/products'), { recursive: true });
    expect(check(root)).toBe(false);
  });
});
