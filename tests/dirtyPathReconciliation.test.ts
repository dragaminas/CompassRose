import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { copyContractsIntoWorkspace, createTempWorkspace, readFixtureConfigMarkdown, type TempWorkspace } from './testUtils.js';

// A minimal but section-complete PROJECT_STATE.md: updateProjectStateAfterStateCorrection()
// requires 'Pending', 'Last Approved Change', 'Next Planning Hint', and 'Current Reality' to
// already exist (replaceSection/upsertBulletInSection throw on a missing heading), and
// setOrInsertSection('Active Feature', ...) falls back to inserting after '## Status'.
const PROJECT_STATE_SEED = `# CompassRose Project State

## Status

active

## Active Feature

\`none\`

## Current Reality

- Fixture workspace for dirty-path reconciliation tests.

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

quality_failed

## Source Request

\`request.md\`

## Operational Status

- formalization: complete
- active_task: ${activeTask}
- active_correction_task: none
- last_implementation_result: passed
- last_quality_gate_result: failed
- last_review_result: not_run

## Current Reality

Fixture state for testing correctState()'s worktree reconciliation.

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
}

// A minimal real task document for the "previous" (now-superseded) task, so
// reconcileDirtyPathsForNewScope() can load its declared allowed_paths -- the ONLY paths it will
// ever consider discarding, regardless of what else is dirty in the worktree.
function previousTaskDoc(taskId: string, featureId: string, allowed: readonly string[]): string {
  return `# Task: Fixture previous task

## Task ID
\`${taskId}\`

## Parent Feature
\`${featureId}\`

## Goal
Fixture previous task whose attempt is being superseded.

## Scope
Allowed:
${allowed.map((path) => `- \`${path}\``).join('\n')}

Forbidden:
- all other paths
`;
}

function createOrchestratorWorkspace(
  featureId: string,
  options: { previousTaskAllowedPaths?: readonly string[] } = {},
): TempWorkspace {
  const previousTaskAllowedPaths = options.previousTaskAllowedPaths ?? ['src/'];
  const workspace = createTempWorkspace({
    files: {
      'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
      'compassrose/PROJECT_STATE.md': PROJECT_STATE_SEED,
      [`compassrose/features/${featureId}/state.md`]: featureStateSeed('FIX-T1'),
      [`compassrose/features/${featureId}/tasks/001-fixture-previous-task.md`]: previousTaskDoc('FIX-T1', featureId, previousTaskAllowedPaths),
    },
  });
  copyContractsIntoWorkspace(workspace.root);

  execFileSync('git', ['init', '--quiet'], { cwd: workspace.root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspace.root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspace.root });
  execFileSync('git', ['add', '-A'], { cwd: workspace.root });
  execFileSync('git', ['commit', '--quiet', '-m', 'initial commit'], { cwd: workspace.root });

  return workspace;
}

interface ReconciliationAccess {
  reconcileDirtyPathsForNewScope(featureId: string, previousTaskId: string | null, newAllowedPaths: readonly string[]): void;
  correctState(featureId: string, reason: string): void;
}

function asReconciliationAccess(orchestrator: CompassRoseOrchestrator): ReconciliationAccess {
  return orchestrator as unknown as ReconciliationAccess;
}

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
});

describe('reconcileDirtyPathsForNewScope', () => {
  test('discards a dirty path that was within the previous task scope but outside the new scope', () => {
    workspace = createOrchestratorWorkspace('fixture-feature', { previousTaskAllowedPaths: ['src/'] });
    mkdirSync(join(workspace.root, 'src'), { recursive: true });
    writeFileSync(join(workspace.root, 'src', 'orphaned.ts'), 'export const orphaned = true;\n', 'utf8');
    writeFileSync(join(workspace.root, 'src', 'kept.ts'), 'export const kept = true;\n', 'utf8');

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    asReconciliationAccess(orchestrator).reconcileDirtyPathsForNewScope('fixture-feature', 'FIX-T1', ['src/kept.ts']);

    expect(existsSync(join(workspace.root, 'src', 'orphaned.ts'))).toBe(false);
    expect(existsSync(join(workspace.root, 'src', 'kept.ts'))).toBe(true);
  });

  test('never discards a dirty path outside the previous task scope, even when it is also outside the new scope', () => {
    // Regression guard: an earlier version of this method discarded any dirty path not covered by
    // the *new* scope, with no regard for whether the old task ever touched it -- which silently
    // wiped an unrelated config edit and even this repository's own gitClient.ts in a real e2e
    // run. The previous task here only ever declared 'src/orchestrator/', so an unrelated dirty
    // edit to compassrose/CONFIG.md must survive untouched.
    workspace = createOrchestratorWorkspace('fixture-feature', { previousTaskAllowedPaths: ['src/orchestrator/'] });
    writeFileSync(join(workspace.root, 'compassrose/CONFIG.md'), `${readFixtureConfigMarkdown()}\n# unrelated edit\n`, 'utf8');

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    asReconciliationAccess(orchestrator).reconcileDirtyPathsForNewScope('fixture-feature', 'FIX-T1', ['src/orchestrator/other.ts']);

    expect(readFileSync(join(workspace.root, 'compassrose/CONFIG.md'), 'utf8')).toContain('# unrelated edit');
  });

  test('is a no-op when previousTaskId is "none"', () => {
    workspace = createOrchestratorWorkspace('fixture-feature');
    mkdirSync(join(workspace.root, 'src'), { recursive: true });
    writeFileSync(join(workspace.root, 'src', 'orphaned.ts'), 'export const orphaned = true;\n', 'utf8');

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    asReconciliationAccess(orchestrator).reconcileDirtyPathsForNewScope('fixture-feature', 'none', ['src/kept.ts']);

    expect(existsSync(join(workspace.root, 'src', 'orphaned.ts'))).toBe(true);
  });

  test('is a no-op when previousTaskId cannot be loaded', () => {
    workspace = createOrchestratorWorkspace('fixture-feature');
    mkdirSync(join(workspace.root, 'src'), { recursive: true });
    writeFileSync(join(workspace.root, 'src', 'orphaned.ts'), 'export const orphaned = true;\n', 'utf8');

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    asReconciliationAccess(orchestrator).reconcileDirtyPathsForNewScope('fixture-feature', 'FIX-T999-DOES-NOT-EXIST', ['src/kept.ts']);

    expect(existsSync(join(workspace.root, 'src', 'orphaned.ts'))).toBe(true);
  });

  test('is a no-op when the worktree is already clean', () => {
    workspace = createOrchestratorWorkspace('fixture-feature');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });

    expect(() => asReconciliationAccess(orchestrator).reconcileDirtyPathsForNewScope('fixture-feature', 'FIX-T1', [])).not.toThrow();
  });
});

