import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('mandatory module template', () => {
  it('generates the approved reusable module structure in a fresh root', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'elhafez-template-'));
    roots.push(root);
    const script = path.resolve(process.cwd(), 'scripts/create-module.mjs');
    execFileSync(process.execPath, [script, 'sample-core', '--root', root], { stdio: 'pipe' });
    const target = path.join(root, 'modules', 'sample-core');
    for (const segment of [
      'backend/domain',
      'backend/application',
      'backend/infrastructure',
      'backend/api',
      'frontend',
      'contracts',
      'tests',
    ]) expect(existsSync(path.join(target, segment))).toBe(true);
    expect(existsSync(path.join(target, 'package.json'))).toBe(true);
    expect(existsSync(path.join(target, 'index.ts'))).toBe(true);
  });
});
