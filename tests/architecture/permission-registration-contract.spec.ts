import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('permission registration architecture contract', () => {
  it('keeps the trial business module on the public permissions contract surface only', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'tests/fixtures/trial-permission-module.ts'),
      'utf8',
    );
    const permissionImports = [
      ...source.matchAll(/from\s+['"](@elhafez\/permissions[^'"]*)['"]/g),
    ].map((match) => match[1]);

    expect(permissionImports).toEqual(['@elhafez/permissions/contracts']);
    expect(source).not.toContain('modules/permissions/');
    expect(source).not.toContain('@elhafez/database');
    expect(source).not.toContain('@prisma/client');
  });
});
