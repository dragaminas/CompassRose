import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { ParsedTaskDocument } from '../src/contracts/task/taskContracts.js';
import type { QualityGateResult } from '../src/contracts/runtime/attempts.js';
import type { WorkItemContext } from '../src/contracts/runtime/protoRuntime.js';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { copyContractsIntoWorkspace, createTempWorkspace, readFixtureConfigMarkdown, type TempWorkspace } from './testUtils.js';

const PROJECT_STATE_SEED = `# CompassRose Project State

## Status

active

## Active Feature

\`none\`

## Current Reality

- Fixture workspace for quality-gate waiver tests.

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

const FEATURE_STATE_SEED = `# State: Fixture Feature

## Lifecycle State

implementation_running

## Source Request

\`request.md\`

## Operational Status

- formalization: complete
- active_task: F001-T01
- active_correction_task: none
- last_implementation_result: not_run
- last_quality_gate_result: unknown
- last_review_result: not_run

## Current Reality

Fixture state for quality-gate waiver tests.

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

## Last Approved Change

None

## Known Gaps

- None

## Next Planning Hint

None
`;

// A minimal real task document, narrowly scoped to `src/allowed.ts`, so allowedPaths is small
// and predictable for the in-scope/out-of-scope checks below.
function taskDoc(taskId: string, featureId: string, qualityGateCommand: string): string {
  return `# Task: Fixture task

## Task ID
\`${taskId}\`

## Parent Feature
\`${featureId}\`

## Goal
Fixture task for quality-gate waiver tests.

## Scope
Allowed:
- \`src/allowed.ts\`

Forbidden:
- all other paths

## Quality Gates to Run
\`\`\`bash
${qualityGateCommand}
\`\`\`
`;
}

function createWorkspace(featureId: string, taskId: string, qualityGateCommand: string): TempWorkspace {
  const workspace = createTempWorkspace({
    files: {
      'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
      'compassrose/PROJECT_STATE.md': PROJECT_STATE_SEED,
      [`compassrose/features/${featureId}/tasks/001-fixture-task.md`]: taskDoc(taskId, featureId, qualityGateCommand),
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

interface QualityGateAccess {
  loadTask(taskId: string): ParsedTaskDocument;
  runQualityGates(task: ParsedTaskDocument): QualityGateResult[];
  resolveWorkItemContext(featureId: string): WorkItemContext;
  updateFeatureStateAfterImplementation(
    featureStatePath: string,
    taskId: string,
    lifecycleState: 'review_pending' | 'quality_failed',
    qualityResult: 'passed' | 'failed',
    qualityResults?: readonly QualityGateResult[],
  ): string;
}

function asQualityGateAccess(orchestrator: CompassRoseOrchestrator): QualityGateAccess {
  return orchestrator as unknown as QualityGateAccess;
}

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
});

describe('runQualityGates() unrelated-failure waiver', () => {
  test('waives a failure that references an out-of-scope file and reproduces on a clean baseline', () => {
    // Always fails, regardless of worktree state -- simulates a pre-existing, unrelated failure
    // (the F002-T07-C2 / F002-T10 pattern: an out-of-scope test failing for reasons that have
    // nothing to do with this task's own diff).
    const command = "node -e \"console.error('FAIL tests/unrelated.test.ts:1:1'); process.exit(1)\"";
    workspace = createWorkspace('fixture-feature', 'F001-T01', command);
    writeFileSync(join(workspace.root, 'src', 'allowed.ts'), 'export const allowed = 2;\n', 'utf8');

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asQualityGateAccess(orchestrator);
    const task = access.loadTask('F001-T01');
    const results = access.runQualityGates(task);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('waived');
    expect(results[0].output_summary).toContain('tests/unrelated.test.ts');
    // The baseline check must leave the worktree exactly as it found it.
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: workspace.root, encoding: 'utf8' }).trim())
      .toContain('src/allowed.ts');
  });

  test('does not waive a failure that references an in-scope file', () => {
    const command = "node -e \"console.error('FAIL src/allowed.ts:1:1'); process.exit(1)\"";
    workspace = createWorkspace('fixture-feature', 'F001-T01', command);
    writeFileSync(join(workspace.root, 'src', 'allowed.ts'), 'export const allowed = 2;\n', 'utf8');

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asQualityGateAccess(orchestrator);
    const task = access.loadTask('F001-T01');
    const results = access.runQualityGates(task);

    expect(results[0].status).toBe('failed');
  });

  test('does not waive a failure that does not reproduce on the clean baseline', () => {
    // Fails only when trigger.txt exists -- created by this task's own (out-of-scope) change, so
    // it passes cleanly on the baseline (HEAD, before trigger.txt existed).
    const command = "node -e \"process.exit(require('node:fs').existsSync('trigger.txt') ? 1 : 0); \" || node -e \"console.error('FAIL tests/unrelated.test.ts:1:1'); process.exit(1)\"";
    workspace = createWorkspace('fixture-feature', 'F001-T01', command);
    writeFileSync(join(workspace.root, 'trigger.txt'), 'trigger\n', 'utf8');

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asQualityGateAccess(orchestrator);
    const task = access.loadTask('F001-T01');
    const results = access.runQualityGates(task);

    expect(results[0].status).toBe('failed');
    // The baseline check must still restore the worktree, including the trigger file.
    expect(existsSync(join(workspace.root, 'trigger.txt'))).toBe(true);
  });

  test('does not waive a failure whose output names no path at all', () => {
    const command = "node -e \"console.error('generic failure, no file mentioned'); process.exit(1)\"";
    workspace = createWorkspace('fixture-feature', 'F001-T01', command);

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asQualityGateAccess(orchestrator);
    const task = access.loadTask('F001-T01');
    const results = access.runQualityGates(task);

    expect(results[0].status).toBe('failed');
  });

  test('leaves a passing gate as passed', () => {
    const command = "node -e \"process.exit(0)\"";
    workspace = createWorkspace('fixture-feature', 'F001-T01', command);

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asQualityGateAccess(orchestrator);
    const task = access.loadTask('F001-T01');
    const results = access.runQualityGates(task);

    expect(results[0].status).toBe('passed');
  });
});

