import { chmodSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsxBinary = join(repoRoot, 'node_modules', '.bin', 'tsx');

describe('proto controlled stop', () => {
  // This scenario simulates an interrupt by having the mocked implementer send itself
  // SIGINT, then asserts the signal is visible on the process this test spawned. Windows
  // has no real POSIX signals: without a console attached (as here, with piped stdio),
  // a self-directed process.kill(pid, 'SIGINT') is emulated as a plain TerminateProcess,
  // so Node reports `signal: null` instead of propagating 'SIGINT' up through the
  // heartbeat-runner -> orchestrator chain. Real interactive Ctrl+C (a genuine console
  // CTRL_C_EVENT hitting the whole process group) is unaffected by this and is handled by
  // CompassRoseOrchestrator's own process.on('SIGINT') (installControlledStopHandlers in
  // src/orchestrator/orchestrator.ts) — only this piped-subprocess simulation
  // can't be verified on win32.
  test.skipIf(process.platform === 'win32')('stops cleanly on SIGINT without converting the interrupt into a failure', async () => {
    const workspace = prepareControlledStopWorkspace();

    try {
      const result = await runProtoControlledStop(workspace.cloneRoot);

      expect(result.exitCode === 130 || result.signal === 'SIGINT').toBe(true);
      expect(`${result.stdout}${result.stderr}`).toContain('Controlled stop requested');
      expect(result.stdout).toContain('Next step: plan_subtask');
      expect(result.stdout).toContain('Next step: implement_subtask');
      expect(result.stdout).toContain('[opencode:implementer:subtask:F002-T04:attempt-1] start');
      expect(result.stderr).not.toContain('failed; recovery will continue through unblock planning');

      const runSummary = JSON.parse(readFileSync(join(workspace.cloneRoot, '.git', 'proto-compassrose', 'latest-run.json'), 'utf8')) as {
        status?: string;
        exit_code?: number;
      };

      expect(runSummary.status).toBe('stopped');
      expect(runSummary.exit_code).toBe(130);

      const featureState = readFileSync(join(workspace.cloneRoot, 'docs', 'features', '002-configuration-model', 'state.md'), 'utf8');
      expect(featureState).toContain('## Lifecycle State\n\nimplementation_running');
      expect(featureState).toContain('- active_task: F002-T04');
      expect(featureState).not.toContain('implementation_failed');
      expect(existsSync(join(workspace.cloneRoot, 'proto', 'controlled-stop-marker.txt'))).toBe(true);
    } finally {
      workspace.dispose();
    }
  });
});

function prepareControlledStopWorkspace(): { cloneRoot: string; dispose: () => void } {
  const tempRoot = mkdtempSync(join(tmpdir(), 'compassrose-controlled-stop-'));
  const bareRoot = join(tempRoot, 'repo.git');
  const cloneRoot = join(tempRoot, 'repo');

  const cloneResult = spawnSync('git', ['clone', '--bare', '--quiet', repoRoot, bareRoot], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (cloneResult.status !== 0) {
    throw new Error(`git clone --bare failed:\n${cloneResult.stderr || cloneResult.stdout}`);
  }

  const worktreeResult = spawnSync('git', ['clone', '--quiet', bareRoot, cloneRoot], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (worktreeResult.status !== 0) {
    throw new Error(`git clone failed:\n${worktreeResult.stderr || worktreeResult.stdout}`);
  }

  syncPrototypeRuntime(repoRoot, cloneRoot);
  seedTaskReadyState(cloneRoot);
  seedTaskArtifact(cloneRoot);
  writeExecutableScript(join(tempRoot, 'codex-mock.cjs'), CODEX_SELECTOR_MOCK);
  writeExecutableScript(join(tempRoot, 'opencode-mock.cjs'), OPENCODE_SLEEPING_MOCK);

  return {
    cloneRoot,
    dispose: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

async function runProtoControlledStop(cloneRoot: string): Promise<{
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}> {
  const tempRoot = dirname(cloneRoot);
  const runResult = spawnSync(
    tsxBinary,
    ['src/cli/main.ts', '--loop', '--no-commit', '--implementer', 'opencode'],
    {
      cwd: cloneRoot,
      env: {
        ...process.env,
        PROTO_COMPASSROSE_CODEX_COMMAND: join(tempRoot, 'codex-mock.cjs'),
        PROTO_COMPASSROSE_OPENCODE_COMMAND: join(tempRoot, 'opencode-mock.cjs'),
        PROTO_COMPASSROSE_SKIP_CLEAN_CHECK: '1',
        PROTO_COMPASSROSE_TEST_INTERRUPT: '1',
      },
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      shell: process.platform === 'win32',
    },
  );

  return {
    exitCode: runResult.status,
    signal: runResult.signal,
    stdout: runResult.stdout || '',
    stderr: runResult.stderr || '',
  };
}

function syncPrototypeRuntime(sourceRoot: string, targetRoot: string): void {
  copyTree(join(sourceRoot, 'src'), join(targetRoot, 'src'));
}

function copyTree(sourceRoot: string, targetRoot: string): void {
  if (!existsSync(sourceRoot)) {
    return;
  }

  if (statSync(sourceRoot).isFile()) {
    mkdirSync(dirname(targetRoot), { recursive: true });
    writeFileSync(targetRoot, readFileSync(sourceRoot, 'utf8'), 'utf8');
    return;
  }

  mkdirSync(targetRoot, { recursive: true });
  for (const entry of readdirSync(sourceRoot)) {
    copyTree(join(sourceRoot, entry), join(targetRoot, entry));
  }
}

function seedTaskReadyState(cloneRoot: string): void {
  const statePath = join(cloneRoot, 'docs', 'features', '002-configuration-model', 'state.md');
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(
    statePath,
    `# State: Configuration Model

## Lifecycle State

task_ready

## Source Request

\`request.md\`

## Operational Status

- formalization: complete
- active_task: F002-T04
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: not_run
- last_quality_gate_result: unknown
- last_review_result: not_run
- last_unblock_result: not_run

## Current Reality

The configuration loader task is ready to execute.

## Implemented Deliverables

- feature formalization exists

## Remaining Deliverables

- validate runtime-precondition policy fields in the project config loader

## Outline Progress

- Plan the configuration loader task: complete
- Implement the loader task: not started

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none
- active_unblock_task: none

## Last Approved Change

Task \`F002-T04\` was approved before the controlled-stop test scenario.

## Known Gaps

- None

## Next Planning Hint

Execute \`F002-T04\` when the current execution mode allows it.
`,
    'utf8',
  );
}

function seedTaskArtifact(cloneRoot: string): void {
  const artifactsRoot = join(cloneRoot, '.git', 'proto-compassrose', 'tasks');
  mkdirSync(artifactsRoot, { recursive: true });
  writeFileSync(join(artifactsRoot, 'F002-T04.json'), `${JSON.stringify(SEEDED_TASK, null, 2)}\n`, 'utf8');
}

function writeExecutableScript(path: string, contents: string): void {
  writeFileSync(path, contents, 'utf8');
  chmodSync(path, 0o755);
}

const CODEX_SELECTOR_MOCK = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const outputPath = readArgValue(args, '-o');

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify({
      kind: 'plan_subtask',
      feature_id: '002-configuration-model',
      task_id: 'F002-T04',
      correction_task_id: null,
      reason: 'controlled stop test: start implementation',
    }, null, 2) + '\\n',
    'utf8',
  );
}

process.exit(0);

function readArgValue(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return args[index + 1] || null;
}
`;

const OPENCODE_SLEEPING_MOCK = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const markerPath = path.join(process.cwd(), 'proto', 'controlled-stop-marker.txt');
fs.mkdirSync(path.dirname(markerPath), { recursive: true });
fs.writeFileSync(markerPath, 'controlled stop test marker\\n', 'utf8');

process.stdin.resume();
if (process.env.PROTO_COMPASSROSE_TEST_INTERRUPT === '1') {
  setTimeout(() => process.kill(process.pid, 'SIGINT'), 100);
}
setTimeout(() => process.exit(0), 30000);
`;

const SEEDED_TASK = {
  task: {
    task_id: 'F002-T04',
    feature_id: '002-configuration-model',
    title: 'Validate runtime-precondition policy fields in the project config loader',
    objective:
      'Extend the repository-local configuration model so runtime orchestration can safely consume execution, roles, and git_policy from docs/compassrose/CONFIG.md.',
    first_executable_step:
      'Extend ProjectConfiguration in src/config/configTypes.ts with typed execution, roles, and git_policy sections that match the canonical keys already present in docs/compassrose/CONFIG.md.',
    minimum_progress_evidence: [
      'readProjectConfiguration() returns typed execution, roles, and git_policy data when loading the canonical project config.',
      'Invalid runtime-precondition values such as an unsupported execution.mode, a missing required role entry, or an invalid git_policy value produce field-specific ConfigurationIssue results.',
      'Config-loader tests cover the new runtime-policy fields, and the existing Doctor happy-path test still passes.',
    ],
    trace: {
      roadmap_objective: 'Deterministic Orchestration',
      feature_goal:
        'Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.',
      state_gap: 'The project-local configuration flow still needs to be connected to the broader runtime orchestration loop.',
    },
    context: {
      summary:
        'The repository already has a working Markdown-backed config loader and a Doctor preflight, but the typed configuration surface still stops at the narrow Doctor MVP contract.',
      relevant_paths: [
        'docs/features/002-configuration-model/state.md',
        'docs/compassrose/CONFIG.md',
        'src/contracts/runtime/operation-loop.md',
        'src/cli/main.ts',
        'src/config/configTypes.ts',
        'src/config/configReader.ts',
        'src/doctor/doctorCommand.ts',
        'tests/configReader.test.ts',
      ],
      relevant_modules: ['ProjectConfiguration', 'readProjectConfiguration()', 'runDoctor()'],
    },
    scope: {
      allowed_paths: [
        'src/config/configTypes.ts',
        'src/config/configReader.ts',
        'src/doctor/doctorCommand.ts',
        'tests/configReader.test.ts',
        'tests/doctorCommand.test.ts',
      ],
      forbidden_paths: [
        'docs/compassrose/CONFIG.md',
        'docs/features/002-configuration-model/',
        'src/cli/main.ts',
        'src/doctor/projectState.ts',
        'tests/projectState.test.ts',
      ],
    },
    constraints: [
      'Treat docs/compassrose/CONFIG.md as the only project-level source of truth.',
      'Validate only the runtime-precondition sections needed for the first orchestration handoff.',
      'Keep the implementation provider-independent and limited to repository-owned policy already documented in the canonical config.',
      "Preserve current Doctor behavior on the repository's existing canonical config while expanding the loader contract.",
    ],
    development_policy: {
      mode: 'test_guided',
    },
    quality_gates: {
      before_review: ['npm test', 'npm run typecheck'],
    },
    acceptance_criteria: [
      'readProjectConfiguration() succeeds on the current canonical docs/compassrose/CONFIG.md and exposes typed execution, roles, and git_policy values to callers.',
      'The loader reports field-specific validation failures for unsupported execution.mode values, missing required role entries, and invalid git_policy enum or boolean fields.',
      'runDoctor() continues to pass on the happy-path fixture without requiring changes to the documented project config.',
    ],
    expected_deliverables: ['code', 'tests'],
  },
};
