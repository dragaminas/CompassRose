import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  createCheckContext,
  buildDiagnosticReport,
} from '../../src/doctor/doctorDiagnostics.js';
import { runDoctor } from '../../src/doctor/doctorCommand.js';
import type { ProjectConfiguration } from '../../src/config/configTypes.js';
import type { DoctorCheck } from '../../src/contracts/doctor/doctorContracts.js';
import { createTempWorkspace, readFixtureConfigMarkdown, type TempWorkspace } from '../testUtils.js';

function makeMockConfig(overrides?: Partial<ProjectConfiguration>): ProjectConfiguration {
  return {
    project: {
      name: 'test-project',
      supported_platforms: ['linux', 'windows'],
      documentation_root: 'docs',
      ...overrides?.project,
    },
    adapters: {
      external_cli: {
        type: 'external_cli',
      },
      ...overrides?.adapters,
    },
    commands: {
      typecheck: 'npm run typecheck',
      tests: 'npm test',
      lint: 'npm run lint',
      build: 'npm run build',
      ...overrides?.commands,
    },
    documentation: {
      roadmap: 'compassrose/ROADMAP.md',
      project_state: 'compassrose/PROJECT_STATE.md',
      config: 'compassrose/CONFIG.md',
      contracts_root: 'src/contracts',
      ...overrides?.documentation,
    },
    git_policy: {
      require_clean_worktree_before_task: true,
      review_target: 'git_diff',
      allow_dirty_worktree: false,
      branch_per_task: 'disabled',
      commit_after_task: 'disabled',
    },
    ...(overrides as Partial<ProjectConfiguration>),
  } as ProjectConfiguration;
}

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
});

describe('createCheckContext', () => {
  test('constructs a context from a normalized configuration object', () => {
    const config = makeMockConfig();
    const context = createCheckContext(config);

    expect(context).toBeDefined();
    expect(context.configuration).toBe(config);
  });

  test('does not mutate the supplied configuration', () => {
    const config = makeMockConfig();
    const configSnapshot = JSON.stringify(config);
    const context = createCheckContext(config);

    expect(context).toBeDefined();
    expect(JSON.stringify(config)).toBe(configSnapshot);
  });

  test('preserves the configuration reference without deep-copying', () => {
    const config = makeMockConfig();
    const context = createCheckContext(config);

    expect(context.configuration).toBe(config);
  });

  test('context is readonly — assignment to checks does not expose mutation surface', () => {
    const config = makeMockConfig();
    const context = createCheckContext(config);

    // The context should not expose a mutable `checks` setter.
    // Verify by confirming that `context.checks` is not defined as a writable property.
    const descriptor = Object.getOwnPropertyDescriptor(context, 'checks');
    expect(descriptor?.writable).toBeFalsy();
  });
});

describe('buildDiagnosticReport', () => {
  test('returns success with exit code 0 when all checks pass', () => {
    const checks: DoctorCheck[] = [
      { name: 'repository', status: 'pass', details: ['ok'] },
      { name: 'configuration', status: 'pass', details: ['ok'] },
    ];

    const report = buildDiagnosticReport(checks);

    expect(report.success).toBe(true);
    expect(report.exitCode).toBe(0);
    expect(report.checks).toEqual(checks);
  });

  test('returns failure with exit code 1 when any check fails', () => {
    const checks: DoctorCheck[] = [
      { name: 'repository', status: 'pass', details: ['ok'] },
      { name: 'configuration', status: 'fail', details: ['missing'] },
    ];

    const report = buildDiagnosticReport(checks);

    expect(report.success).toBe(false);
    expect(report.exitCode).toBe(1);
    expect(report.checks).toEqual(checks);
  });

  test('returns failure with exit code 1 when all checks fail', () => {
    const checks: DoctorCheck[] = [
      { name: 'repository', status: 'fail', details: ['not a git repo'] },
    ];

    const report = buildDiagnosticReport(checks);

    expect(report.success).toBe(false);
    expect(report.exitCode).toBe(1);
  });

  test('preserves check ordering', () => {
    const checks: DoctorCheck[] = [
      { name: 'a', status: 'pass', details: [] },
      { name: 'b', status: 'fail', details: [] },
      { name: 'c', status: 'pass', details: [] },
    ];

    const report = buildDiagnosticReport(checks);

    const names = report.checks.map((c) => c.name);
    expect(names).toEqual(['a', 'b', 'c']);
  });

  test('returns empty success when no checks are provided', () => {
    const checks: DoctorCheck[] = [];
    const report = buildDiagnosticReport(checks);

    expect(report.success).toBe(true);
    expect(report.exitCode).toBe(0);
    expect(report.checks.length).toBe(0);
  });
});

