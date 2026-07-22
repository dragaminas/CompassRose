import { chmodSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { TaskRequest } from '../src/contracts/planner/plannerContracts.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsxBinary = join(repoRoot, 'node_modules', '.bin', 'tsx');

const TARGET_FEATURE_ID = '902-backfill-target';
const EXISTING_TASK_ID = 'F902-T01';

describe('task-request backfill for a legacy feature', () => {
  // Regression coverage for the structured-task-request backbone's Phase 4: a feature
  // formalized before task requests existed (no task-requests artifact) must have one
  // backfilled from its existing feature.md and its already-existing tasks, reconciled
  // against repository ground truth, before task planning proceeds -- not fall back to
  // free-form planning forever.
  test('backfills task_requests from feature.md and existing tasks, then plans the next task deterministically', () => {
    const workspace = prepareWorkspace();

    try {
      const result = runScenario(workspace.cloneRoot);
      expect(`${result.stdout}${result.stderr}`).not.toContain('TypeError');
      expect(result.exitCode).toBe(0);

      const artifactPath = join(
        workspace.cloneRoot,
        '.git',
        'proto-compassrose',
        'task-requests',
        `${TARGET_FEATURE_ID}.json`,
      );
      const persisted = JSON.parse(readFileSync(artifactPath, 'utf8')) as Array<TaskRequest & { covers_existing_task_ids?: unknown }>;

      expect(persisted).toHaveLength(2);
      expect(persisted[0]?.status).toBe('complete');
      expect(persisted[0]?.covers_existing_task_ids).toBeUndefined();
      expect(persisted[1]?.id).toBe('2');
      // Phase 5: updateFeatureStateForTaskPlan flips status to in_progress as soon as the
      // task is written (completion happens later, on review approval).
      expect(persisted[1]?.status).toBe('in_progress');

      const tasksDirectory = join(workspace.cloneRoot, 'docs', 'features', TARGET_FEATURE_ID, 'tasks');
      const writtenTasks = readdirSync(tasksDirectory);
      expect(writtenTasks.length).toBe(2);

      // Phase 5: `## Outline Progress` in state.md is regenerated from the task-requests
      // artifact, not hand-edited -- it must reflect the same in_progress flip as the JSON.
      const featureState = readFileSync(join(workspace.cloneRoot, 'docs', 'features', TARGET_FEATURE_ID, 'state.md'), 'utf8');
      expect(featureState).toContain('- 1. Add the loader: complete');
      expect(featureState).toContain('- 2. Wire the loader into the orchestrator: in progress');
    } finally {
      workspace.dispose();
    }
  }, 20000);
});

function prepareWorkspace(): { cloneRoot: string; dispose: () => void } {
  const tempRoot = mkdtempSync(join(tmpdir(), 'compassrose-backfill-'));
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
  rmSync(join(cloneRoot, 'docs', 'features'), { recursive: true, force: true });
  // Real, still-unformalized fixes committed in this repo's own docs/fixes now default to
  // 'critical' severity (fail-safe upward -- see readFixSeverityAndOwnership) until formalized,
  // so they would otherwise outrank this scenario's synthetic feature in the clone and hijack
  // the run. Remove them; this test only exercises feature task-request backfill.
  rmSync(join(cloneRoot, 'docs', 'fixes'), { recursive: true, force: true });
  seedTargetFeature(cloneRoot);
  writeExecutableScript(join(tempRoot, 'codex-mock.cjs'), CODEX_BACKFILL_MOCK);
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
  const featureRoot = join(cloneRoot, 'docs', 'features', TARGET_FEATURE_ID);
  const tasksDirectory = join(featureRoot, 'tasks');
  mkdirSync(tasksDirectory, { recursive: true });

  writeFileSync(
    join(featureRoot, 'request.md'),
    `# Request: Backfill Test Target

A synthetic feature used only by tests/taskRequestBackfill.test.ts.
`,
    'utf8',
  );

  writeFileSync(
    join(featureRoot, 'feature.md'),
    `# Feature: Backfill Test Target

## Purpose

A synthetic feature used only to test task-request backfill for legacy formalized features.

## Scope

This feature includes:

- a config loader
- wiring the loader into the orchestrator

## Implementation Outline

1. Add the loader
2. Wire the loader into the orchestrator
`,
    'utf8',
  );

  writeFileSync(
    join(featureRoot, 'architecture.md'),
    `# Architecture: Backfill Test Target

No real architecture; this feature exists only for test fixtures.
`,
    'utf8',
  );

  writeFileSync(
    join(featureRoot, 'state.md'),
    `# State: Backfill Test Target

## Lifecycle State

task_planning_pending

## Source Request

\`request.md\`

## Operational Status

- formalization: complete
- active_task: none
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: passed
- last_quality_gate_result: passed
- last_review_result: approved
- last_unblock_result: not_run

## Current Reality

The loader task is done; the wiring task has not been planned yet.

## Implemented Deliverables

- config loader exists

## Remaining Deliverables

- wire the loader into the orchestrator

## Outline Progress

- Add the loader: complete
- Wire the loader into the orchestrator: not started

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none
- active_unblock_task: none

## Last Approved Change

Task \`${EXISTING_TASK_ID}\` was approved.

## Known Gaps

- None

## Next Planning Hint

Plan the task that wires the loader into the orchestrator.
`,
    'utf8',
  );

  writeFileSync(
    join(tasksDirectory, '001-add-the-loader.md'),
    `# Task 001: Add the loader

## Task ID

\`${EXISTING_TASK_ID}\`

## Parent Feature

\`${TARGET_FEATURE_ID}\`

## Goal

Load configuration from CONFIG.md.

## Scope

Allowed:
- \`src/config/loader.ts\`

Forbidden:
`,
    'utf8',
  );
}

function writeExecutableScript(path: string, contents: string): void {
  writeFileSync(path, contents, 'utf8');
  chmodSync(path, 0o755);
}

const CODEX_BACKFILL_MOCK = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const outputPath = readArgValue(args, '-o');
const schemaPath = readArgValue(args, '--output-schema');
const schemaContents = schemaPath ? fs.readFileSync(schemaPath, 'utf8') : '';
const isBackfillCall = schemaContents.includes('covers_existing_task_ids');

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(isBackfillCall ? backfillResponse() : elaborationResponse(), null, 2) + '\\n', 'utf8');
}

