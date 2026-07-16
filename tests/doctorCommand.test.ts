import { describe, expect, test } from 'vitest';
import { formatDoctorReport, runDoctor } from '../src/doctor/doctorCommand.js';
import { createTempWorkspace, readFixtureConfigMarkdown } from './testUtils.js';

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
  '  roadmap: docs/ROADMAP.md',
  '  project_state: docs/compassrose/PROJECT_STATE.md',
  '  config: docs/compassrose/CONFIG.md',
  '  contracts_root: src/contracts',
  '```',
].join('\n');

describe('doctor command', () => {
  test('passes on a repository that satisfies the MVP configuration contract', () => {
    const workspace = createTempWorkspace({
      directories: ['.git', 'src/contracts'],
      files: {
        'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown(),
        'docs/compassrose/PROJECT_STATE.md': '# State: Test\n\n## Status\n\nIn progress\n',
        'docs/ROADMAP.md': '# roadmap\n',
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
      directories: ['.git', 'src/contracts'],
      files: {
        'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown(),
        'docs/compassrose/PROJECT_STATE.md': '# State: Test\n\n## Status\n\nIn progress\n',
      },
    });

    try {
      const report = runDoctor({ cwd: workspace.root });

      expect(report.exitCode).toBe(1);
      expect(report.success).toBe(false);
      expect(report.checks.some((check) => check.status === 'fail')).toBe(true);
      expect(formatDoctorReport(report)).toContain('docs/ROADMAP.md');
    } finally {
      workspace.dispose();
    }
  });

  test('passes configuration check with minimal MVP configuration', () => {
    const workspace = createTempWorkspace({
      directories: ['.git', 'src/contracts'],
      files: {
        'docs/compassrose/CONFIG.md': minimalMvpConfig,
        'docs/compassrose/PROJECT_STATE.md': '# State: Test\n\n## Status\n\nIn progress\n',
        'docs/ROADMAP.md': '# roadmap\n',
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
      directories: ['.git', 'src/contracts'],
      files: {
        'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown(),
        'docs/compassrose/PROJECT_STATE.md':
          '# State: Test\n\n## Status\n\nIn progress\n',
        'docs/ROADMAP.md': '# roadmap\n',
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
      directories: ['.git', 'src/contracts'],
      files: {
        'docs/compassrose/CONFIG.md':
          readFixtureConfigMarkdown().replace(
            'project_state: docs/compassrose/PROJECT_STATE.md',
            'project_state: docs/compassrose/MISSING_STATE.md',
          ),
        'docs/ROADMAP.md': '# roadmap\n',
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
      directories: ['.git', 'src/contracts'],
      files: {
        'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown(),
        'docs/compassrose/PROJECT_STATE.md': 'not a real state doc\n',
        'docs/ROADMAP.md': '# roadmap\n',
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