describe('integration: context + report', () => {
  test('constructing context from config does not alter it before building a report', () => {
    const config = makeMockConfig();
    const before = JSON.stringify(config);

    const context = createCheckContext(config);
    const checks = context.checks as DoctorCheck[];

    const report = buildDiagnosticReport(checks);

    expect(JSON.stringify(config)).toBe(before);
    expect(report.success).toBe(true);
    expect(report.exitCode).toBe(0);
  });

  test('context exposes derived readiness matching the report aggregation', () => {
    const config = makeMockConfig();
    const context = createCheckContext(config);

    expect(context.readiness).toBe(true);
  });
});

describe('runDoctor integration with the diagnostic boundary (correction F003-T01-C01)', () => {
  test('passing run: preserves the real repositoryRoot/currentPlatform/configPath instead of the standalone boundary\'s null placeholders, and derives success/exitCode through it', () => {
    workspace = createTempWorkspace({
      // 'docs' is this fixture's own (empty) documentation root -- CONFIG.md's own
      // project.documentation_root check needs it to exist; it used to be created implicitly
      // as CONFIG.md's own parent directory before CompassRose's docs moved out of docs/.
      directories: ['.git', 'src/contracts', 'docs'],
      files: {
        'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
        'compassrose/PROJECT_STATE.md': '# State: Test\n\n## Status\n\nIn progress\n',
        'compassrose/ROADMAP.md': '# roadmap\n',
      },
    });

    const report = runDoctor({ cwd: workspace.root });

    expect(report.repositoryRoot).not.toBeNull();
    expect(report.currentPlatform).not.toBeNull();
    expect(report.configPath).not.toBeNull();
    expect(report.success).toBe(true);
    expect(report.exitCode).toBe(0);
    expect(report.checks.map((check) => check.name)).toEqual([
      'repository',
      'configuration',
      'platform',
      'paths',
      'project-state',
    ]);
  });

  test('failing run: aggregation still derives success=false/exitCode=1 through the feature-owned boundary', () => {
    workspace = createTempWorkspace({
      directories: ['.git', 'src/contracts'],
      files: {
        // No compassrose/ROADMAP.md -> the 'paths' check fails.
        'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
        'compassrose/PROJECT_STATE.md': '# State: Test\n\n## Status\n\nIn progress\n',
      },
    });

    const report = runDoctor({ cwd: workspace.root });

    expect(report.success).toBe(false);
    expect(report.exitCode).toBe(1);
    expect(report.checks.some((check) => check.status === 'fail')).toBe(true);
  });

  test('does not mutate CONFIG.md on disk', () => {
    const configText = readFixtureConfigMarkdown();
    workspace = createTempWorkspace({
      directories: ['.git', 'src/contracts'],
      files: {
        'compassrose/CONFIG.md': configText,
        'compassrose/PROJECT_STATE.md': '# State: Test\n\n## Status\n\nIn progress\n',
        'compassrose/ROADMAP.md': '# roadmap\n',
      },
    });

    runDoctor({ cwd: workspace.root });

    const after = readFileSync(join(workspace.root, 'compassrose/CONFIG.md'), 'utf8');
    expect(after).toBe(configText);
  });
});
