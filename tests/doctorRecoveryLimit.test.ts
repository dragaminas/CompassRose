import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ParsedTaskDocument, DoctorRecoveryTaskMetadata } from '../src/contracts/task/taskContracts.js';
import type { RestorationTarget } from '../src/contracts/task/taskContracts.js';
import type { WorkItemContext } from '../src/contracts/runtime/protoRuntime.js';
import { CompassRoseOrchestrator, DoctorRecoveryLimitReachedError } from '../src/orchestrator/orchestrator.js';
import { copyContractsIntoWorkspace, createTempWorkspace, readFixtureConfigMarkdown, type TempWorkspace } from './testUtils.js';

// A codex mock that always fails fast (exit 1) -- used only to prove the limit check runs
// BEFORE any planner call is even attempted, without ever invoking a real agent (which could
// hang, prompt for auth, or cost real API usage if the real `codex` binary happened to be on
// PATH in whatever environment runs this suite).
const FAILING_CODEX_MOCK = `#!/usr/bin/env node
process.exit(1);
`;

function writeFailingCodexMock(root: string): string {
  const path = join(root, 'codex-mock-fail.cjs');
  writeFileSync(path, FAILING_CODEX_MOCK, 'utf8');
  chmodSync(path, 0o755);
  return path;
}

const PROJECT_STATE_SEED = `# CompassRose Project State

## Status

active

## Active Feature

\`none\`

## Current Reality

- Fixture workspace for doctor-recovery limit tests.

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

function featureStateSeed(lifecycleState: string, activeTask: string, doctorRecoveryAttempts: number): string {
  return `# State: Fixture Feature

## Lifecycle State

${lifecycleState}

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
- doctor_recovery_attempts: ${doctorRecoveryAttempts}

## Current Reality

Fixture state for testing the doctor-recovery iteration limit.

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
Fixture task for doctor-recovery limit tests.

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

