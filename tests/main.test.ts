import { describe, expect, test, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../src/cli/main.js';
import { readFixtureConfigMarkdown } from './testUtils.js';

function createTempWorkspace(files: Record<string, string> = {}): { root: string; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'compassrose-main-test-'));
  if (!existsSync(join(root, '.git'))) {
    mkdirSync(join(root, '.git'), { recursive: true });
  }
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
      /planner:\r?\n    enabled: true/,
      'planner:\r\n    enabled: false',
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

describe('main([]) — nested directory from repo root', () => {
  test('resolves CONFIG.md from repo root when invoked from a nested subdirectory with passing preflight', () => {
    const workspace = createTempWorkspace({
      'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown(),
    });

    const nestedDir = join(workspace.root, 'src', 'deeply', 'nested');
    mkdirSync(nestedDir, { recursive: true });
    expect(existsSync(nestedDir)).toBe(true);

    try {
      const stdoutMessages: string[] = [];
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: nestedDir,
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

  test('resolves CONFIG.md from repo root when invoked from a nested subdirectory with failing preflight', () => {
    const config = readFixtureConfigMarkdown().replace(
      /planner:\r?\n    enabled: true/,
      'planner:\r\n    enabled: false',
    );

    const workspace = createTempWorkspace({
      'docs/compassrose/CONFIG.md': config,
    });

    const nestedDir = join(workspace.root, 'src', 'deeply', 'nested');
    mkdirSync(nestedDir, { recursive: true });
    expect(existsSync(nestedDir)).toBe(true);

    try {
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: nestedDir,
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
});

describe('main([]) — role-to-adapter wiring validation', () => {
  test('returns non-zero when an enabled role references a missing adapter', () => {
    const config = readFixtureConfigMarkdown().replace(
      /implementer:\r?\n    enabled: true\r?\n    adapter: external_cli/,
      'implementer:\r\n    enabled: true\r\n    adapter: nonexistent_adapter',
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
      expect(stderrMessages.some((m) => m.includes('roles.implementer.adapter'))).toBe(true);
      expect(stderrMessages.some((m) => m.includes('runtime preflight'))).toBe(true);
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
