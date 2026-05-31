import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);

describe('package metadata', () => {
  test('keeps the CLI entrypoint coherent', () => {
    expect(packageJson.description).toContain('CLI-first TypeScript');
    expect(packageJson.main).toBe('./dist/cli/main.js');
    expect(packageJson.bin?.compassrose).toBe('./dist/cli/main.js');
  });
});
