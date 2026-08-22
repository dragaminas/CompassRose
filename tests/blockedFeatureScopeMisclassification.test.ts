import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { StepExecutionResult } from '../src/contracts/runtime/protoRuntime.js';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { copyContractsIntoWorkspace, createTempWorkspace, readFixtureConfigMarkdown, type TempWorkspace } from './testUtils.js';

// Covers fix 001-blocked-feature-scope-misclassification: the sibling-feature-scope and
// exhausted-task-request blocks must record an explicitly supplied blocker kind and a hint
// naming the correct recovery action, instead of letting classifyBlockerKind reconstruct
// (and, in these two cases, misconstruct) them from the reason text.

const PROJECT_STATE_SEED = `# CompassRose Project State

## Status

active

## Active Feature

\`none\`

## Current Reality

- Fixture workspace for fix 001 regression tests.

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

function featureStateSeed(lifecycleState: string): string {
  return `# State: Fixture Feature

## Lifecycle State

${lifecycleState}

## Source Request

\`request.md\`

## Operational Status

- formalization: complete
- active_task: none
- active_correction_task: none
- last_implementation_result: not_run
- last_quality_gate_result: unknown
- last_review_result: not_run

## Current Reality

Fixture state for fix 001 regression tests.

## Implemented Deliverables

- None yet.

## Remaining Deliverables

- None yet.

## Outline Progress

- Fixture: not started

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

function createWorkspace(featureId: string, siblingFeatureId?: string): TempWorkspace {
  const files: Record<string, string> = {
    'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
    'compassrose/PROJECT_STATE.md': PROJECT_STATE_SEED,
    [`compassrose/features/${featureId}/feature.md`]: `# Feature: Fixture Feature\n\nFixture feature document.\n`,
    [`compassrose/features/${featureId}/architecture.md`]: `# Architecture: Fixture Feature\n\nFixture architecture document.\n`,
    [`compassrose/features/${featureId}/state.md`]: featureStateSeed('task_planning_pending'),
  };
  if (siblingFeatureId) {
    files[`compassrose/features/${siblingFeatureId}/feature.md`] = `# Feature: Sibling Feature\n\nSibling feature document.\n`;
    files[`compassrose/features/${siblingFeatureId}/architecture.md`] = `# Architecture: Sibling Feature\n\nSibling architecture document.\n`;
    files[`compassrose/features/${siblingFeatureId}/state.md`] = featureStateSeed('request_pending');
  }

  const workspace = createTempWorkspace({ files });
  copyContractsIntoWorkspace(workspace.root);
  mkdirSync(join(workspace.root, 'src'), { recursive: true });

  execFileSync('git', ['init', '--quiet'], { cwd: workspace.root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspace.root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspace.root });
  execFileSync('git', ['add', '-A'], { cwd: workspace.root });
  execFileSync('git', ['commit', '--quiet', '-m', 'initial commit'], { cwd: workspace.root });

  return workspace;
}

interface PlannedTaskFixture {
  readonly title: string;
  readonly scope_justification?: { readonly belongs_to_other_feature: string | null };
}

interface Access {
  blockIfBelongsToOtherFeature(featureId: string, task: PlannedTaskFixture): StepExecutionResult | null;
  planTask(featureId: string): StepExecutionResult;
}

function asAccess(orchestrator: CompassRoseOrchestrator): Access {
  return orchestrator as unknown as Access;
}

function featureStatePath(workspace: TempWorkspace, featureId: string): string {
  return join(workspace.root, 'compassrose', 'features', featureId, 'state.md');
}

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
});

describe('fix 001: blocked-feature scope misclassification', () => {
  test('a sibling-feature scope block records task_interface_gap and names the sibling feature in its hint, not a generic doctor-recovery hint', () => {
    workspace = createWorkspace('fixture-feature', 'sibling-feature');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    const result = access.blockIfBelongsToOtherFeature('fixture-feature', {
      title: 'Some task that actually belongs elsewhere',
      scope_justification: { belongs_to_other_feature: 'sibling-feature' },
    });

    expect(result?.exitCode).toBe(2);

    const state = readFileSync(featureStatePath(workspace, 'fixture-feature'), 'utf8');
    expect(state).toContain('- kind: task_interface_gap');
    expect(state).toMatch(/Next Planning Hint\s*\n\s*\n.*Formalize or advance.*sibling-feature/s);
    expect(state).not.toContain('Plan a doctor recovery task for blocker');
  });

  test('an exhausted task-request block records task_interface_gap and directs the planner to declare more task requests, not unknown with a generic hint', () => {
    workspace = createWorkspace('fixture-feature');
    // No docs/task-requests/fixture-feature.json and no existing task anchors under
    // tasksDirectory: backfillTaskRequests() reconstructs an empty task_requests array (the
    // feature's Implementation Outline is empty), so selectNextTaskRequest() finds nothing and
    // planTask() takes the exhausted-task-request branch without needing a real codex call.
    mkdirSync(join(workspace.root, 'compassrose', 'features', 'fixture-feature', 'tasks'), { recursive: true });
    mkdirSync(join(workspace.root, '.git', 'proto-compassrose', 'task-requests'), { recursive: true });
    writeFileSync(join(workspace.root, '.git', 'proto-compassrose', 'task-requests', 'fixture-feature.json'), '[]\n', {
      flag: 'wx',
    });

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    const result = access.planTask('fixture-feature');

    expect(result.exitCode).toBe(2);

    const state = readFileSync(featureStatePath(workspace, 'fixture-feature'), 'utf8');
    expect(state).toContain('- kind: task_interface_gap');
    expect(state).toMatch(/Next Planning Hint\s*\n\s*\n.*Formalize additional task requests/s);
    expect(state).not.toContain('- kind: unknown');
    expect(state).not.toContain('Plan a doctor recovery task for blocker');
  });

  test('fallback classification is unchanged for a call site with no explicit blocker metadata', () => {
    workspace = createWorkspace('fixture-feature');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = orchestrator as unknown as { recordBlockedFeature(featureId: string, reason: string): { kind: string } };

    const blocker = access.recordBlockedFeature('fixture-feature', 'The environment is unavailable and needs a human to restore it.');

    // Same result classifyBlockerKind would have produced directly -- proves the fallback path
    // (no explicit metadata supplied) is untouched by this fix.
    expect(blocker.kind).toBe('environment');
  });
});
