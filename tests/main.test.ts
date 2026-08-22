import { afterEach, describe, expect, test, afterAll, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { main } from '../src/cli/main.js';
import { copyContractsIntoWorkspace, readFixtureConfigMarkdown } from './testUtils.js';

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

describe('main run — configuration-backed runtime preflight', () => {
  test('returns non-zero when roles.planner.enabled is false', () => {
    const config = readFixtureConfigMarkdown().replace(
      /planner:\r?\n    enabled: true/,
      'planner:\r\n    enabled: false',
    );

    const workspace = createTempWorkspace({
      'compassrose/CONFIG.md': config,
    });

    try {
      const stderrMessages: string[] = [];
      const exitCode = main(['run'], {
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
      'compassrose/CONFIG.md': config,
    });

    try {
      const stderrMessages: string[] = [];
      const exitCode = main(['run'], {
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
      'compassrose/CONFIG.md': config,
    });

    try {
      const stderrMessages: string[] = [];
      const exitCode = main(['run'], {
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
    // Needs a real, clean git repo (not the bare `.git`-marker workspace other tests in this
    // file use): findDisallowedDirtyPaths() genuinely runs `git status` once preflight passes
    // and control reaches the orchestrator.
    const workspace = createTempGitWorkspace();

    try {
      const stderrMessages: string[] = [];
      const exitCode = main(['run'], {
        cwd: workspace.root,
        stdout: () => {},
        stderr: (msg) => { stderrMessages.push(msg); },
      });

      // Preflight passed and control reached the orchestrator, which reports its own
      // decision directly via console.log rather than through the injected stdout callback.
      expect(exitCode).toBe(0);
      expect(stderrMessages.length).toBe(0);
    } finally {
      workspace.dispose();
    }
  });
});

describe('main run — missing project configuration', () => {
  test('returns non-zero and emits runtime-preflight diagnostic when CONFIG.md is absent', () => {
    const workspace = createTempWorkspace({
      '.git/dummy': '',
    });

    try {
      const stderrMessages: string[] = [];
      const exitCode = main(['run'], {
        cwd: workspace.root,
        stdout: () => {},
        stderr: (msg) => { stderrMessages.push(msg); },
      });

      expect(exitCode).toBe(1);
      const allStderr = stderrMessages.join('\n');
      expect(allStderr).toContain('runtime preflight');
      expect(allStderr).toContain('CONFIG.md');
      expect(stderrMessages.length).toBeGreaterThan(0);
    } finally {
      workspace.dispose();
    }
  });
});

describe('main run — runtime preconditions', () => {
  test('returns non-zero when invoked outside a Git repository', () => {
    const root = mkdtempSync(join(tmpdir(), 'compassrose-main-test-nogit-'));
    mkdirSync(join(root, 'compassrose'), { recursive: true });
    writeFileSync(join(root, 'compassrose/CONFIG.md'), readFixtureConfigMarkdown(), 'utf8');

    try {
      const stderrMessages: string[] = [];
      const exitCode = main(['run'], {
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
      'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
    });

    try {
      const stderrMessages: string[] = [];
      const exitCode = main(['run'], {
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

describe('main run — nested directory from repo root', () => {
  test('resolves CONFIG.md from repo root when invoked from a nested subdirectory with passing preflight', () => {
    // Needs a real, clean git repo -- see the comment on the identically-shaped test above.
    const workspace = createTempGitWorkspace();

    const nestedDir = join(workspace.root, 'src', 'deeply', 'nested');
    mkdirSync(nestedDir, { recursive: true });
    expect(existsSync(nestedDir)).toBe(true);

    try {
      const stderrMessages: string[] = [];
      const exitCode = main(['run'], {
        cwd: nestedDir,
        stdout: () => {},
        stderr: (msg) => { stderrMessages.push(msg); },
      });

      // Preflight passed and control reached the orchestrator, which reports its own
      // decision directly via console.log rather than through the injected stdout callback.
      expect(exitCode).toBe(0);
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
      'compassrose/CONFIG.md': config,
    });

    const nestedDir = join(workspace.root, 'src', 'deeply', 'nested');
    mkdirSync(nestedDir, { recursive: true });
    expect(existsSync(nestedDir)).toBe(true);

    try {
      const stderrMessages: string[] = [];
      const exitCode = main(['run'], {
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

describe('main run — role-to-adapter wiring validation', () => {
  test('returns non-zero when an enabled role references a missing adapter', () => {
    const config = readFixtureConfigMarkdown().replace(
      /implementer:\r?\n    enabled: true\r?\n    adapter: external_cli/,
      'implementer:\r\n    enabled: true\r\n    adapter: nonexistent_adapter',
    );

    const workspace = createTempWorkspace({
      'compassrose/CONFIG.md': config,
    });

    try {
      const stderrMessages: string[] = [];
      const exitCode = main(['run'], {
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
      'compassrose/CONFIG.md': config,
    });

    try {
      const stderrMessages: string[] = [];
      const exitCode = main(['run'], {
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
      'compassrose/CONFIG.md': config,
    });

    try {
      const stderrMessages: string[] = [];
      const exitCode = main(['run'], {
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
    // Needs a real, clean git repo -- see the comment on the first "preflight passes" test above.
    const workspace = createTempGitWorkspace();

    try {
      const stdoutMessages: string[] = [];
      const stderrMessages: string[] = [];
      const exitCode = main(['run'], {
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
  mkdirSync(join(root, 'compassrose'), { recursive: true });
  writeFileSync(join(root, 'compassrose/CONFIG.md'), dirtyConfig, 'utf8');
  writeFileSync(join(root, 'README.md'), '# Test\n', 'utf8');
  // Needed for ContractRegistry (via CompassRoseOrchestrator) to construct once preflight
  // passes and main() hands off to the real orchestrator.
  copyContractsIntoWorkspace(root);

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

describe('main run — dirty worktree enforcement', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('PROTO_COMPASSROSE_SKIP_CLEAN_CHECK=1 bypasses the dirty-worktree preflight check', () => {
    const workspace = createTempGitWorkspace();
    writeFileSync(join(workspace.root, 'untracked.txt'), 'dirty content\n', 'utf8');
    vi.stubEnv('PROTO_COMPASSROSE_SKIP_CLEAN_CHECK', '1');

    try {
      const stderrMessages: string[] = [];
      const exitCode = main(['run'], {
        cwd: workspace.root,
        stdout: () => {},
        stderr: (msg) => { stderrMessages.push(msg); },
      });

      expect(exitCode).toBe(0);
      expect(stderrMessages.length).toBe(0);
    } finally {
      workspace.dispose();
    }
  });

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
      const exitCode = main(['run'], {
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
      const exitCode = main(['run'], {
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
      const stderrMessages: string[] = [];
      const exitCode = main(['run'], {
        cwd: workspace.root,
        stdout: () => {},
        stderr: (msg) => { stderrMessages.push(msg); },
      });

      // The dirty worktree is explicitly allowed by policy, so preflight passes and
      // control reaches the orchestrator, which reports its own decision via console.log.
      expect(exitCode).toBe(0);
      expect(stderrMessages.length).toBe(0);
    } finally {
      workspace.dispose();
    }
  });
});

describe('main([\'doctor\']) — regression', () => {
  test('still routes to doctor command and returns doctor exit code', () => {
    const workspace = createTempWorkspace({
      'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
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
      expect(allMessages).toContain('CompassRose Doctor');
      expect(allMessages).toContain('Status: FAILED');
    } finally {
      workspace.dispose();
    }
  });
});

describe('main([]) — the interactive session is the primary entry point', () => {
  // 023-terminal-session changed what no arguments means: it opens the session instead of running
  // the orchestrator once, and the old behavior moved to `run`. Asserted from outside a git
  // repository, which is the one path through runSessionCli that returns before it touches stdin --
  // a test that reached the prompt loop would hang waiting for input that never comes.
  test('dispatches to the session, which refuses outside a git repository', async () => {
    const root = mkdtempSync(join(tmpdir(), 'compassrose-session-nogit-'));

    try {
      const stderrMessages: string[] = [];
      const exitCode = await main([], {
        cwd: root,
        stdout: () => {},
        stderr: (msg) => { stderrMessages.push(msg); },
      });

      expect(exitCode).toBe(1);
      expect(stderrMessages.some((message) => message.includes('git repository'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
