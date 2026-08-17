import { chmodSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { TaskRequest } from '../src/contracts/planner/plannerContracts.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsxBinary = join(repoRoot, 'node_modules', '.bin', 'tsx');

const TARGET_FEATURE_ID = '901-scope-enforcement-target';

const TASK_REQUEST: TaskRequest = {
  id: '1',
  title: 'Add the config loader',
  objective: 'Load and validate configuration from CONFIG.md.',
  scope: { allowed_paths: ['src/config', 'tests'], forbidden_paths: [] },
  status: 'not_started',
  sibling_check: { considered_features: [], belongs_to_other_feature: null },
};

describe('task-request scope enforcement', () => {
  // Regression coverage for the structured-task-request backbone's core claim: an elaborated
  // task whose scope.allowed_paths exceeds its pre-declared task request's boundary must be
  // caught deterministically (checkTaskRequestContainment), not by trusting the planner's own
  // self-reported scope_justification.deviation_reason honesty.
  test('refuses a task whose scope exceeds its task request boundary without a deviation_reason', () => {
    const workspace = prepareWorkspace();

    try {
      const result = runScenario(workspace.cloneRoot);

      expect(result.exitCode).toBe(2);
      expect(`${result.stdout}${result.stderr}`).toContain('exceeding its pre-declared boundary');
      expect(`${result.stdout}${result.stderr}`).toContain('src/orchestrator/orchestrator.ts');

      const tasksDirectory = join(workspace.cloneRoot, 'compassrose', 'features', TARGET_FEATURE_ID, 'tasks');
      const writtenTasks = existsSync(tasksDirectory) ? readdirSync(tasksDirectory) : [];
      expect(writtenTasks).toEqual([]);

      const featureState = readFileSync(join(workspace.cloneRoot, 'compassrose', 'features', TARGET_FEATURE_ID, 'state.md'), 'utf8');
      expect(featureState).toContain('## Lifecycle State\n\nblocked');

      // The task-requests artifact itself must be untouched -- this was a rejection, not a
      // justified widening (see the deviation_reason-accepted scenario for that path).
      const artifactPath = join(
        workspace.cloneRoot,
        '.git',
        'proto-compassrose',
        'task-requests',
        `${TARGET_FEATURE_ID}.json`,
      );
      expect(JSON.parse(readFileSync(artifactPath, 'utf8'))).toEqual([TASK_REQUEST]);
    } finally {
      workspace.dispose();
    }
  });

  // Complements the rejection test above: when the planner honestly names a deviation_reason,
  // the orchestrator must accept the widened scope, write the task, and persist the widened
  // boundary back into the task request's own allowed_paths (withWidenedScope) instead of
  // leaving the JSON artifact with a now-stale picture of the feature's actual boundaries.
  test('accepts and persists a justified scope deviation', () => {
    const workspace = prepareWorkspace({ withDeviationReason: true });

    try {
      const result = runScenario(workspace.cloneRoot);

      expect(result.exitCode).toBe(0);

      const tasksDirectory = join(workspace.cloneRoot, 'compassrose', 'features', TARGET_FEATURE_ID, 'tasks');
      const writtenTasks = existsSync(tasksDirectory) ? readdirSync(tasksDirectory) : [];
      expect(writtenTasks.length).toBe(1);

      const artifactPath = join(
        workspace.cloneRoot,
        '.git',
        'proto-compassrose',
        'task-requests',
        `${TARGET_FEATURE_ID}.json`,
      );
      const persisted = JSON.parse(readFileSync(artifactPath, 'utf8')) as TaskRequest[];
      expect(persisted[0]?.scope.allowed_paths).toEqual([
        'src/config',
        'tests',
        'src/orchestrator/orchestrator.ts',
      ]);
    } finally {
      workspace.dispose();
    }
  });
});

function prepareWorkspace(options: { withDeviationReason?: boolean } = {}): { cloneRoot: string; dispose: () => void } {
  const tempRoot = mkdtempSync(join(tmpdir(), 'compassrose-scope-enforcement-'));
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

  copyTree(join(repoRoot, 'src'), join(cloneRoot, 'src'));
  // Remove every real feature -- this scenario needs nothing but our synthetic target, and (as
  // in tests/featurePlanningOutline.test.ts) a request_pending real feature can't be neutralized
  // by rewriting a lifecycle-state line that doesn't exist yet.
  rmSync(join(cloneRoot, 'compassrose', 'features'), { recursive: true, force: true });
  // Real, still-unformalized fixes committed in this repo's own compassrose/fixes now default to
  // 'critical' severity (fail-safe upward -- see readFixSeverityAndOwnership) until formalized,
  // so they would otherwise outrank this scenario's synthetic feature in the clone and hijack
  // the run. Remove them; this test only exercises task-request scope enforcement.
  rmSync(join(cloneRoot, 'compassrose', 'fixes'), { recursive: true, force: true });
  seedTargetFeature(cloneRoot);
  seedTaskRequestArtifact(cloneRoot);
  writeExecutableScript(
    join(tempRoot, 'codex-mock.cjs'),
    options.withDeviationReason ? CODEX_JUSTIFIED_DEVIATION_MOCK : CODEX_OUT_OF_BOUNDS_MOCK,
  );
  writeExecutableScript(join(tempRoot, 'opencode-mock.cjs'), OPENCODE_STUB_MOCK);

  return {
    cloneRoot,
    dispose: () => rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
  };
}

function runScenario(cloneRoot: string): { exitCode: number | null; stdout: string; stderr: string } {
  const tempRoot = dirname(cloneRoot);
  const runResult = spawnSync(
    tsxBinary,
    ['src/cli/main.ts', '--no-commit', '--implementer', 'opencode'],
    {
      cwd: cloneRoot,
      env: {
        ...process.env,
        PROTO_COMPASSROSE_CODEX_COMMAND: join(tempRoot, 'codex-mock.cjs'),
        PROTO_COMPASSROSE_OPENCODE_COMMAND: join(tempRoot, 'opencode-mock.cjs'),
        PROTO_COMPASSROSE_SKIP_CLEAN_CHECK: '1',
      },
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      shell: process.platform === 'win32',
    },
  );

  return {
    exitCode: runResult.status,
    stdout: runResult.stdout || '',
    stderr: runResult.stderr || '',
  };
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

function seedTargetFeature(cloneRoot: string): void {
  const featureRoot = join(cloneRoot, 'compassrose', 'features', TARGET_FEATURE_ID);
  mkdirSync(featureRoot, { recursive: true });

  writeFileSync(
    join(featureRoot, 'request.md'),
    `# Request: Scope Enforcement Test Target

A synthetic feature used only by tests/taskRequestScopeEnforcement.test.ts.
`,
    'utf8',
  );

  writeFileSync(
    join(featureRoot, 'feature.md'),
    `# Feature: Scope Enforcement Test Target

## Purpose

A synthetic feature used only to test deterministic task-request scope enforcement.

## Scope

This feature includes:

- a config loader

This feature does not include:

- anything under src/orchestrator/
`,
    'utf8',
  );

  writeFileSync(
    join(featureRoot, 'architecture.md'),
    `# Architecture: Scope Enforcement Test Target

No real architecture; this feature exists only for test fixtures.
`,
    'utf8',
  );

  writeFileSync(
    join(featureRoot, 'state.md'),
    `# State: Scope Enforcement Test Target

## Lifecycle State

task_planning_pending

## Source Request

\`request.md\`

## Operational Status

- formalization: complete
- active_task: none
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: not_run
- last_quality_gate_result: unknown
- last_review_result: not_run
- last_unblock_result: not_run

## Current Reality

The feature is formalized and ready for its first task request to be elaborated.

## Implemented Deliverables

- feature formalization exists

## Remaining Deliverables

- elaborate task request 1

## Outline Progress

- 1. Add the config loader: not started

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none
- active_unblock_task: none

## Last Approved Change

None yet.

## Known Gaps

- None

## Next Planning Hint

Elaborate task request 1.
`,
    'utf8',
  );
}

function seedTaskRequestArtifact(cloneRoot: string): void {
  const artifactPath = join(cloneRoot, '.git', 'proto-compassrose', 'task-requests', `${TARGET_FEATURE_ID}.json`);
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify([TASK_REQUEST], null, 2)}\n`, 'utf8');
}

function writeExecutableScript(path: string, contents: string): void {
  writeFileSync(path, contents, 'utf8');
  chmodSync(path, 0o755);
}

const CODEX_OUT_OF_BOUNDS_MOCK = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const outputPath = readArgValue(args, '-o');

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify({
      task: {
        task_id: 'F901-T01',
        previous_task_id: null,
        feature_id: '${TARGET_FEATURE_ID}',
        title: 'Add the config loader and refactor orchestrator dispatch',
        objective: 'Load configuration and also refactor how the orchestrator dispatches steps.',
        first_executable_step: 'Add a failing test for the config loader.',
        minimum_progress_evidence: ['a config loader test exists'],
        trace: {
          roadmap_objective: 'Deterministic Configuration',
          feature_goal: 'Scope enforcement test target feature goal.',
          state_gap: 'The feature needs its first task request elaborated.',
        },
        context: {
          summary: 'Scope enforcement test scenario: this task reaches beyond its task request boundary.',
          relevant_paths: ['src/config/loader.ts', 'src/orchestrator/orchestrator.ts'],
          relevant_modules: ['config', 'orchestrator'],
        },
        scope: {
          allowed_paths: ['src/config/loader.ts', 'src/orchestrator/orchestrator.ts', 'tests/loader.test.ts'],
          forbidden_paths: [],
        },
        constraints: [],
        development_policy: { mode: 'test_guided' },
        quality_gates: { before_review: ['npm test'] },
        acceptance_criteria: ['n/a: this task is expected to be refused before it is written'],
        expected_deliverables: ['code', 'tests'],
        scope_justification: {
          included_by: 'Load and validate configuration from CONFIG.md.',
          excluded_by: [],
          belongs_to_other_feature: null,
          deviation_reason: null,
        },
      },
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

const CODEX_JUSTIFIED_DEVIATION_MOCK = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const outputPath = readArgValue(args, '-o');

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify({
      task: {
        task_id: 'F901-T01',
        previous_task_id: null,
        feature_id: '${TARGET_FEATURE_ID}',
        title: 'Add the config loader and wire it into the orchestrator constructor',
        objective: 'Load configuration and wire the loader into the orchestrator constructor, since the loader is unusable without that wiring.',
        first_executable_step: 'Add a failing test for the config loader.',
        minimum_progress_evidence: ['a config loader test exists'],
        trace: {
          roadmap_objective: 'Deterministic Configuration',
          feature_goal: 'Scope enforcement test target feature goal.',
          state_gap: 'The feature needs its first task request elaborated.',
        },
        context: {
          summary: 'Scope enforcement test scenario: this task honestly justifies exceeding its task request boundary.',
          relevant_paths: ['src/config/loader.ts', 'src/orchestrator/orchestrator.ts'],
          relevant_modules: ['config', 'orchestrator'],
        },
        scope: {
          allowed_paths: ['src/config/loader.ts', 'src/orchestrator/orchestrator.ts', 'tests/loader.test.ts'],
          forbidden_paths: [],
        },
        constraints: [],
        development_policy: { mode: 'test_guided' },
        quality_gates: { before_review: ['npm test'] },
        acceptance_criteria: ['the config loader is wired into the orchestrator constructor'],
        expected_deliverables: ['code', 'tests'],
        scope_justification: {
          included_by: 'Load and validate configuration from CONFIG.md.',
          excluded_by: [],
          belongs_to_other_feature: null,
          deviation_reason: 'The loader is dead code unless the orchestrator constructor wires it in; this one wiring line is necessary to make task request 1 actually verifiable.',
        },
      },
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

const OPENCODE_STUB_MOCK = `#!/usr/bin/env node
process.exit(0);
`;
