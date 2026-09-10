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
  const target = mkdtempSync(path.join(tmpdir(), 'elhafez-files-contract-'));
  roots.push(target);
  for (const entry of ['modules', 'packages', 'apps', 'prisma']) {
    cpSync(path.join(process.cwd(), entry), path.join(target, entry), { recursive: true });
  }
  cpSync(path.join(process.cwd(), 'package.json'), path.join(target, 'package.json'));
  return target;
}

function addBusinessProbe(root: string): string {
  const moduleDir = path.join(root, 'modules', 'file-consumer-probe');
  for (const dir of requiredDirs) mkdirSync(path.join(moduleDir, dir), { recursive: true });
  writeFileSync(
    path.join(moduleDir, 'package.json'),
    `${JSON.stringify({
      name: '@elhafez/file-consumer-probe',
      version: '0.1.0',
      private: true,
      exports: {
        '.': './index.ts',
        './contracts': './contracts/index.ts',
        './frontend': './frontend/index.ts',
      },
    }, null, 2)}\n`,
  );
  writeFileSync(path.join(moduleDir, 'index.ts'), 'export class FileConsumerProbeModule {}\n');
  writeFileSync(path.join(moduleDir, 'contracts/index.ts'), 'export interface FileConsumerProbeContract { id: string; }\n');
  writeFileSync(path.join(moduleDir, 'frontend/index.ts'), "export const fileConsumerProbeFrontend = 'probe';\n");
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

describe('Files public collaboration architecture', () => {
  it('allows a Business Module to depend on FILE_READER through @elhafez/files/contracts only', () => {
    const root = fixture();
    const moduleDir = addBusinessProbe(root);
    writeFileSync(
      path.join(moduleDir, 'backend/application/files-consumer.ts'),
      "import { FILE_READER, type FileReader } from '@elhafez/files/contracts';\nexport const readerToken = FILE_READER;\nexport type ReaderContract = FileReader;\n",
    );
    expect(passes(root)).toBe(true);
  });

  it('rejects direct Files module-root and backend/service access from a Business Module', () => {
    const root = fixture();
    const moduleDir = addBusinessProbe(root);
    writeFileSync(
      path.join(moduleDir, 'backend/application/bad-files-import.ts'),
      "import { FilesModule } from '@elhafez/files';\nimport { FilesService } from '@elhafez/files/backend/application/files.service';\nexport const bad = [FilesModule, FilesService];\n",
    );
    expect(passes(root)).toBe(false);
  });
});
