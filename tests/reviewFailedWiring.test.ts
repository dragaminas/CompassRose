import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ParsedTaskDocument } from '../src/contracts/task/taskContracts.js';
import type { BlockerProfile } from '../src/contracts/task/taskContracts.js';
import type { ImplementationAttempt } from '../src/contracts/runtime/attempts.js';
import type { ReviewerOutput } from '../src/contracts/reviewer/reviewerContracts.js';
import type { WorkItemContext } from '../src/contracts/runtime/protoRuntime.js';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { copyContractsIntoWorkspace, createTempWorkspace, readFixtureConfigMarkdown, type TempWorkspace } from './testUtils.js';

// This test does not mock the codex command, so recordFailedReview()'s ensemble fallback (see
// ADR-0036) makes BLOCKER_KIND_ENSEMBLE_SIZE real, sequential codex calls (previously zero calls
// here). Each real call has taken up to ~20s combined in isolation; the suite-wide 30000ms
// default (vitest.config.ts) leaves too little headroom once this runs alongside the rest of the
// full suite under contention -- same rationale as protoBlockerFlows.test.ts's own override.
// Bumped from 60000 to 90000: even 60s intermittently timed out as the full suite grew longer
// (more real-codex-invoking tests added this session), while this test alone has stayed ~21s.
vi.setConfig({ testTimeout: 90000 });

const PROJECT_STATE_SEED = `# CompassRose Project State

## Status

active

## Active Feature

\`none\`

## Current Reality

- Fixture workspace for review-failed wiring tests.

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

Fixture state for testing review_failed wiring.

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
Fixture task for review-failed wiring tests.

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
      'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
      'compassrose/PROJECT_STATE.md': PROJECT_STATE_SEED,
      [`compassrose/features/${featureId}/feature.md`]: `# Feature: Fixture Feature\n\nFixture feature document.\n`,
      [`compassrose/features/${featureId}/architecture.md`]: `# Architecture: Fixture Feature\n\nFixture architecture document.\n`,
      [`compassrose/features/${featureId}/state.md`]: featureStateSeed(taskId),
      [`compassrose/features/${featureId}/tasks/001-fixture-task.md`]: taskDoc(taskId, featureId),
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

interface ReviewFailedAccess {
  resolveWorkItemContext(featureId: string): WorkItemContext;
  loadTask(taskId: string): ParsedTaskDocument;
  recordFailedReview(
    task: ParsedTaskDocument,
    review: ReviewerOutput,
    implementation: ImplementationAttempt,
    qualityResults: readonly unknown[],
  ): BlockerProfile;
}

function asAccess(orchestrator: CompassRoseOrchestrator): ReviewFailedAccess {
  return orchestrator as unknown as ReviewFailedAccess;
}

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
});

describe('reviewer failed -> review_failed wiring', () => {
  test('persists review_failed lifecycle instead of a silent dead end', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const task = access.loadTask('F001-T01');

    const blocker = access.recordFailedReview(task, failedReviewOutput('F001-T01'), fixtureImplementationAttempt(), []);

    expect(blocker.kind).toBeTruthy();

    const featureState = readFileSync(join(workspace.root, 'compassrose', 'features', 'fixture-feature', 'state.md'), 'utf8');
    expect(featureState.match(/## Lifecycle State\n\n(\S+)/)?.[1]).toBe('review_failed');
    expect(featureState).toContain('- last_review_result: failed');
    expect(featureState).toContain(blocker.signature);
  });
});
