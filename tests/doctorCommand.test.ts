import { describe, expect, test } from 'vitest';
import { formatDoctorReport, runDoctor } from '../src/doctor/doctorCommand.js';
import { createTempWorkspace, readFixtureConfigMarkdown } from './testUtils.js';

describe('doctor command', () => {
  test('passes on a repository that satisfies the MVP configuration contract', () => {
    const workspace = createTempWorkspace({
      directories: ['.git', 'src/contracts'],
      files: {
        'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown(),
        'docs/compassrose/PROJECT_STATE.md': '# state\n',
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
        'docs/compassrose/PROJECT_STATE.md': '# state\n',
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
});
