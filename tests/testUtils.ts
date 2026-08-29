import { PROJECT_STATE_REQUIRED_SECTIONS } from '../src/contracts/state/projectState.js';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  return readFileSync(new URL('../compassrose/CONFIG.md', import.meta.url), 'utf8');
}

/**
 * Copies this repository's real src/contracts tree into a test workspace.
 *
 * It existed because `ContractRegistry` resolved every schema against the *target* root, so an
 * orchestrator could not be constructed over a workspace without CompassRose's contracts inside it.
 * ADR-0049 moved that resolution to the installation, so the registry no longer needs this, and
 * neither does the manifest budget check. It stays for now because about thirty tests call it and
 * unwinding them is a mechanical pass of its own -- recorded under `031-installation-boundary`'s
 * Remaining Deliverables rather than ridden along with the change that made it unnecessary.
 */
export function copyContractsIntoWorkspace(root: string): void {
  const contractsSource = fileURLToPath(new URL('../src/contracts', import.meta.url));
  cpSync(contractsSource, join(root, 'src', 'contracts'), { recursive: true });
}

/**
 * A `PROJECT_STATE.md` with every section the runtime writes into.
 *
 * Fixtures used to carry `# State: Test\n\n## Status\n\nIn progress\n`, which was everything the
 * validator asked for and not everything the runtime needs. The gap was only visible from outside
 * this repository: the document `compassrose setup` seeded had the same shape, and the first
 * feature ever completed in a bootstrapped repository died writing its own completion.
 */
export function validProjectStateMarkdown(status = 'In progress'): string {
  return [
    '# State: Test',
    '',
    ...PROJECT_STATE_REQUIRED_SECTIONS.flatMap((section) => [
      `## ${section}`,
      '',
      section === 'Status' ? status : 'None.',
      '',
    ]),
  ].join('\n');
}
