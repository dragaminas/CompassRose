import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

export interface TempWorkspaceOptions {
  directories?: string[];
  files?: Record<string, string>;
}

export interface TempWorkspace {
  root: string;
  dispose: () => void;
}

export function createTempWorkspace(options: TempWorkspaceOptions = {}): TempWorkspace {
  const root = mkdtempSync(join(tmpdir(), 'compassrose-test-'));

  for (const directory of options.directories ?? []) {
    mkdirSync(join(root, directory), { recursive: true });
  }

  for (const [relativePath, contents] of Object.entries(options.files ?? {})) {
    mkdirSync(join(root, dirname(relativePath)), { recursive: true });
    writeFileSync(join(root, relativePath), contents, 'utf8');
  }

  return {
    root,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function readFixtureConfigMarkdown(): string {
  return readFileSync(new URL('../docs/compassrose/CONFIG.md', import.meta.url), 'utf8');
}