describe('correctState() worktree reconciliation', () => {
  test('discards a dirty file left by the superseded active task before writing the correction', () => {
    workspace = createOrchestratorWorkspace('fixture-feature', { previousTaskAllowedPaths: ['src/'] });
    mkdirSync(join(workspace.root, 'src', 'orchestrator'), { recursive: true });
    // Simulates FIX-T1's own leftover dirty diff: state-correction's own scope is always just the
    // two state doc paths, so this source file -- previously in FIX-T1's own scope -- is now
    // outside the correction's narrower scope.
    writeFileSync(join(workspace.root, 'src', 'orchestrator', 'leftover.ts'), 'export const leftover = true;\n', 'utf8');

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    asReconciliationAccess(orchestrator).correctState('fixture-feature', 'test-driven state repair');

    expect(existsSync(join(workspace.root, 'src', 'orchestrator', 'leftover.ts'))).toBe(false);

    const featureStateMarkdown = readFileSync(join(workspace.root, 'compassrose/features/fixture-feature/state.md'), 'utf8');
    expect(featureStateMarkdown).toContain('State correction artifact `FIX-T1-C1` was applied');
    expect(existsSync(join(workspace.root, 'compassrose/features/fixture-feature/tasks'))).toBe(true);
  });

  test('leaves a dirty file alone when it was never in the superseded active task scope', () => {
    workspace = createOrchestratorWorkspace('fixture-feature', { previousTaskAllowedPaths: ['src/orchestrator/'] });
    writeFileSync(join(workspace.root, 'compassrose/CONFIG.md'), `${readFixtureConfigMarkdown()}\n# unrelated edit\n`, 'utf8');

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    asReconciliationAccess(orchestrator).correctState('fixture-feature', 'test-driven state repair');

    expect(readFileSync(join(workspace.root, 'compassrose/CONFIG.md'), 'utf8')).toContain('# unrelated edit');
  });
});
