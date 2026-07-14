import { describe, expect, test, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
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

describe('main([]) — runtime preconditions', () => {
  test('returns non-zero when invoked outside a Git repository', () => {
    const root = mkdtempSync(join(tmpdir(), 'compassrose-main-test-nogit-'));
    mkdirSync(join(root, 'docs/compassrose'), { recursive: true });
    writeFileSync(join(root, 'docs/compassrose/CONFIG.md'), readFixtureConfigMarkdown(), 'utf8');

    try {
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: root,
        stdout: () => {},
        stderr: (msg) => { stderrMessages.push(msg); },
      });

      expect(exitCode).toBe(1);
      expect(stderrMessages.some((m) => m.includes('runtime preflight'))).toBe(true);
      expect(stderrMessages.some((m) => m.includes('git repository'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('returns non-zero when current platform is not in supported_platforms', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    const workspace = createTempWorkspace({
      'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown(),
    });

    try {
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: workspace.root,
        stdout: () => {},
        stderr: (msg) => { stderrMessages.push(msg); },
      });

      expect(exitCode).toBe(1);
      expect(stderrMessages.some((m) => m.includes('runtime preflight'))).toBe(true);
      expect(stderrMessages.some((m) => m.includes('supported_platforms'))).toBe(true);
    } finally {
      workspace.dispose();
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
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

  test('returns non-zero when an enabled role references a defined non-external adapter', () => {
    const config = readFixtureConfigMarkdown()
      .replace(
        /implementer:\r?\n    enabled: true\r?\n    adapter: external_cli/,
        'implementer:\r\n    enabled: true\r\n    adapter: my_provider_adapter',
      )
      .replace(
        /adapters:\r?\n  external_cli:/,
        'adapters:\n  my_provider_adapter:\n    type: my_provider\n    command: ""\n    args: []\n    stdin: false\n    input_file_argument: ""\n    output_file: ""\n\n  external_cli:',
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

  test('returns non-zero when an enabled planner role references a defined non-external adapter', () => {
    const config = readFixtureConfigMarkdown()
      .replace(
        /planner:\r?\n    enabled: true\r?\n    adapter: external_cli/,
        'planner:\r\n    enabled: true\r\n    adapter: my_provider_adapter',
      )
      .replace(
        /adapters:\r?\n  external_cli:/,
        'adapters:\n  my_provider_adapter:\n    type: my_provider\n    command: ""\n    args: []\n    stdin: false\n    input_file_argument: ""\n    output_file: ""\n\n  external_cli:',
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
      expect(stderrMessages.some((m) => m.includes('roles.planner.adapter'))).toBe(true);
      expect(stderrMessages.some((m) => m.includes('runtime preflight'))).toBe(true);
    } finally {
      workspace.dispose();
    }
  });

  test('passes with valid external_cli wiring for all enabled roles', () => {
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
      expect(stderrMessages.length).toBe(0);
    } finally {
      workspace.dispose();
    }
  });
});

function createTempGitWorkspace(
  configOverride: (original: string) => string = (o) => o,
): { root: string; dispose: () => void; dirtyConfig: string } {
  const originalConfig = readFixtureConfigMarkdown();
  const dirtyConfig = configOverride(originalConfig);
  const root = mkdtempSync(join(tmpdir(), 'compassrose-worktree-test-'));

  // Initialize a proper git repository
  mkdirSync(join(root, '.git'), { recursive: true });
  try {
    execFileSync('git', ['init'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    rmSync(root, { recursive: true, force: true });
    throw new Error(`git init failed: ${err}`);
  }

  // Create and commit a base file so git considers the repo clean initially
  mkdirSync(join(root, 'docs/compassrose'), { recursive: true });
  writeFileSync(join(root, 'docs/compassrose/CONFIG.md'), dirtyConfig, 'utf8');
  writeFileSync(join(root, 'README.md'), '# Test\n', 'utf8');

  try {
    execFileSync('git', ['add', '.'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
    execFileSync('git', ['commit', '-m', 'initial', '--allow-empty'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    rmSync(root, { recursive: true, force: true });
    throw new Error(`git commit failed: ${err}`);
  }

  return {
    root,
    dirtyConfig,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe('main([]) — dirty worktree enforcement', () => {
  test('returns exit code 1 with runtime preflight and git_policy diagnostics when worktree is dirty', () => {
    const workspace = createTempGitWorkspace();

    // Create untracked files to make the worktree dirty
    try {
      writeFileSync(join(workspace.root, 'untracked.txt'), 'dirty content\n', 'utf8');
    } catch {
      workspace.dispose();
      throw new Error('Failed to create untracked file for dirty worktree test');
    }

    try {
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: workspace.root,
        stdout: () => {},
        stderr: (msg) => { stderrMessages.push(msg); },
      });

      expect(exitCode).toBe(1);
      expect(stderrMessages.some((m) => m.includes('runtime preflight'))).toBe(true);
      expect(stderrMessages.some((m) => m.includes('git_policy'))).toBe(true);
    } finally {
      workspace.dispose();
    }
  });

  test('returns exit code 1 with runtime preflight and git_policy diagnostics when a tracked file is modified', () => {
    const workspace = createTempGitWorkspace();

    // Modify a file that was committed by the fixture (README.md)
    try {
      writeFileSync(join(workspace.root, 'README.md'), '# Modified for test\n', 'utf8');
    } catch {
      workspace.dispose();
      throw new Error('Failed to modify tracked file for dirty worktree test');
    }

    try {
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: workspace.root,
        stdout: () => {},
        stderr: (msg) => { stderrMessages.push(msg); },
      });

      expect(exitCode).toBe(1);
      expect(stderrMessages.some((m) => m.includes('runtime preflight'))).toBe(true);
      expect(stderrMessages.some((m) => m.includes('git_policy'))).toBe(true);
    } finally {
      workspace.dispose();
    }
  });

  test('allows dirty worktree when require_clean_worktree_before_task is false and allow_dirty_worktree is true', () => {
    const workspace = createTempGitWorkspace((config) =>
      config
        .replace('require_clean_worktree_before_task: true', 'require_clean_worktree_before_task: false')
        .replace('allow_dirty_worktree: false', 'allow_dirty_worktree: true'),
    );

    // Create untracked files to make the worktree dirty
    try {
      writeFileSync(join(workspace.root, 'untracked.txt'), 'dirty content\n', 'utf8');
    } catch {
      workspace.dispose();
      throw new Error('Failed to create untracked file for allow-dirty test');
    }

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
    } finally {
      workspace.dispose();
    }
  });
});

describe('main([]) — feature selection after preflight', () => {
  test('selects the first non-completed feature and reports its lifecycle state', () => {
    const completedFeatureState = `# State: Completed Feature

## Lifecycle State

completed
`;

    const formalizedFeatureState = `# State: Formalized Feature

## Lifecycle State

formalized
`;

    const workspace = createTempWorkspace({
      'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown(),
      'docs/features/001-completed/feature.md': '# Completed Feature\n',
      'docs/features/001-completed/architecture.md': '# Architecture\n',
      'docs/features/001-completed/state.md': completedFeatureState,
      'docs/features/002-formalized/feature.md': '# Formalized Feature\n',
      'docs/features/002-formalized/architecture.md': '# Architecture\n',
      'docs/features/002-formalized/state.md': formalizedFeatureState,
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
      expect(stdoutMessages.some((m) => m.includes('002-formalized'))).toBe(true);
      expect(stdoutMessages.some((m) => m.includes('formalized'))).toBe(true);
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
