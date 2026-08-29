import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);

const sourceRoot = fileURLToPath(new URL('../src', import.meta.url));

function nonTypeScriptFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...nonTypeScriptFiles(path));
      continue;
    }
    if (!entry.endsWith('.ts')) {
      found.push(path);
    }
  }
  return found;
}

describe('package metadata', () => {
  test('keeps the CLI entrypoint coherent', () => {
    expect(packageJson.description).toContain('CLI-first TypeScript');
    expect(packageJson.main).toBe('./dist/cli/main.js');
    expect(packageJson.bin?.compassrose).toBe('./dist/cli/main.js');
  });

  // ADR-0049. `tsc` emits `.ts` and nothing else, so every asset CompassRose ships that is not
  // TypeScript -- the contracts, and `src/agents/heartbeatRunner.mjs` -- exists only under `src/`.
  // Dropping `src` from `files` would publish a package whose every agent call fails with
  // MODULE_NOT_FOUND and whose every structured call cannot find its schema, which is exactly what
  // running from `dist/` did before the sidecar was addressed from the installation root.
  test('ships the source tree, because that is where the non-TypeScript assets live', () => {
    expect(packageJson.files).toContain('dist');
    expect(packageJson.files).toContain('src');
    expect(nonTypeScriptFiles(sourceRoot).length).toBeGreaterThan(0);
  });
});
