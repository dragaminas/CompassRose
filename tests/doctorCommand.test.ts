import { describe, expect, test } from 'vitest';
import { formatDoctorReport, runDoctor } from '../src/doctor/doctorCommand.js';
import { createTempWorkspace, readFixtureConfigMarkdown, validProjectStateMarkdown } from './testUtils.js';

const minimalMvpConfig = [
  '# CompassRose Project Configuration',
  '',
  '## Configuration',
  '',
  '```yaml',
  'project:',
  '  name: compassrose',
  '  supported_platforms:',
  '    - linux',
  '    - windows',
  '  documentation_root: docs',
  '',
  'adapters:',
  '  external_cli:',
  '    type: external_cli',
  '',
  'commands:',
  '  typecheck: "npm run typecheck"',
  '  tests: "npm test"',
  '  lint: ""',
  '  build: ""',
  '',
  'documentation:',
  '  roadmap: compassrose/ROADMAP.md',
  '  project_state: compassrose/PROJECT_STATE.md',
  '  config: compassrose/CONFIG.md',
  '  contracts_root: src/contracts',
  '```',
].join('\n');

describe('doctor command', () => {
  test('passes on a repository that satisfies the MVP configuration contract', () => {
    const workspace = createTempWorkspace({
      // 'docs' is this fixture's own (empty) documentation root -- project.documentation_root's
      // existence check needs it; it used to be created implicitly as CONFIG.md's own parent
      // directory before CompassRose's docs moved out of docs/.
      directories: ['.git', 'src/contracts', 'docs'],
      files: {
        'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
        'compassrose/PROJECT_STATE.md': validProjectStateMarkdown(),
        'compassrose/ROADMAP.md': '# roadmap\n',
      },
    });

    try {
      const report = runDoctor({ cwd: workspace.root });

      expect(report.exitCode).toBe(0);
      expect(report.success).toBe(true);
      expect(report.checks.every((check) => check.status === 'pass')).toBe(true);
      expect(formatDoctorReport(report)).toContain('PASS');
    } finally {
      workspace.dispose();
    }
  });

  test('fails when a required documentation path is missing', () => {
    const workspace = createTempWorkspace({
      // 'docs' is this fixture's own (empty) documentation root -- project.documentation_root's
      // existence check needs it; it used to be created implicitly as CONFIG.md's own parent
      // directory before CompassRose's docs moved out of docs/.
      directories: ['.git', 'src/contracts', 'docs'],
      files: {
        'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
        'compassrose/PROJECT_STATE.md': validProjectStateMarkdown(),
      },
    });

    try {
      const report = runDoctor({ cwd: workspace.root });

      expect(report.exitCode).toBe(1);
      expect(report.success).toBe(false);
      expect(report.checks.some((check) => check.status === 'fail')).toBe(true);
      expect(formatDoctorReport(report)).toContain('compassrose/ROADMAP.md');
    } finally {
      workspace.dispose();
    }
  });

  test('passes configuration check with minimal MVP configuration', () => {
    const workspace = createTempWorkspace({
      // 'docs' is this fixture's own (empty) documentation root -- project.documentation_root's
      // existence check needs it; it used to be created implicitly as CONFIG.md's own parent
      // directory before CompassRose's docs moved out of docs/.
      directories: ['.git', 'src/contracts', 'docs'],
      files: {
        'compassrose/CONFIG.md': minimalMvpConfig,
        'compassrose/PROJECT_STATE.md': validProjectStateMarkdown(),
        'compassrose/ROADMAP.md': '# roadmap\n',
      },
    });

    try {
      const report = runDoctor({ cwd: workspace.root });

      const configCheck = report.checks.find((c) => c.name === 'configuration');
      expect(configCheck).toBeDefined();
      expect(configCheck?.status).toBe('pass');
    } finally {
      workspace.dispose();
    }
  });
});

