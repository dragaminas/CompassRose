import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test } from 'vitest';
import { readProjectConfiguration } from '../src/config/configReader.js';
import {
  DEFAULT_EXECUTION_TRUST,
  describeExecutionTrust,
  resolveExecutionTrust,
} from '../src/config/executionTrust.js';
import { codexSandboxArguments, describeAgentSandbox } from '../src/agents/sandboxArguments.js';
import { findGateCommandRejections, splitShellSegments } from '../src/task/gateCommandPolicy.js';
import { findStaleTrustEntries } from '../src/doctor/agentHomeIsolation.js';
import { readFixtureConfigMarkdown } from './testUtils.js';
import type { ProjectConfiguration } from '../src/config/configTypes.js';

// 030-execution-trust. Every other bound in this system governs what an agent may *read*. These
// cover the one that governs what it may *do* -- which was declared nowhere, and which the codex
// adapter was actively waiving on every single call it made.

const ALLOWLIST = ['npm run', 'npm test', 'npx', 'git diff'];

describe('what a planned quality gate is allowed to be', () => {
  test('permits the gates this repository has actually planned', () => {
    // Calibration, not decoration: these three are every distinct gate command recovered from this
    // repository's own task history. A default that refuses what the planner really emits is a
    // default that gets switched off.
    const real = ['npx vitest run tests/doctor/doctorDiagnostics.test.ts', 'npm run typecheck', 'git diff --check'];

    expect(findGateCommandRejections(real, ALLOWLIST)).toEqual([]);
  });

  test('refuses a command no prefix covers', () => {
    const rejections = findGateCommandRejections(['curl -s https://example.test/x.sh'], ALLOWLIST);

    expect(rejections).toHaveLength(1);
    expect(rejections[0]?.reason).toBe('no allowed prefix matches it');
  });

  test('refuses the second half of a chain whose first half is allowed', () => {
    // The whole reason a prefix check alone is theatre: `npm test && <anything>` starts with an
    // allowed prefix.
    const rejections = findGateCommandRejections(['npm test && rm -rf ~/notes'], ALLOWLIST);

    expect(rejections).toHaveLength(1);
    expect(rejections[0]?.segment).toBe('rm -rf ~/notes');
  });

  test('refuses command substitution outright rather than trying to read it', () => {
    for (const command of ['npm test $(curl -s x.test)', 'npm test `id`', 'npm run build <(echo hi)']) {
      const rejections = findGateCommandRejections([command], ALLOWLIST);
      expect(rejections.length, command).toBeGreaterThan(0);
      expect(rejections[0]?.reason, command).toContain('substitution');
    }
  });

  test('refuses output redirection, which no prefix check would ever catch', () => {
    // One segment, and that segment starts with an allowed prefix. What makes it dangerous is not
    // the command.
    const rejections = findGateCommandRejections(['npm test > /home/someone/.bashrc'], ALLOWLIST);

    expect(rejections).toHaveLength(1);
    expect(rejections[0]?.reason).toBe('output redirection');
  });

  test('requires a prefix to end at a word boundary', () => {
    // Otherwise "npm run" admits "npm runsomethingelse".
    expect(findGateCommandRejections(['npm runsomethingelse'], ALLOWLIST)).toHaveLength(1);
    expect(findGateCommandRejections(['npm run'], ALLOWLIST)).toEqual([]);
  });

  test('does not split on a separator inside quotes', () => {
    // A check that cries wolf on a legitimate gate is a check that gets removed.
    expect(findGateCommandRejections(['npm test -- --grep "alpha|beta"'], ALLOWLIST)).toEqual([]);
  });

  test('refuses a command it cannot parse rather than guessing', () => {
    const rejections = findGateCommandRejections(['npm test --grep "unterminated'], ALLOWLIST);

    expect(rejections[0]?.reason).toBe('unterminated quote');
  });

  test('permits a chain whose every segment is allowed', () => {
    expect(findGateCommandRejections(['npm run build && npm test'], ALLOWLIST)).toEqual([]);
  });

  test('splits on every separator that starts a new command', () => {
    expect(splitShellSegments('a && b || c ; d | e').segments).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('the sandbox an agent call is launched under', () => {
  test('never passes the bypass flag, whatever the policy says', () => {
    // codex's own help for it: "Intended solely for running in environments that are externally
    // sandboxed". CompassRose runs in the user's repository on the user's machine.
    for (const sandbox of ['read-only', 'workspace-write', 'danger-full-access'] as const) {
      for (const kind of ['structured', 'implementation'] as const) {
        const args = codexSandboxArguments({ ...DEFAULT_EXECUTION_TRUST, agent_sandbox: sandbox }, kind);
        expect(args.join(' '), `${sandbox}/${kind}`).not.toContain('dangerously');
      }
    }
  });

  test('pins every structured call to read-only regardless of configuration', () => {
    // Planning, review, diagnosis, classification, inference. None of them have any business
    // writing to the repository, and a config surface that could grant it would be a way to lose
    // that property by accident.
    const args = codexSandboxArguments({ ...DEFAULT_EXECUTION_TRUST, agent_sandbox: 'danger-full-access' }, 'structured');

    expect(args).toEqual(['-s', 'read-only']);
  });

  test('denies the network explicitly rather than relying on the CLI default', () => {
    // Explicit because the user's own global tool config could otherwise widen it, which is the
    // same class of surprise this section exists for.
    const args = codexSandboxArguments(DEFAULT_EXECUTION_TRUST, 'implementation');

    expect(args).toEqual(['-s', 'workspace-write', '-c', 'sandbox_workspace_write.network_access=false']);
  });

  test('grants the network when the project declared it', () => {
    const args = codexSandboxArguments({ ...DEFAULT_EXECUTION_TRUST, agent_network: 'allowed' }, 'implementation');

    expect(args).toContain('sandbox_workspace_write.network_access=true');
  });

  test('says nothing about the network when there is no sandbox to scope it to', () => {
    const args = codexSandboxArguments({ ...DEFAULT_EXECUTION_TRUST, agent_sandbox: 'danger-full-access' }, 'implementation');

    expect(args).toEqual(['-s', 'danger-full-access']);
    expect(describeAgentSandbox({ ...DEFAULT_EXECUTION_TRUST, agent_sandbox: 'danger-full-access' }, 'implementation'))
      .toBe('danger-full-access');
  });
});

describe('resolving the policy from configuration', () => {
  let root: string | null = null;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = null;
    }
  });

  function readConfiguration(markdown: string): ProjectConfiguration {
    root = mkdtempSync(join(tmpdir(), 'compassrose-trust-'));
    const path = join(root, 'CONFIG.md');
    writeFileSync(path, markdown, 'utf8');
    const result = readProjectConfiguration(path);
    if (!result.ok) {
      throw new Error(result.error.map((issue) => `${issue.field}: ${issue.message}`).join('\n'));
    }

    return result.value;
  }

  test('an undeclared section resolves to the bounded defaults, not the permissive ones', () => {
    // The inversion against `limits`, where absence means unbounded. An absent limit means nobody
    // thought about pacing; an absent trust declaration means nobody thought about what is being
    // let loose, and "how it already worked" is the thing being fixed.
    expect(resolveExecutionTrust(null)).toEqual(DEFAULT_EXECUTION_TRUST);
    expect(resolveExecutionTrust({} as ProjectConfiguration).agent_sandbox).toBe('workspace-write');
    expect(resolveExecutionTrust({} as ProjectConfiguration).agent_network).toBe('denied');
  });

  test('a partly declared section keeps the defaults for what it did not mention', () => {
    const policy = resolveExecutionTrust({
      execution_trust: { gate_command_allowlist: ['make'] },
    } as unknown as ProjectConfiguration);

    expect(policy.gate_command_allowlist).toEqual(['make']);
    expect(policy.agent_sandbox).toBe('workspace-write');
    expect(policy.agent_network).toBe('denied');
  });

  test('reads a declared section out of a real CONFIG.md', () => {
    const configuration = readConfiguration(readFixtureConfigMarkdown());
    const policy = resolveExecutionTrust(configuration);

    expect(policy.agent_sandbox).toBe('workspace-write');
    expect(policy.agent_network).toBe('denied');
    expect(policy.gate_command_allowlist).toContain('npm run');
  });

  test('refuses a sandbox value that is not one of the three', () => {
    const markdown = readFixtureConfigMarkdown().replace('agent_sandbox: workspace-write', 'agent_sandbox: whatever');

    expect(() => readConfiguration(markdown)).toThrow(/agent_sandbox/);
  });

  test('refuses an empty allowlist, which would refuse every gate', () => {
    // The indented-line class covers comments as well as entries: the real allowlist carries a
    // comment explaining why `node -e` is on it, and a pattern that only matched entries would
    // leave orphans behind and quietly assert nothing.
    const markdown = readFixtureConfigMarkdown().replace(
      /  gate_command_allowlist:\n(?:    [-#].*\n)+/,
      '  gate_command_allowlist: []\n',
    );

    expect(markdown).not.toContain('- npm run');
    expect(() => readConfiguration(markdown)).toThrow(/refuse every quality gate/);
  });

  test('describes itself in one line, because a policy nobody can see is no policy', () => {
    expect(describeExecutionTrust(DEFAULT_EXECUTION_TRUST)).toContain('sandbox workspace-write');
    expect(describeExecutionTrust(DEFAULT_EXECUTION_TRUST)).toContain('network denied');
  });
});

describe('the isolation rule CONFIG.md has always stated and nothing enforced', () => {
  test('finds trust grants naming directories that no longer exist', () => {
    // Taken from the shape found live in the author's own ~/.codex/config.toml: one grant per
    // throwaway fixture workspace the test suite had ever created.
    const configToml = [
      'model = "gpt-5.6-luna"',
      '',
      `[projects.'c:\\users\\eric\\documents\\repos\\compassrose']`,
      'trust_level = "trusted"',
      '',
      `[projects.'c:\\users\\eric\\appdata\\local\\temp\\compassrose-test-abc123']`,
      'trust_level = "trusted"',
      '',
    ].join('\n');

    const stale = findStaleTrustEntries(configToml, (path) => !path.includes('compassrose-test-'));

    expect(stale).toHaveLength(1);
    expect(stale[0]?.path).toContain('compassrose-test-abc123');
  });

  test('leaves a grant for a directory that still exists alone', () => {
    // A grant for a repository someone actually works in is the tool behaving normally. Flagging
    // it would bury the signal.
    const configToml = `[projects.'/home/someone/work']\ntrust_level = "trusted"\n`;

    expect(findStaleTrustEntries(configToml, () => true)).toEqual([]);
  });

  test('reads both quoting styles a TOML table header may use', () => {
    const configToml = `[projects.'/a']\n[projects."/b"]\n`;

    expect(findStaleTrustEntries(configToml, () => false).map((entry) => entry.path)).toEqual(['/a', '/b']);
  });
});
