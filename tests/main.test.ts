import { describe, expect, test, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
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
      expect(stdoutMessages).toContain('CompassRose: no selectable feature remaining');
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
      expect(stdoutMessages).toContain('CompassRose: no selectable feature remaining');
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
      expect(stdoutMessages).toContain('CompassRose: no selectable feature remaining');
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

describe('main([]) — formalized feature transitions to task_planning_pending', () => {
  test('formalized feature transitions to task_planning_pending', () => {
    const originalStateContent = `# State: Formalized Feature

## Lifecycle State

formalized

## Design Notes

Architecture decision: use event sourcing for audit trail.

## Tags

scope: backend, priority: high
`;

    const expectedStateContent = originalStateContent.replace(
      /(^## Lifecycle State\s*\n\s*)formalized\s*$/m,
      `$1task_planning_pending\n`,
    );

    const workspace = createTempGitWorkspace();

    mkdirSync(join(workspace.root, 'docs/features/002-formalized'), { recursive: true });
    writeFileSync(join(workspace.root, 'docs/features/002-formalized/feature.md'), '# Formalized Feature\n', 'utf8');
    writeFileSync(join(workspace.root, 'docs/features/002-formalized/architecture.md'), '# Architecture\n', 'utf8');
    writeFileSync(join(workspace.root, 'docs/features/002-formalized/state.md'), originalStateContent, 'utf8');

    try {
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: workspace.root, stdio: 'pipe' });
      execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: workspace.root, stdio: 'pipe' });
      execFileSync('git', ['add', '.'], { cwd: workspace.root, stdio: ['pipe', 'pipe', 'pipe'] });
      execFileSync('git', ['commit', '-m', 'add formalized feature'], { cwd: workspace.root, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      // ignore
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

      const stateContent = readFileSync(join(workspace.root, 'docs/features/002-formalized/state.md'), 'utf8');
      expect(stateContent).toEqual(expectedStateContent);

      expect(stdoutMessages).toContain('CompassRose: selecting feature 002-formalized (lifecycle state: task_planning_pending)');
      expect(stderrMessages.length).toBe(0);
    } finally {
      workspace.dispose();
    }
  });
});