describe('doctor command — project state', () => {
  test('reports project-state as a distinct check when it is valid', () => {
    const workspace = createTempWorkspace({
      // 'docs' is this fixture's own (empty) documentation root -- project.documentation_root's
      // existence check needs it; it used to be created implicitly as CONFIG.md's own parent
      // directory before CompassRose's docs moved out of docs/.
      directories: ['.git', 'src/contracts', 'docs'],
      files: {
        'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
        'compassrose/PROJECT_STATE.md':
          validProjectStateMarkdown(),
        'compassrose/ROADMAP.md': '# roadmap\n',
      },
    });

    try {
      const report = runDoctor({ cwd: workspace.root });

      expect(report.success).toBe(true);
      const psCheck = report.checks.find((c) => c.name === 'project-state');
      expect(psCheck).toBeDefined();
      expect(psCheck?.status).toBe('pass');
    } finally {
      workspace.dispose();
    }
  });

  test('reports project-state failure when the file is missing', () => {
    // CONFIG.md does NOT list PROJECT_STATE.md, so path validation itself fails.
    // We need a valid config that points to a path that doesn't exist.
    // Read fixture and replace project_state path with a non-existent one.
    const workspace = createTempWorkspace({
      // 'docs' is this fixture's own (empty) documentation root -- project.documentation_root's
      // existence check needs it; it used to be created implicitly as CONFIG.md's own parent
      // directory before CompassRose's docs moved out of docs/.
      directories: ['.git', 'src/contracts', 'docs'],
      files: {
        'compassrose/CONFIG.md':
          readFixtureConfigMarkdown().replace(
            'project_state: compassrose/PROJECT_STATE.md',
            'project_state: compassrose/MISSING_STATE.md',
          ),
        'compassrose/ROADMAP.md': '# roadmap\n',
      },
    });

    try {
      const report = runDoctor({ cwd: workspace.root });

      // project-state check should be present and fail
      const psCheck = report.checks.find((c) => c.name === 'project-state');
      expect(psCheck).toBeDefined();
      expect(psCheck?.status).toBe('fail');
      expect(psCheck?.details.some((d) => d.includes('does not exist'))).toBe(
        true,
      );
    } finally {
      workspace.dispose();
    }
  });

  test('reports project-state failure when content is malformed', () => {
    const workspace = createTempWorkspace({
      // 'docs' is this fixture's own (empty) documentation root -- project.documentation_root's
      // existence check needs it; it used to be created implicitly as CONFIG.md's own parent
      // directory before CompassRose's docs moved out of docs/.
      directories: ['.git', 'src/contracts', 'docs'],
      files: {
        'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
        'compassrose/PROJECT_STATE.md': 'not a real state doc\n',
        'compassrose/ROADMAP.md': '# roadmap\n',
      },
    });

    try {
      const report = runDoctor({ cwd: workspace.root });

      const psCheck = report.checks.find((c) => c.name === 'project-state');
      expect(psCheck).toBeDefined();
      expect(psCheck?.status).toBe('fail');
    } finally {
      workspace.dispose();
    }
  });
});

describe('doctor command — blocked-work', () => {
  test('reports a pass with no blocked features/fixes', () => {
    const workspace = createTempWorkspace({
      directories: ['.git', 'src/contracts', 'docs'],
      files: {
        'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
        'compassrose/PROJECT_STATE.md': validProjectStateMarkdown(),
        'compassrose/ROADMAP.md': '# roadmap\n',
      },
    });

    try {
      const report = runDoctor({ cwd: workspace.root });

      const blockedCheck = report.checks.find((c) => c.name === 'blocked-work');
      expect(blockedCheck).toBeDefined();
      expect(blockedCheck?.status).toBe('pass');
      expect(report.success).toBe(true);
      expect(report.exitCode).toBe(0);
    } finally {
      workspace.dispose();
    }
  });

  test('reports an info card for a blocked feature without failing the overall report', () => {
    const stateMd = [
      '# State: 001-widgets',
      '',
      '## Lifecycle State',
      '',
      'blocked',
      '',
      '## Blocked By',
      '',
      '- kind: implementation_failure',
      '- signature: implementation-failure-F001-T01',
      '- recoverability: agent',
      '- observed_state: lifecycle=blocked',
      '- evidence: the widget renderer crashed on null input',
      '- reason: Implementation for F001-T01 failed; see the attempt artifact for detail.',
      '',
    ].join('\n');

    const workspace = createTempWorkspace({
      directories: ['.git', 'src/contracts', 'docs'],
      files: {
        'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
        'compassrose/PROJECT_STATE.md': validProjectStateMarkdown(),
        'compassrose/ROADMAP.md': '# roadmap\n',
        'compassrose/features/001-widgets/state.md': stateMd,
      },
    });

    try {
      const report = runDoctor({ cwd: workspace.root });

      const blockedCheck = report.checks.find((c) => c.name === 'blocked-work');
      expect(blockedCheck).toBeDefined();
      expect(blockedCheck?.status).toBe('info');
      expect(blockedCheck?.details.join('\n')).toContain('001-widgets');
      expect(blockedCheck?.details.join('\n')).toContain('kind: implementation_failure');
      // An 'info' check must never flip the overall report to failure.
      expect(report.success).toBe(true);
      expect(report.exitCode).toBe(0);
    } finally {
      workspace.dispose();
    }
  });
});
