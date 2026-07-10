import { describe, expect, test, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../src/cli/main.js';
import { readFixtureConfigMarkdown } from './testUtils.js';

function createTempWorkspace(files: Record<string, string> = {}): { root: string; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'compassrose-main-test-'));
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = join(root, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
  }
  return {
    root,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe('main([]) — configuration-backed runtime preflight', () => {
  test('returns non-zero when roles.planner.enabled is false', () => {
    const config = readFixtureConfigMarkdown().replace(
      'planner:\n    enabled: true',
      'planner:\n    enabled: false',
    );

    const workspace = createTempWorkspace({
      'docs/compassrose/CONFIG.md': config,
    });

    try {
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: workspace.root,
        stdout: () => {},
        stderr: (msg) => { stderrMessages.push(msg); },
      });

      expect(exitCode).toBe(1);
      expect(stderrMessages.some((m) => m.includes('roles.planner.enabled'))).toBe(true);
      expect(stderrMessages.some((m) => m.includes('runtime preflight'))).toBe(true);
    } finally {
      workspace.dispose();
    }
  });

  test('returns non-zero when execution.mode is unsupported', () => {
    const config = readFixtureConfigMarkdown().replace(
      'mode: interactive',
      'mode: invalid_mode',
    );

    const workspace = createTempWorkspace({
      'docs/compassrose/CONFIG.md': config,
    });

    try {
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: workspace.root,
        stdout: () => {},
        stderr: (msg) => { stderrMessages.push(msg); },
      });

      expect(exitCode).toBe(1);
      expect(stderrMessages.some((m) => m.includes('execution.mode'))).toBe(true);
    } finally {
      workspace.dispose();
    }
  });

  test('returns non-zero when git_policy has conflicting settings', () => {
    let config = readFixtureConfigMarkdown();
    config = config.replace(
      'require_clean_worktree_before_task: true',
      'require_clean_worktree_before_task: true',
    );
    config = config.replace(
      'allow_dirty_worktree: false',
      'allow_dirty_worktree: true',
    );

    const workspace = createTempWorkspace({
      'docs/compassrose/CONFIG.md': config,
    });

    try {
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: workspace.root,
        stdout: () => {},
        stderr: (msg) => { stderrMessages.push(msg); },
      });

      expect(exitCode).toBe(1);
      expect(stderrMessages.some((m) => m.includes('git_policy'))).toBe(true);
      expect(stderrMessages.some((m) => m.includes('Conflicting'))).toBe(true);
    } finally {
      workspace.dispose();
    }
  });

  test('returns 0 and prints preflight message when all runtime preconditions pass', () => {
    const workspace = createTempWorkspace({
      'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown(),
    });

    try {
      const stdoutMessages: string[] = [];
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: workspace.root,
        stdout: (msg) => { stdoutMessages.push(msg); },
        stderr: (msg) => { stderrMessages.push(msg); },
      });

      expect(exitCode).toBe(0);
      expect(stdoutMessages).toContain('CompassRose preflight passed. No tasks to run.');
      expect(stderrMessages.length).toBe(0);
    } finally {
      workspace.dispose();
    }
  });
});

describe('main([\'doctor\']) — regression', () => {
  test('still routes to doctor command and returns doctor exit code', () => {
    const workspace = createTempWorkspace({
      'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown(),
    });

    try {
      const stdoutMessages: string[] = [];
      const stderrMessages: string[] = [];
      const exitCode = main(['doctor'], {
        cwd: workspace.root,
        stdout: (msg) => { stdoutMessages.push(msg); },
        stderr: (msg) => { stderrMessages.push(msg); },
      });

      expect(exitCode).toBe(1);
      const allMessages = [...stdoutMessages, ...stderrMessages].join('\n');
      expect(allMessages).toContain('CompassRose doctor');
    } finally {
      workspace.dispose();
    }
  });
});
