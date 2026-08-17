import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ParsedTaskDocument } from '../src/contracts/task/taskContracts.js';
import type { BlockerProfile } from '../src/contracts/task/taskContracts.js';
import type { ImplementationAttempt } from '../src/contracts/runtime/attempts.js';
import type { ReviewerOutput } from '../src/contracts/reviewer/reviewerContracts.js';
import type { WorkItemContext } from '../src/contracts/runtime/protoRuntime.js';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { copyContractsIntoWorkspace, createTempWorkspace, readFixtureConfigMarkdown, type TempWorkspace } from './testUtils.js';

// Covers buildReviewBlockerProfile()'s ensemble fallback branch (see ADR-0036): unanimous
// agreement is trusted, disagreement forces human recoverability, and an unavailable ensemble
// (no codex binary) must fall back to classifyBlockerKind() exactly as before this feature
// existed -- see reviewFailedWiring.test.ts for the pre-existing non-ensemble-specific coverage
// of recordFailedReview() this file does not duplicate.

const PROJECT_STATE_SEED = `# CompassRose Project State

## Status

active

## Active Feature

\`none\`

## Current Reality

- Fixture workspace for blocker-kind ensemble tests.

## Pending

- Nothing pending.

## Blocked

- Nothing blocked.

## Last Approved Change

None yet.

## Known Gaps

None.

## Next Planning Hint

None.
`;

function featureStateSeed(activeTask: string): string {
  return `# State: Fixture Feature

## Lifecycle State

implementation_running

## Source Request

\`request.md\`

## Operational Status

- formalization: complete
- active_task: ${activeTask}
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: not_run
- last_quality_gate_result: unknown
- last_review_result: not_run
- last_unblock_result: not_run

## Current Reality

Fixture state for blocker-kind ensemble tests.

## Implemented Deliverables

- None yet.

## Remaining Deliverables

- None yet.

## Outline Progress

- Fixture task request: not started

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none
- active_unblock_task: none

## Last Approved Change

None

## Known Gaps

- None

## Next Planning Hint

None
`;
}

function taskDoc(taskId: string, featureId: string): string {
  return `# Task: Fixture task

## Task ID
\`${taskId}\`

## Parent Feature
\`${featureId}\`

## Goal
Fixture task for blocker-kind ensemble tests.

## Scope
Allowed:
- \`src/allowed.ts\`

Forbidden:
- all other paths

## Quality Gates to Run
\`\`\`bash
echo unused
\`\`\`
`;
}

function createWorkspace(featureId: string, taskId: string): TempWorkspace {
  const workspace = createTempWorkspace({
    files: {
      'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown(),
      'docs/compassrose/PROJECT_STATE.md': PROJECT_STATE_SEED,
      [`docs/features/${featureId}/feature.md`]: `# Feature: Fixture Feature\n\nFixture feature document.\n`,
      [`docs/features/${featureId}/architecture.md`]: `# Architecture: Fixture Feature\n\nFixture architecture document.\n`,
      [`docs/features/${featureId}/state.md`]: featureStateSeed(taskId),
      [`docs/features/${featureId}/tasks/001-fixture-task.md`]: taskDoc(taskId, featureId),
    },
  });
  copyContractsIntoWorkspace(workspace.root);
  mkdirSync(join(workspace.root, 'src'), { recursive: true });
  writeFileSync(join(workspace.root, 'src', 'allowed.ts'), 'export const allowed = true;\n', 'utf8');

  execFileSync('git', ['init', '--quiet'], { cwd: workspace.root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspace.root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspace.root });
  execFileSync('git', ['add', '-A'], { cwd: workspace.root });
  execFileSync('git', ['commit', '--quiet', '-m', 'initial commit'], { cwd: workspace.root });

  return workspace;
}

function failedReviewOutput(taskId: string): ReviewerOutput {
  return {
    task_id: taskId,
    status: 'failed',
    summary: 'The implementation attempt is invalid or unusable.',
    acceptance: { criteria: [] },
    findings: [
      { severity: 'blocker', message: 'The attempt produced no verifiable diff for review.', path: null, related_acceptance_criterion: null },
    ],
    scope_check: { status: 'passed', unrelated_changes: [] },
    quality_gate_check: { status: 'passed', failed_gates: [] },
    correction_task: null,
    project_state_update_hint: null,
  };
}

