import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
import { createTempWorkspace, type TempWorkspace } from './testUtils.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsxBinary = join(repoRoot, 'node_modules', '.bin', 'tsx');
const smokeScript = join(repoRoot, 'scripts', 'runtimeSmokeTest.mjs');

function runSmokeTest(...targets: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(tsxBinary, [smokeScript, ...targets], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

describe('scripts/runtimeSmokeTest.mjs', () => {
  // vitest's own CJS interop tolerates `require()` inside an ESM module -- this proves the
  // smoke script catches it anyway, under a real ESM loader, exactly like the `require('node:fs')`
  // regression this session that shipped past every vitest-based quality gate.
  test('fails to import a module that calls require() under real ESM, even though vitest would tolerate it', () => {
    let workspace: TempWorkspace | undefined;
    try {
      workspace = createTempWorkspace({
        files: {
          // A real ancestor package.json declaring "type": "module" is what makes Node's/tsx's
          // ESM loader apply here at all -- without one, module-type detection falls back to
          // whatever governs the temp directory's own location, which would not reproduce the
          // bug this gate exists to catch.
          'package.json': '{ "type": "module" }\n',
          'bug.ts': "const fs = require('node:fs');\nexport const x = fs.existsSync('.');\n",
        },
      });

      const result = runSmokeTest(join(workspace.root, 'bug.ts'));

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('require is not defined');
    } finally {
      workspace?.dispose();
    }
  });

  test('succeeds importing a module with no CommonJS-style require() calls', () => {
    let workspace: TempWorkspace | undefined;
    try {
      workspace = createTempWorkspace({
        files: {
          'package.json': '{ "type": "module" }\n',
          'ok.ts': "import { existsSync } from 'node:fs';\nexport const x = existsSync('.');\n",
        },
      });

      const result = runSmokeTest(join(workspace.root, 'ok.ts'));

      expect(result.status).toBe(0);
    } finally {
      workspace?.dispose();
    }
  });

  test('exits non-zero with no target modules', () => {
    const result = runSmokeTest();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('no target modules provided');
  });

  test('successfully imports this project\'s own real CLI entry point (and therefore its whole transitive module graph)', () => {
    const result = runSmokeTest(join(repoRoot, 'src', 'cli', 'main.ts'));
    expect(result.status).toBe(0);
  });
});
