import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ParsedTaskDocument, DoctorRecoveryTaskMetadata } from '../src/contracts/task/taskContracts.js';
import type { RestorationTarget } from '../src/contracts/task/taskContracts.js';
import type { WorkItemContext } from '../src/contracts/runtime/protoRuntime.js';
import { CompassRoseOrchestrator, DoctorRecoveryLifetimeLimitReachedError, DoctorRecoveryLimitReachedError } from '../src/orchestrator/orchestrator.js';
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

function featureStateSeed(
  lifecycleState: string,
  activeTask: string,
  doctorRecoveryAttempts: number,
  doctorRecoveryLifetimeCount = 0,
): string {
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
- doctor_recovery_lifetime_count: ${doctorRecoveryLifetimeCount}

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

function createWorkspace(
  featureId: string,
  taskId: string,
  lifecycleState: string,
  doctorRecoveryAttempts: number,
  doctorRecoveryLifetimeCount = 0,
): TempWorkspace {
  const workspace = createTempWorkspace({
    files: {
      'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
      'compassrose/PROJECT_STATE.md': PROJECT_STATE_SEED,
      [`compassrose/features/${featureId}/feature.md`]: `# Feature: Fixture Feature\n\nFixture feature document.\n`,
      [`compassrose/features/${featureId}/architecture.md`]: `# Architecture: Fixture Feature\n\nFixture architecture document.\n`,
      [`compassrose/features/${featureId}/state.md`]: featureStateSeed(lifecycleState, taskId, doctorRecoveryAttempts, doctorRecoveryLifetimeCount),
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

interface DoctorRecoveryLimitAccess {
  loadTask(taskId: string): ParsedTaskDocument;
  resolveWorkItemContext(featureId: string): WorkItemContext;
  readDoctorRecoveryAttempts(statePath: string): number;
  readDoctorRecoveryLifetimeCount(statePath: string): number;
  planDoctorRecoveryTask(featureId: string, reason: string): void;
  updateFeatureStateForDoctorRecovery(
    featureStatePath: string,
    taskId: string,
    restorationTarget: RestorationTarget,
    doctorRecoveryAttempts: number,
    doctorRecoveryLifetimeCount: number,
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
    const statePath = join(workspace.root, 'compassrose', 'features', 'fixture-feature', 'state.md');
    writeFileSync(statePath, readFileSync(statePath, 'utf8').replace('- doctor_recovery_attempts: 0\n', ''), 'utf8');

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    expect(asAccess(orchestrator).readDoctorRecoveryAttempts(statePath)).toBe(0);
  });

  test('readDoctorRecoveryAttempts reads back a previously persisted count', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01', 'quality_failed', 2);
    const statePath = join(workspace.root, 'compassrose', 'features', 'fixture-feature', 'state.md');

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
    const statePath = join(workspace.root, 'compassrose', 'features', 'fixture-feature', 'state.md');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    const updated = access.updateFeatureStateForDoctorRecovery(statePath, 'F001-T01-DOCTOR-RECOVERY-R2', RESTORATION_TARGET, 2, 5);

    expect(updated).toContain('- doctor_recovery_attempts: 2');
    expect(updated).toContain('- doctor_recovery_lifetime_count: 5');
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
    const statePath = join(workspace.root, 'compassrose', 'features', 'fixture-feature', 'state.md');
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
    const statePath = join(workspace.root, 'compassrose', 'features', 'fixture-feature', 'state.md');
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
      const priorLifetimeCount = access.readDoctorRecoveryLifetimeCount(statePath);
      const planned = access.updateFeatureStateForDoctorRecovery(statePath, `F001-T01-DOCTOR-RECOVERY-R${cycle}`, RESTORATION_TARGET, priorAttempts + 1, priorLifetimeCount + 1);
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

describe('doctor-recovery lifetime limit (ADR-0040)', () => {
  test('readDoctorRecoveryLifetimeCount defaults to 0 when the field is absent or unparsable', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01', 'quality_failed', 0);
    const statePath = join(workspace.root, 'compassrose', 'features', 'fixture-feature', 'state.md');
    writeFileSync(statePath, readFileSync(statePath, 'utf8').replace('- doctor_recovery_lifetime_count: 0\n', ''), 'utf8');

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    expect(asAccess(orchestrator).readDoctorRecoveryLifetimeCount(statePath)).toBe(0);
  });

  test('planDoctorRecoveryTask refuses to plan another attempt at the configured lifetime limit, even with a fresh per-signature counter', () => {
    // The canonical CONFIG.md fixture sets limits.max_lifetime_recovery_cycles to 10. Seed the
    // per-signature counter at 0 (as if the feature just made forward progress and reset it) but
    // the lifetime counter already at 10 -- proving the two are independent, and that a fresh
    // per-signature counter alone is not enough to keep planning recoveries forever.
    workspace = createWorkspace('fixture-feature', 'F001-T01', 'quality_failed', 0, 10);
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    expect(() => access.planDoctorRecoveryTask('fixture-feature', 'quality gates failed again')).toThrow(
      DoctorRecoveryLifetimeLimitReachedError,
    );
  });

  test('planDoctorRecoveryTask does not throw the lifetime error below the configured limit', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01', 'quality_failed', 0, 9);
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
    expect(caught).not.toBeInstanceOf(DoctorRecoveryLifetimeLimitReachedError);
    expect(caught).not.toBeInstanceOf(DoctorRecoveryLimitReachedError);
  });

  test('the lifetime counter keeps climbing across multiple genuine-progress resets of the per-signature counter', () => {
    // The core value of ADR-0040: a feature that resolves one blocker (resetting
    // doctor_recovery_attempts via review_pending), then hits a NEW, different blocker requiring
    // another recovery, then resolves that one too, and so on -- never once threatening the
    // per-signature limit -- must still eventually trip the lifetime limit.
    workspace = createWorkspace('fixture-feature', 'F001-T01', 'quality_failed', 0, 0);
    const statePath = join(workspace.root, 'compassrose', 'features', 'fixture-feature', 'state.md');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator) as DoctorRecoveryLimitAccess & {
      updateFeatureStateAfterImplementation(
        featureStatePath: string,
        taskId: string,
        lifecycleState: 'review_pending' | 'quality_failed',
        qualityResult: 'passed' | 'failed',
      ): string;
    };
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

    // 10 cycles of "recover, then genuinely resolve" -- each resolve resets the per-signature
    // counter to 0 via review_pending, so it never comes close to its own limit of 3.
    for (let cycle = 1; cycle <= 10; cycle += 1) {
      const priorLifetimeCount = access.readDoctorRecoveryLifetimeCount(statePath);
      const planned = access.updateFeatureStateForDoctorRecovery(statePath, `F001-T01-DOCTOR-RECOVERY-R${cycle}`, RESTORATION_TARGET, 1, priorLifetimeCount + 1);
      writeFileSync(statePath, planned, 'utf8');

      const applied = access.updateFeatureStateAfterDoctorRecovery(statePath, task, doctorRecovery);
      writeFileSync(statePath, applied, 'utf8');

      const resolved = access.updateFeatureStateAfterImplementation(statePath, 'F001-T01', 'review_pending', 'passed');
      writeFileSync(statePath, resolved, 'utf8');

      expect(access.readDoctorRecoveryAttempts(statePath)).toBe(0);
      expect(access.readDoctorRecoveryLifetimeCount(statePath)).toBe(cycle);
    }

    // The canonical CONFIG.md fixture sets limits.max_lifetime_recovery_cycles to 10 -- the 11th
    // cycle must trip the lifetime limit even though the per-signature counter is freshly at 0.
    expect(() => access.planDoctorRecoveryTask('fixture-feature', 'a brand-new, different blocker')).toThrow(
      DoctorRecoveryLifetimeLimitReachedError,
    );
  });
});
