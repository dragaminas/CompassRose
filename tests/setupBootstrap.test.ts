import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createTempWorkspace, type TempWorkspace } from './testUtils.js';
import { runSetupCli } from '../src/cli/setup.js';
import { runDoctor } from '../src/doctor/doctorCommand.js';

/**
 * First contact with a repository that is not this one (ADR-0049).
 *
 * Every workspace here is a real git repository with a real manifest, because the three defects
 * this covers are only observable from outside: `setup` ignoring facts it had already read,
 * `setup` leaving a worktree the next command refuses, and `doctor` demanding CompassRose's own
 * contracts inside the target.
 */
let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
});

function initGitRepo(root: string): void {
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '--quiet', '-m', 'initial'], { cwd: root });
}

function foreignRepository(packageJson: Record<string, unknown>): TempWorkspace {
  const created = createTempWorkspace({
    files: {
      'package.json': `${JSON.stringify(packageJson, null, 2)}\n`,
      'src/widget.ts': 'export const widget = 1;\n',
    },
  });
  initGitRepo(created.root);
  return created;
}

function readConfig(root: string): string {
  return readFileSync(join(root, 'compassrose', 'CONFIG.md'), 'utf8');
}

function silently(): { readonly stdout: (message: string) => void; readonly stderr: (message: string) => void } {
  return { stdout: () => {}, stderr: () => {} };
}

describe('setup against a repository that is not this one', () => {
  test('names the project what the project names itself', () => {
    workspace = foreignRepository({ name: 'widget', scripts: { build: 'tsc' } });

    expect(runSetupCli([], { cwd: workspace.root, ...silently() })).toBe(0);
    expect(readConfig(workspace.root)).toContain('name: widget');
    expect(readConfig(workspace.root)).not.toContain('name: my-project');
  });

  test('fills a gate whose script is unambiguous', () => {
    workspace = foreignRepository({ name: 'widget', scripts: { test: 'vitest run', build: 'tsc' } });

    expect(runSetupCli([], { cwd: workspace.root, ...silently() })).toBe(0);
    const config = readConfig(workspace.root);
    expect(config).toContain('tests: "npm run test"');
    expect(config).toContain('build: "npm run build"');
  });

  test('refuses to choose between gates and says which ones it saw', () => {
    // The asymmetry the whole codebase is arranged around: detection proposes, a human decides.
    workspace = foreignRepository({
      name: 'widget',
      scripts: { test: 'vitest run', 'test:unit': 'vitest run unit', 'test:ci': 'vitest run --ci' },
    });

    expect(runSetupCli([], { cwd: workspace.root, ...silently() })).toBe(0);
    const config = readConfig(workspace.root);
    expect(config).toContain('# Several scripts could be this gate: test, test:unit, test:ci. Pick one.');
    expect(config).toContain('tests: ""');
  });

  test('leaves nothing for git to complain about', () => {
    workspace = foreignRepository({ name: 'widget', scripts: { test: 'vitest run' } });

    expect(runSetupCli([], { cwd: workspace.root, ...silently() })).toBe(0);

    const status = execFileSync('git', ['status', '--porcelain'], { cwd: workspace.root, encoding: 'utf8' });
    expect(status.trim()).toBe('');
  });

  test('--no-commit leaves the files uncommitted and says so', () => {
    workspace = foreignRepository({ name: 'widget' });
    const lines: string[] = [];

    expect(runSetupCli(['--no-commit'], { cwd: workspace.root, stdout: (m) => lines.push(m), stderr: () => {} })).toBe(0);

    const status = execFileSync('git', ['status', '--porcelain'], { cwd: workspace.root, encoding: 'utf8' });
    expect(status.trim().length).toBeGreaterThan(0);
    expect(lines.join('\n')).toContain('Not committed');
  });

  test('does not sweep the user\'s own uncommitted work into its commit', () => {
    workspace = foreignRepository({ name: 'widget' });
    writeFileSync(join(workspace.root, 'src', 'half-finished.ts'), 'export const wip = 1;\n', 'utf8');

    expect(runSetupCli([], { cwd: workspace.root, ...silently() })).toBe(0);

    const status = execFileSync('git', ['status', '--porcelain'], { cwd: workspace.root, encoding: 'utf8' });
    expect(status).toContain('half-finished.ts');
  });

  test('--cwd points setup at a repository the process is not standing in', () => {
    workspace = foreignRepository({ name: 'widget' });

    expect(runSetupCli(['--cwd', workspace.root], { cwd: process.cwd(), ...silently() })).toBe(0);
    expect(existsSync(join(workspace.root, 'compassrose', 'CONFIG.md'))).toBe(true);
  });

  test('doctor passes on what setup just produced, with no contracts copied in', () => {
    workspace = foreignRepository({ name: 'widget', scripts: { test: 'vitest run' } });
    expect(runSetupCli([], { cwd: workspace.root, ...silently() })).toBe(0);

    const report = runDoctor({ cwd: workspace.root });

    expect(report.success).toBe(true);
    expect(report.exitCode).toBe(0);
    // The whole point: CompassRose reads its contracts from its own installation, so the target
    // repository has none -- and is ready anyway.
    expect(existsSync(join(workspace.root, 'src', 'contracts'))).toBe(false);
    expect(report.checks.find((check) => check.name === 'contracts')?.status).toBe('pass');
  });
});