process.exit(0);

function backfillResponse() {
  return {
    task_requests: [
      {
        id: '1',
        title: 'Add the loader',
        objective: 'Load configuration from CONFIG.md.',
        scope: { allowed_paths: ['src/config', 'tests'], forbidden_paths: [] },
        status: 'complete',
        sibling_check: { considered_features: [], belongs_to_other_feature: null },
        covers_existing_task_ids: ['${EXISTING_TASK_ID}'],
      },
      {
        id: '2',
        title: 'Wire the loader into the orchestrator',
        objective: 'Wire the config loader into the orchestrator constructor.',
        scope: { allowed_paths: ['src/orchestrator', 'tests'], forbidden_paths: [] },
        status: 'not_started',
        sibling_check: { considered_features: [], belongs_to_other_feature: null },
        covers_existing_task_ids: [],
      },
    ],
  };
}

function elaborationResponse() {
  return {
    task: {
      task_id: 'F902-T02',
      previous_task_id: null,
      feature_id: '${TARGET_FEATURE_ID}',
      title: 'Wire the loader into the orchestrator',
      objective: 'Wire the config loader into the orchestrator constructor.',
      first_executable_step: 'Add a failing test for the wiring.',
      minimum_progress_evidence: ['a wiring test exists'],
      trace: {
        roadmap_objective: 'Deterministic Configuration',
        feature_goal: 'Backfill test target feature goal.',
        state_gap: 'The feature needs its second task request elaborated.',
      },
      context: {
        summary: 'Backfill test scenario: elaborating task request 2.',
        relevant_paths: ['src/orchestrator/orchestrator.ts'],
        relevant_modules: ['orchestrator'],
      },
      scope: {
        allowed_paths: ['src/orchestrator/orchestrator.ts', 'tests/wiring.test.ts'],
        forbidden_paths: [],
      },
      constraints: [],
      development_policy: { mode: 'test_guided' },
      quality_gates: { before_review: ['npm test'] },
      acceptance_criteria: ['the loader is wired into the orchestrator constructor'],
      expected_deliverables: ['code', 'tests'],
      scope_justification: {
        included_by: 'Wire the config loader into the orchestrator constructor.',
        excluded_by: [],
        belongs_to_other_feature: null,
        deviation_reason: null,
      },
    },
  };
}

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