describe('updateFeatureStateAfterImplementation() quality_failed evidence', () => {
  test('persists the concrete failed-gate evidence in Blocked By, not just a bare hint', () => {
    // Regression test: this transition used to leave `Blocked By` empty on a quality-gate
    // failure -- unlike every other blocked transition (implementation_failed, review_failed,
    // blocked), which all persist a full blocker profile. A later diagnose_autocorrect run then
    // had nothing concrete to go on, and filed a vague, unfalsifiable "systemic" fix instead of a
    // bounded one (observed live: fix 004-orchestration-quality-failure-attribution-and-recovery-
    // state-transition-defect, whose own evidence was "lacks concrete failed-gate evidence").
    // References src/allowed.ts (in this task's own allowed_paths) so runQualityGates() cannot
    // waive it as unrelated -- this must genuinely reach `failed`, the case that used to skip
    // recording any blocker evidence at all.
    const command = "node -e \"console.error('FAIL src/allowed.ts:1:1 real assertion failure'); process.exit(1)\"";
    workspace = createWorkspace('fixture-feature', 'F001-T01', command);
    writeFileSync(join(workspace.root, 'compassrose', 'features', 'fixture-feature', 'state.md'), FEATURE_STATE_SEED, 'utf8');

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asQualityGateAccess(orchestrator);
    const owner = access.resolveWorkItemContext('fixture-feature');
    const task = access.loadTask('F001-T01');
    const results = access.runQualityGates(task);
    expect(results[0].status).toBe('failed');

    const updated = access.updateFeatureStateAfterImplementation(owner.statePath, 'F001-T01', 'quality_failed', 'failed', results);

    expect(updated).toContain('real assertion failure');
    // Was previously asserting the double-bulleted "- - kind: ..." this write path produced --
    // a real bug (see updateFeatureStateAfterImplementation's quality_failed branch), not the
    // intended format. buildBlockedByLines() already returns "- key: value" bullets.
    expect(updated).toMatch(/## Blocked By\n\n- kind: \S/);
    expect(updated).not.toMatch(/## Blocked By\n\n- None/);
  });
});