describe('main([]) — preflight ordering and lifecycle edge cases', () => {
  test('git_policy dirty-worktree check runs before feature selection', () => {
    const featureState = `# State: Test Feature

## Lifecycle State

formalized
`;

    const workspace = createTempGitWorkspace();

    // Add feature files and commit them so feature selection can find them
    mkdirSync(join(workspace.root, 'docs/features/003-formalized'), { recursive: true });
    writeFileSync(join(workspace.root, 'docs/features/003-formalized/state.md'), featureState, 'utf8');
    writeFileSync(join(workspace.root, 'docs/features/003-formalized/feature.md'), '# Feature\n', 'utf8');
    writeFileSync(join(workspace.root, 'docs/features/003-formalized/architecture.md'), '# Arch\n', 'utf8');
    try {
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: workspace.root, stdio: 'pipe' });
      execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: workspace.root, stdio: 'pipe' });
      execFileSync('git', ['add', '.'], { cwd: workspace.root, stdio: ['pipe', 'pipe', 'pipe'] });
      execFileSync('git', ['commit', '-m', 'add feature'], { cwd: workspace.root, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      // git might fail; that's OK
    }

    // Now dirty the worktree AFTER committing the feature
    try {
      writeFileSync(join(workspace.root, 'dirty.txt'), 'dirty\n', 'utf8');
    } catch {
      workspace.dispose();
      throw new Error('Failed to create dirty file');
    }

    try {
      const stdoutMessages: string[] = [];
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: workspace.root,
        stdout: (msg) => { stdoutMessages.push(msg); },
        stderr: (msg) => { stderrMessages.push(msg); },
      });

      expect(exitCode).toBe(1);
      expect(stderrMessages.some((m) => m.includes('runtime preflight'))).toBe(true);
      expect(stderrMessages.some((m) => m.includes('git_policy'))).toBe(true);
      expect(stdoutMessages.some((m) => m.includes('003-formalized'))).toBe(false);
    } finally {
      workspace.dispose();
    }
  });

  test('exits 0 with deterministic no-selectable-feature message when all features are completed', () => {
    const completedState = `# State: Done Feature

## Lifecycle State

completed
`;

    const workspace = createTempGitWorkspace();

    mkdirSync(join(workspace.root, 'docs/features/001-done'), { recursive: true });
    writeFileSync(join(workspace.root, 'docs/features/001-done/state.md'), completedState, 'utf8');
    writeFileSync(join(workspace.root, 'docs/features/001-done/feature.md'), '# Feature\n', 'utf8');
    try {
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: workspace.root, stdio: 'pipe' });
      execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: workspace.root, stdio: 'pipe' });
      execFileSync('git', ['add', '.'], { cwd: workspace.root, stdio: ['pipe', 'pipe', 'pipe'] });
      execFileSync('git', ['commit', '-m', 'add completed feature'], { cwd: workspace.root, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      // ignore
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
      expect(stdoutMessages.some((m) => m.includes('no selectable feature'))).toBe(true);
      expect(stdoutMessages.some((m) => m.includes('No tasks to run'))).toBe(false);
      expect(stderrMessages.length).toBe(0);
    } finally {
      workspace.dispose();
    }
  });

  test('selects feature as request_pending when request.md exists but formalized files are missing', () => {
    const stateContent = `# State

## Lifecycle State

formalization_pending
`;

    const workspace = createTempGitWorkspace();

    mkdirSync(join(workspace.root, 'docs/features/004-request'), { recursive: true });
    writeFileSync(join(workspace.root, 'docs/features/004-request/request.md'), '# Request\n', 'utf8');
    writeFileSync(join(workspace.root, 'docs/features/004-request/state.md'), stateContent, 'utf8');
    // Deliberately do NOT create feature.md or architecture.md to trigger request_pending derivation

    try {
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: workspace.root, stdio: 'pipe' });
      execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: workspace.root, stdio: 'pipe' });
      execFileSync('git', ['add', '.'], { cwd: workspace.root, stdio: ['pipe', 'pipe', 'pipe'] });
      execFileSync('git', ['commit', '-m', 'add request_pending feature'], { cwd: workspace.root, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      // ignore
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
      expect(stdoutMessages.some((m) => m.includes('004-request'))).toBe(true);
      expect(stdoutMessages.some((m) => m.includes('request_pending'))).toBe(true);
      expect(stderrMessages.length).toBe(0);
    } finally {
      workspace.dispose();
    }
  });

  test('exits 1 with diagnostic when lifecycle data is entirely missing from state.md', () => {
    const workspace = createTempGitWorkspace();

    mkdirSync(join(workspace.root, 'docs/features/005-broken'), { recursive: true });
    writeFileSync(join(workspace.root, 'docs/features/005-broken/state.md'), '# State\n\nNo lifecycle header here\n');
    writeFileSync(join(workspace.root, 'docs/features/005-broken/feature.md'), '# Feature\n');

    try {
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: workspace.root, stdio: 'pipe' });
      execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: workspace.root, stdio: 'pipe' });
      execFileSync('git', ['add', '.'], { cwd: workspace.root, stdio: ['pipe', 'pipe', 'pipe'] });
      execFileSync('git', ['commit', '-m', 'add broken feature', '--allow-empty'], { cwd: workspace.root, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      // ignore
    }

    try {
      const stdoutMessages: string[] = [];
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: workspace.root,
        stdout: (msg) => { stdoutMessages.push(msg); },
        stderr: (msg) => { stderrMessages.push(msg); },
      });

      expect(exitCode).toBe(1);
      expect(stderrMessages.some((m) => m.includes('runtime feature-selection'))).toBe(true);
      expect(stderrMessages.some((m) => m.includes('malformed lifecycle data'))).toBe(true);
      expect(stdoutMessages.some((m) => m.includes('005-broken'))).toBe(false);
    } finally {
      workspace.dispose();
    }
  });

  test('exits 1 with diagnostic when lifecycle value is unknown', () => {
    const workspace = createTempGitWorkspace();

    mkdirSync(join(workspace.root, 'docs/features/006-unknown'), { recursive: true });
    writeFileSync(
      join(workspace.root, 'docs/features/006-unknown/state.md'),
      `# State

## Lifecycle State

unknown_lifecycle
`,
      'utf8',
    );
    writeFileSync(join(workspace.root, 'docs/features/006-unknown/feature.md'), '# Feature\n');

    try {
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: workspace.root, stdio: 'pipe' });
      execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: workspace.root, stdio: 'pipe' });
      execFileSync('git', ['add', '.'], { cwd: workspace.root, stdio: ['pipe', 'pipe', 'pipe'] });
      execFileSync('git', ['commit', '-m', 'add unknown lifecycle feature', '--allow-empty'], { cwd: workspace.root, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      // ignore
    }

    try {
      const stdoutMessages: string[] = [];
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: workspace.root,
        stdout: (msg) => { stdoutMessages.push(msg); },
        stderr: (msg) => { stderrMessages.push(msg); },
      });

      expect(exitCode).toBe(1);
      expect(stderrMessages.some((m) => m.includes('runtime feature-selection'))).toBe(true);
      expect(stderrMessages.some((m) => m.includes('malformed lifecycle data'))).toBe(true);
      expect(stdoutMessages.some((m) => m.includes('006-unknown'))).toBe(false);
    } finally {
      workspace.dispose();
    }
  });

  test('exits 1 when state.md is absent and request.md is also absent', () => {
    const workspace = createTempGitWorkspace();

    mkdirSync(join(workspace.root, 'docs/features/007-missing-state'), { recursive: true });
    writeFileSync(join(workspace.root, 'docs/features/007-missing-state/feature.md'), '# Feature\n');

    try {
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: workspace.root, stdio: 'pipe' });
      execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: workspace.root, stdio: 'pipe' });
      execFileSync('git', ['add', '.'], { cwd: workspace.root, stdio: ['pipe', 'pipe', 'pipe'] });
      execFileSync('git', ['commit', '-m', 'add missing-state feature', '--allow-empty'], { cwd: workspace.root, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      // ignore
    }

    try {
      const stdoutMessages: string[] = [];
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: workspace.root,
        stdout: (msg) => { stdoutMessages.push(msg); },
        stderr: (msg) => { stderrMessages.push(msg); },
      });

      expect(exitCode).toBe(1);
      expect(stderrMessages.some((m) => m.includes('runtime feature-selection'))).toBe(true);
      expect(stderrMessages.some((m) => m.includes('malformed lifecycle data'))).toBe(true);
      expect(stdoutMessages.some((m) => m.includes('007-missing-state'))).toBe(false);
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