function createWorkspace(featureId: string, taskId: string, lifecycleState: string, doctorRecoveryAttempts: number): TempWorkspace {
  const workspace = createTempWorkspace({
    files: {
      'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown(),
      'docs/compassrose/PROJECT_STATE.md': PROJECT_STATE_SEED,
      [`docs/features/${featureId}/feature.md`]: `# Feature: Fixture Feature\n\nFixture feature document.\n`,
      [`docs/features/${featureId}/architecture.md`]: `# Architecture: Fixture Feature\n\nFixture architecture document.\n`,
      [`docs/features/${featureId}/state.md`]: featureStateSeed(lifecycleState, taskId, doctorRecoveryAttempts),
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

interface DoctorRecoveryLimitAccess {
  loadTask(taskId: string): ParsedTaskDocument;
  resolveWorkItemContext(featureId: string): WorkItemContext;
  readDoctorRecoveryAttempts(statePath: string): number;
  planDoctorRecoveryTask(featureId: string, reason: string): void;
  updateFeatureStateForDoctorRecovery(
    featureStatePath: string,
    taskId: string,
    restorationTarget: RestorationTarget,
    doctorRecoveryAttempts: number,
  ): string;
  updateFeatureStateAfterDoctorRecovery(
    featureStatePath: string,
    task: ParsedTaskDocument,
    doctorRecovery: DoctorRecoveryTaskMetadata,
  ): string;
}

function asAccess(orchestrator: CompassRoseOrchestrator): DoctorRecoveryLimitAccess {
  return orchestrator as unknown as DoctorRecoveryLimitAccess;
}

const RESTORATION_TARGET: RestorationTarget = {
  lifecycle_state: 'implementation_running',
  active_task: 'F001-T01',
  active_correction_task: 'none',
  active_unblock_task: 'none',
};

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
  vi.unstubAllEnvs();
});

describe('doctor-recovery iteration limit', () => {
  test('readDoctorRecoveryAttempts defaults to 0 when the field is absent or unparsable', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01', 'quality_failed', 0);
    const statePath = join(workspace.root, 'docs', 'features', 'fixture-feature', 'state.md');
    writeFileSync(statePath, readFileSync(statePath, 'utf8').replace('- doctor_recovery_attempts: 0\n', ''), 'utf8');

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    expect(asAccess(orchestrator).readDoctorRecoveryAttempts(statePath)).toBe(0);
  });

  test('readDoctorRecoveryAttempts reads back a previously persisted count', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01', 'quality_failed', 2);
    const statePath = join(workspace.root, 'docs', 'features', 'fixture-feature', 'state.md');

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    expect(asAccess(orchestrator).readDoctorRecoveryAttempts(statePath)).toBe(2);
  });

  test('planDoctorRecoveryTask refuses to plan another attempt at the configured limit, before spending a planner call', () => {
    // The canonical CONFIG.md fixture sets limits.max_recovery_iterations to 3.
    workspace = createWorkspace('fixture-feature', 'F001-T01', 'quality_failed', 3);
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    expect(() => access.planDoctorRecoveryTask('fixture-feature', 'quality gates failed again')).toThrow(
      DoctorRecoveryLimitReachedError,
    );
  });

  test('planDoctorRecoveryTask does not throw the limit error below the configured limit', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01', 'quality_failed', 2);
    // Below the limit, the function proceeds to the planner call -- point a fast-failing mock at
    // it (rather than leaving `codex` on PATH unmocked) so this fails deterministically and
    // immediately for an unrelated reason instead of ever reaching a real agent.
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', writeFailingCodexMock(workspace.root));
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    let caught: unknown;
    try {
      access.planDoctorRecoveryTask('fixture-feature', 'quality gates failed');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect(caught).not.toBeInstanceOf(DoctorRecoveryLimitReachedError);
  });

  test('updateFeatureStateForDoctorRecovery persists the incremented attempt count', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01', 'quality_failed', 1);
    const statePath = join(workspace.root, 'docs', 'features', 'fixture-feature', 'state.md');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    const updated = access.updateFeatureStateForDoctorRecovery(statePath, 'F001-T01-DOCTOR-RECOVERY-R2', RESTORATION_TARGET, 2);

    expect(updated).toContain('- doctor_recovery_attempts: 2');
  });

  test('updateFeatureStateAfterDoctorRecovery preserves the attempt count instead of resetting it', () => {
    // Regression test: this used to unconditionally reset doctor_recovery_attempts to 0 whenever
    // a doctor recovery task's own narrow re-entry gates passed -- but passing those gates only
    // proves the state-document rewrite is internally consistent, not that the underlying blocker
    // that triggered diagnose_autocorrect was actually resolved. Live symptom (feature
    // 003-doctor-command, 2026-07-23): a recurring quality-gate failure cycled
    // quality_failed -> doctor recovery -> implementation_running -> quality_failed forever,
    // because planDoctorRecoveryTask always read the count back as 0 and max_recovery_iterations
    // could never trip. The count must now only reset once quality gates genuinely pass (see
    // qualityGateWaiver.test.ts's "resets doctor_recovery_attempts once quality gates genuinely
    // pass").
    workspace = createWorkspace('fixture-feature', 'F001-T01', 'unblock_pending', 2);
    const statePath = join(workspace.root, 'docs', 'features', 'fixture-feature', 'state.md');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const task = access.loadTask('F001-T01');

    const doctorRecovery: DoctorRecoveryTaskMetadata = {
      blocker: {
        kind: 'review_failure',
        signature: 'fixture-signature',
        evidence: ['fixture evidence'],
        recoverability: 'agent',
        observed_state: 'fixture observed state',
      },
      restoration_target: RESTORATION_TARGET,
      executor_role: 'doctor',
      review_policy: 'no_review_loop',
    };

    const updated = access.updateFeatureStateAfterDoctorRecovery(statePath, task, doctorRecovery);

    expect(updated).toContain('- doctor_recovery_attempts: 2');
  });

  test('a recurring same-root-cause quality failure trips the recovery limit instead of looping forever', () => {
    // End-to-end reproduction of the live bug: three consecutive quality_failed -> doctor-recovery
    // cycles for the same unresolved blocker must exhaust the budget on the fourth, instead of
    // planDoctorRecoveryTask reading the count back as 0 every time.
    workspace = createWorkspace('fixture-feature', 'F001-T01', 'quality_failed', 0);
    const statePath = join(workspace.root, 'docs', 'features', 'fixture-feature', 'state.md');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const task = access.loadTask('F001-T01');
    const doctorRecovery: DoctorRecoveryTaskMetadata = {
      blocker: {
        kind: 'review_failure',
        signature: 'fixture-signature',
        evidence: ['fixture evidence'],
        recoverability: 'agent',
        observed_state: 'fixture observed state',
      },
      restoration_target: RESTORATION_TARGET,
      executor_role: 'doctor',
      review_policy: 'no_review_loop',
    };

    // The canonical CONFIG.md fixture sets limits.max_recovery_iterations to 3. Cycles 1..3 apply
    // a doctor recovery whose own gates pass, restoring implementation_running -- but the quality
    // gate then fails again for the same unresolved reason each time.
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      const priorAttempts = access.readDoctorRecoveryAttempts(statePath);
      const planned = access.updateFeatureStateForDoctorRecovery(statePath, `F001-T01-DOCTOR-RECOVERY-R${cycle}`, RESTORATION_TARGET, priorAttempts + 1);
      writeFileSync(statePath, planned, 'utf8');

      const applied = access.updateFeatureStateAfterDoctorRecovery(statePath, task, doctorRecovery);
      writeFileSync(statePath, applied, 'utf8');
      expect(access.readDoctorRecoveryAttempts(statePath)).toBe(cycle);
    }

    expect(() => access.planDoctorRecoveryTask('fixture-feature', 'quality gates failed again, same root cause')).toThrow(
      DoctorRecoveryLimitReachedError,
    );
  });
});