function fixtureImplementationAttempt(): ImplementationAttempt {
  return {
    status: 'success',
    changed_files: [],
    git_diff: '',
    fallback_changed_files: [],
    fallback_git_diff: null,
    raw_output: '',
    implementation_notes: null,
    diagnostics: {
      classification: 'unknown',
      evidence: [],
      first_executable_step_status: 'unknown',
      minimum_progress_evidence_status: 'unknown',
      exit_code: null,
      signal: null,
      timed_out: false,
      command_invoked: null,
    },
    error: null,
  };
}

// Returns a fixed kind for the Nth classifier call in a run (1-indexed), cycling through
// `kinds` -- e.g. ['a','a','a'] simulates unanimous agreement, ['a','b','a'] simulates
// disagreement. A counter file on disk tracks the call index across the three separate codex
// subprocess invocations one buildReviewBlockerProfile() call makes.
function writeSequentialClassifierMock(root: string, kinds: readonly string[]): string {
  const scriptPath = join(root, 'codex-mock-classifier.cjs');
  const counterPath = join(root, 'classifier-mock-counter.txt');
  writeFileSync(counterPath, '0', 'utf8');
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
const outputPath = outputIndex === -1 ? null : args[outputIndex + 1];
const kinds = ${JSON.stringify(kinds)};
const counterPath = ${JSON.stringify(counterPath)};
const index = Number(fs.readFileSync(counterPath, 'utf8'));
fs.writeFileSync(counterPath, String(index + 1), 'utf8');
const payload = { kind: kinds[index % kinds.length], rationale: 'mock ensemble vote ' + index };
if (outputPath) {
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\\n', 'utf8');
}
process.exit(0);
`;
  writeFileSync(scriptPath, script, 'utf8');
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

interface ReviewFailedAccess {
  loadTask(taskId: string): ParsedTaskDocument;
  recordFailedReview(
    task: ParsedTaskDocument,
    review: ReviewerOutput,
    implementation: ImplementationAttempt,
    qualityResults: readonly unknown[],
  ): BlockerProfile;
  resolveWorkItemContext(featureId: string): WorkItemContext;
}

function asAccess(orchestrator: CompassRoseOrchestrator): ReviewFailedAccess {
  return orchestrator as unknown as ReviewFailedAccess;
}

let workspace: TempWorkspace | undefined;

afterEach(() => {
  vi.unstubAllEnvs();
  workspace?.dispose();
  workspace = undefined;
});

describe('blocker-kind classification ensemble (ADR-0036)', () => {
  test('trusts a unanimous ensemble vote over the prose fallback', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', writeSequentialClassifierMock(workspace.root, ['task_interface_gap']));

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const task = access.loadTask('F001-T01');

    const blocker = access.recordFailedReview(task, failedReviewOutput('F001-T01'), fixtureImplementationAttempt(), []);

    // The prose-only fallback would have produced 'review_failure' (matches /diff|acceptance/i
    // in the reviewer summary/findings) -- a unanimous ensemble vote for a *different* kind
    // proves the ensemble result was actually used, not silently ignored.
    expect(blocker.kind).toBe('task_interface_gap');
  });

  test('forces human recoverability and kind unknown when the ensemble disagrees', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    vi.stubEnv(
      'PROTO_COMPASSROSE_CODEX_COMMAND',
      writeSequentialClassifierMock(workspace.root, ['task_interface_gap', 'review_failure', 'task_interface_gap']),
    );

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const task = access.loadTask('F001-T01');

    const blocker = access.recordFailedReview(task, failedReviewOutput('F001-T01'), fixtureImplementationAttempt(), []);

    expect(blocker.kind).toBe('unknown');
    expect(blocker.recoverability).toBe('human');
    expect(blocker.evidence.some((item) => item.includes('task_interface_gap') && item.includes('review_failure'))).toBe(true);
  });

  test('falls back to prose classification unchanged when the ensemble cannot run at all', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    // No codex binary at this path -- every ensemble call throws, so buildReviewBlockerProfile()
    // must fall back to classifyBlockerKind() exactly as it did before this feature existed.
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', join(workspace.root, 'compassrose-codex-binary-that-does-not-exist'));

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const task = access.loadTask('F001-T01');

    const blocker = access.recordFailedReview(task, failedReviewOutput('F001-T01'), fixtureImplementationAttempt(), []);

    expect(blocker.kind).toBe('review_failure');
    expect(blocker.recoverability).toBe('agent');
  });
});
