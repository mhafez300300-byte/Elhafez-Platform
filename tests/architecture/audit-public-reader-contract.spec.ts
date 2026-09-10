import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
const requiredDirs = [
  'backend/domain',
  'backend/application',
  'backend/infrastructure',
  'backend/api',
  'frontend',
  'contracts',
  'tests',
];

function fixture(): string {
  const target = mkdtempSync(path.join(tmpdir(), 'elhafez-audit-contract-'));
  roots.push(target);
  for (const entry of ['modules', 'packages', 'apps', 'prisma']) {
    cpSync(path.join(process.cwd(), entry), path.join(target, entry), { recursive: true });
  }
  cpSync(path.join(process.cwd(), 'package.json'), path.join(target, 'package.json'));
  return target;
}

function addBusinessProbe(root: string): string {
  const moduleDir = path.join(root, 'modules', 'audit-consumer-probe');
  for (const dir of requiredDirs) mkdirSync(path.join(moduleDir, dir), { recursive: true });
  writeFileSync(
    path.join(moduleDir, 'package.json'),
    `${JSON.stringify({
      name: '@elhafez/audit-consumer-probe',
      version: '0.1.0',
      private: true,
      exports: {
        '.': './index.ts',
        './contracts': './contracts/index.ts',
        './frontend': './frontend/index.ts',
      },
    }, null, 2)}\n`,
  );
  writeFileSync(path.join(moduleDir, 'index.ts'), 'export class AuditConsumerProbeModule {}\n');
  writeFileSync(path.join(moduleDir, 'contracts/index.ts'), 'export interface AuditConsumerProbeContract { id: string; }\n');
  writeFileSync(path.join(moduleDir, 'frontend/index.ts'), "export const auditConsumerProbeFrontend = 'probe';\n");
  return moduleDir;
}

function passes(root: string): boolean {
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

describe('Audit public collaboration architecture', () => {
  it('allows a Business Module to depend on AUDIT_READER through @elhafez/audit/contracts only', () => {
    const root = fixture();
    const moduleDir = addBusinessProbe(root);
    writeFileSync(
      path.join(moduleDir, 'backend/application/audit-consumer.ts'),
      "import { AUDIT_READER, type AuditReader } from '@elhafez/audit/contracts';\nexport const readerToken = AUDIT_READER;\nexport type ReaderContract = AuditReader;\n",
    );
    expect(passes(root)).toBe(true);
  });

  it('rejects direct Audit module-root and backend/service access from a Business Module', () => {
    const root = fixture();
    const moduleDir = addBusinessProbe(root);
    writeFileSync(
      path.join(moduleDir, 'backend/application/bad-audit-import.ts'),
      "import { AuditModule } from '@elhafez/audit';\nimport { AuditService } from '@elhafez/audit/backend/application/audit.service';\nexport const bad = [AuditModule, AuditService];\n",
    );
    expect(passes(root)).toBe(false);
  });
});
