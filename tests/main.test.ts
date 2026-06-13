import { describe, expect, test } from 'vitest';
import { main } from '../src/cli/main.js';
import { createTempWorkspace, readFixtureConfigMarkdown } from './testUtils.js';

describe('main — runtime preflight', () => {
  test('returns non-zero exit code when roles.planner.enabled is false', () => {
    const workspace = createTempWorkspace({
      directories: ['.git', 'src/contracts'],
      files: {
        'docs/compassrose/CONFIG.md':
          readFixtureConfigMarkdown().replace(
            '    enabled: true\n    adapter: external_cli\n\n  implementer:',
            '    enabled: false\n    adapter: external_cli\n\n  implementer:',
          ),
        'docs/compassrose/PROJECT_STATE.md': '# State: Test\n\n## Status\n\nIn progress\n',
        'docs/ROADMAP.md': '# roadmap\n',
      },
    });

    try {
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: workspace.root,
        stderr: (msg: string) => stderrMessages.push(msg),
      });

      expect(exitCode).toBe(1);
      expect(stderrMessages.join('\n')).toContain('planner');
    } finally {
      workspace.dispose();
    }
  });

  test('returns non-zero exit code when execution.mode is unsupported', () => {
    const workspace = createTempWorkspace({
      directories: ['.git', 'src/contracts'],
      files: {
        'docs/compassrose/CONFIG.md':
          readFixtureConfigMarkdown().replace(
            'mode: interactive',
            'mode: unknown_mode',
          ),
        'docs/compassrose/PROJECT_STATE.md': '# State: Test\n\n## Status\n\nIn progress\n',
        'docs/ROADMAP.md': '# roadmap\n',
      },
    });

    try {
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: workspace.root,
        stderr: (msg: string) => stderrMessages.push(msg),
      });

      expect(exitCode).toBe(1);
      expect(stderrMessages.join('\n')).toContain('execution.mode');
    } finally {
      workspace.dispose();
    }
  });

  test('returns non-zero exit code when roles.implementer.enabled is false', () => {
    const workspace = createTempWorkspace({
      directories: ['.git', 'src/contracts'],
      files: {
        'docs/compassrose/CONFIG.md':
          readFixtureConfigMarkdown().replace(
            '  implementer:\n    enabled: true',
            '  implementer:\n    enabled: false',
          ),
        'docs/compassrose/PROJECT_STATE.md': '# State: Test\n\n## Status\n\nIn progress\n',
        'docs/ROADMAP.md': '# roadmap\n',
      },
    });

    try {
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: workspace.root,
        stderr: (msg: string) => stderrMessages.push(msg),
      });

      expect(exitCode).toBe(1);
      expect(stderrMessages.join('\n')).toContain('implementer');
    } finally {
      workspace.dispose();
    }
  });

  test('returns non-zero exit code when git_policy has conflicting settings', () => {
    const workspace = createTempWorkspace({
      directories: ['.git', 'src/contracts'],
      files: {
        'docs/compassrose/CONFIG.md':
          readFixtureConfigMarkdown()
            .replace('require_clean_worktree_before_task: true', 'require_clean_worktree_before_task: true')
            .replace('allow_dirty_worktree: false', 'allow_dirty_worktree: true'),
        'docs/compassrose/PROJECT_STATE.md': '# State: Test\n\n## Status\n\nIn progress\n',
        'docs/ROADMAP.md': '# roadmap\n',
      },
    });

    try {
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: workspace.root,
        stderr: (msg: string) => stderrMessages.push(msg),
      });

      expect(exitCode).toBe(1);
      expect(stderrMessages.join('\n')).toContain('git_policy');
    } finally {
      workspace.dispose();
    }
  });

  test('returns zero exit code and prints preflight message when config is compatible', () => {
    const workspace = createTempWorkspace({
      directories: ['.git', 'src/contracts'],
      files: {
        'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown(),
        'docs/compassrose/PROJECT_STATE.md': '# State: Test\n\n## Status\n\nIn progress\n',
        'docs/ROADMAP.md': '# roadmap\n',
      },
    });

    try {
      const stdoutMessages: string[] = [];
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: workspace.root,
        stdout: (msg: string) => stdoutMessages.push(msg),
        stderr: (msg: string) => stderrMessages.push(msg),
      });

      expect(exitCode).toBe(0);
      expect(stdoutMessages.join('\n')).toContain('preflight passed');
      expect(stderrMessages.length).toBe(0);
    } finally {
      workspace.dispose();
    }
  });

  test('returns non-zero exit code with config load errors when CONFIG.md is missing required sections', () => {
    const workspace = createTempWorkspace({
      directories: ['.git', 'src/contracts'],
      files: {
        'docs/compassrose/CONFIG.md': '---\nproject:\n  name: test\n---\n',
        'docs/compassrose/PROJECT_STATE.md': '# State: Test\n\n## Status\n\nIn progress\n',
        'docs/ROADMAP.md': '# roadmap\n',
      },
    });

    try {
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: workspace.root,
        stderr: (msg: string) => stderrMessages.push(msg),
      });

      expect(exitCode).toBe(1);
      expect(stderrMessages.length).toBeGreaterThan(0);
    } finally {
      workspace.dispose();
    }
  });

  test('returns 1 and prints usage for unknown commands', () => {
    const stderrMessages: string[] = [];
    const exitCode = main(['unknown'], {
      stderr: (msg: string) => stderrMessages.push(msg),
    });

    expect(exitCode).toBe(1);
    expect(stderrMessages.join('\n')).toContain('Usage');
  });

  test('doctor path returns exit code 0 when environment is valid', () => {
    const workspace = createTempWorkspace({
      directories: ['.git', 'src/contracts'],
      files: {
        'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown(),
        'docs/compassrose/PROJECT_STATE.md': '# State: Test\n\n## Status\n\nIn progress\n',
        'docs/ROADMAP.md': '# roadmap\n',
      },
    });

    try {
      const stdoutMessages: string[] = [];
      const stderrMessages: string[] = [];
      const exitCode = main(['doctor'], {
        cwd: workspace.root,
        stdout: (msg: string) => stdoutMessages.push(msg),
        stderr: (msg: string) => stderrMessages.push(msg),
      });

      expect(exitCode).toBe(0);
      expect(stdoutMessages.join('\n')).toContain('PASS');
    } finally {
      workspace.dispose();
    }
  });
});
