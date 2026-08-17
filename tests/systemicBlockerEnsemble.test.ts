import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { BlockerProfile } from '../src/contracts/task/taskContracts.js';
import type { DiagnosticAutocorrectionDecision } from '../src/contracts/runtime/diagnosticAutocorrection.js';
import type { WorkItemContext } from '../src/contracts/runtime/protoRuntime.js';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { copyContractsIntoWorkspace, createTempWorkspace, readFixtureConfigMarkdown, type TempWorkspace } from './testUtils.js';

// Covers consultDoctorOnSystemicBlocker()'s ensemble gate (see ADR-0038): the next_step choice
// between plan_doctor_recovery and file_blocking_fix is cross-checked by
// BLOCKER_KIND_ENSEMBLE_SIZE independent votes before either outcome is trusted.

const PROJECT_STATE_SEED = `# CompassRose Project State

## Status

active

## Active Feature

\`none\`

## Current Reality

- Fixture workspace for systemic-blocker ensemble tests.

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

function createWorkspace(featureId: string): TempWorkspace {
  const workspace = createTempWorkspace({
    files: {
      'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
      'compassrose/PROJECT_STATE.md': PROJECT_STATE_SEED,
      [`compassrose/features/${featureId}/feature.md`]: `# Feature: Fixture Feature\n\nFixture feature document.\n`,
      [`compassrose/features/${featureId}/architecture.md`]: `# Architecture: Fixture Feature\n\nFixture architecture document.\n`,
      [`compassrose/features/${featureId}/state.md`]: `# State: Fixture Feature\n\n## Lifecycle State\n\nblocked\n\n## Source Request\n\n\`request.md\`\n\n## Operational Status\n\n- formalization: complete\n- active_task: none\n- active_correction_task: none\n- active_unblock_task: none\n- last_implementation_result: not_run\n- last_quality_gate_result: unknown\n- last_review_result: not_run\n- last_unblock_result: not_run\n\n## Current Reality\n\nFixture state.\n\n## Implemented Deliverables\n\n- None yet.\n\n## Remaining Deliverables\n\n- None yet.\n\n## Outline Progress\n\n- Fixture: not started\n\n## Blocked By\n\n- None\n\n## Blocked From\n\n- lifecycle_state: none\n- active_task: none\n- active_correction_task: none\n- active_unblock_task: none\n\n## Last Approved Change\n\nNone\n\n## Known Gaps\n\n- None\n\n## Next Planning Hint\n\nNone\n`,
    },
  });
  copyContractsIntoWorkspace(workspace.root);
  mkdirSync(join(workspace.root, 'src'), { recursive: true });

  execFileSync('git', ['init', '--quiet'], { cwd: workspace.root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspace.root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspace.root });
  execFileSync('git', ['add', '-A'], { cwd: workspace.root });
  execFileSync('git', ['commit', '--quiet', '-m', 'initial commit'], { cwd: workspace.root });

  return workspace;
}

function fixtureBlocker(): BlockerProfile {
  return {
    kind: 'environment',
    signature: 'fixture-terminal-environment-blocker',
    recoverability: 'terminal',
    evidence: ['The environment is unavailable and the failure is terminal.'],
    observed_state: 'lifecycle=blocked',
  };
}

function fullDiagnosticPayload(nextStep: 'plan_doctor_recovery' | 'file_blocking_fix'): DiagnosticAutocorrectionDecision {
  return {
    feature_id: 'fixture-feature',
    diagnosis_summary: 'Detail call diagnosis.',
    blocker: fixtureBlocker(),
    next_step: nextStep,
    next_step_reason: 'Detail call reason.',
    interface_response: {
      mode: nextStep === 'file_blocking_fix' ? 'manual_review' : 'apply_in_doctor_recovery',
      summary: 'Detail call interface summary.',
      target_paths: [],
    },
    systemic_blocker: nextStep === 'file_blocking_fix'
      ? {
        title: 'Fixture systemic defect',
        evidence_summary: 'Fixture evidence summary.',
        scope_note: 'Excludes this feature\'s own remaining work.',
        severity: 'critical',
      }
      : null,
  };
}

// Returns each payload in `payloads` in order across successive codex invocations (cycling if
// exhausted), and records the number of calls made so a test can assert on it.
function writeSequentialMock(root: string, payloads: readonly unknown[]): { command: string; countPath: string } {
  const scriptPath = join(root, 'codex-mock-systemic-blocker.cjs');
  const counterPath = join(root, 'systemic-blocker-mock-counter.txt');
  writeFileSync(counterPath, '0', 'utf8');
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
const outputPath = outputIndex === -1 ? null : args[outputIndex + 1];
const payloads = ${JSON.stringify(payloads)};
const counterPath = ${JSON.stringify(counterPath)};
const index = Number(fs.readFileSync(counterPath, 'utf8'));
fs.writeFileSync(counterPath, String(index + 1), 'utf8');
const payload = payloads[index % payloads.length];
if (outputPath) {
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\\n', 'utf8');
}
process.exit(0);
`;
  writeFileSync(scriptPath, script, 'utf8');
  chmodSync(scriptPath, 0o755);
  return { command: scriptPath, countPath: counterPath };
}

interface Access {
  resolveWorkItemContext(featureId: string): WorkItemContext;
  consultDoctorOnSystemicBlocker(
    feature: WorkItemContext,
    blocker: BlockerProfile,
    reason: string,
    taskId: string | null,
  ): DiagnosticAutocorrectionDecision;
}

function asAccess(orchestrator: CompassRoseOrchestrator): Access {
  return orchestrator as unknown as Access;
}

let workspace: TempWorkspace | undefined;

afterEach(() => {
  vi.unstubAllEnvs();
  workspace?.dispose();
  workspace = undefined;
});

describe('consultDoctorOnSystemicBlocker ensemble gate (ADR-0038)', () => {
  test('constructs a plan_doctor_recovery decision deterministically when the ensemble unanimously agrees, with no detail call', () => {
    workspace = createWorkspace('fixture-feature');
    const mock = writeSequentialMock(workspace.root, [{ next_step: 'plan_doctor_recovery', rationale: 'vote' }]);
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', mock.command);

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const owner = access.resolveWorkItemContext('fixture-feature');

    const decision = access.consultDoctorOnSystemicBlocker(owner, fixtureBlocker(), 'fixture reason', null);

    expect(decision.next_step).toBe('plan_doctor_recovery');
    expect(decision.systemic_blocker).toBeNull();
    expect(decision.blocker).toEqual(fixtureBlocker());
    // Exactly 3 calls (the ensemble) -- no 4th detail call needed for plan_doctor_recovery.
    expect(Number(require('node:fs').readFileSync(mock.countPath, 'utf8'))).toBe(3);
  });

  test('runs the detail call and trusts it when the ensemble unanimously agrees on file_blocking_fix', () => {
    workspace = createWorkspace('fixture-feature');
    const mock = writeSequentialMock(workspace.root, [
      { next_step: 'file_blocking_fix', rationale: 'vote' },
      { next_step: 'file_blocking_fix', rationale: 'vote' },
      { next_step: 'file_blocking_fix', rationale: 'vote' },
      fullDiagnosticPayload('file_blocking_fix'),
    ]);
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', mock.command);

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const owner = access.resolveWorkItemContext('fixture-feature');

    const decision = access.consultDoctorOnSystemicBlocker(owner, fixtureBlocker(), 'fixture reason', null);

    expect(decision.next_step).toBe('file_blocking_fix');
    expect(decision.systemic_blocker?.title).toBe('Fixture systemic defect');
    expect(Number(require('node:fs').readFileSync(mock.countPath, 'utf8'))).toBe(4);
  });

  test('forces stop_with_diagnostic when the ensemble disagrees, without making a detail call', () => {
    workspace = createWorkspace('fixture-feature');
    const mock = writeSequentialMock(workspace.root, [
      { next_step: 'file_blocking_fix', rationale: 'vote' },
      { next_step: 'plan_doctor_recovery', rationale: 'vote' },
      { next_step: 'file_blocking_fix', rationale: 'vote' },
    ]);
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', mock.command);

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const owner = access.resolveWorkItemContext('fixture-feature');

    const decision = access.consultDoctorOnSystemicBlocker(owner, fixtureBlocker(), 'fixture reason', null);

    expect(decision.next_step).toBe('stop_with_diagnostic');
    expect(decision.blocker.recoverability).toBe('terminal');
    expect(decision.blocker.evidence.some((item) => item.includes('disagreed'))).toBe(true);
    // Disagreement must not spend a 4th call on a detail request.
    expect(Number(require('node:fs').readFileSync(mock.countPath, 'utf8'))).toBe(3);
  });

  test('forces stop_with_diagnostic when the detail call contradicts an agreed file_blocking_fix ensemble', () => {
    workspace = createWorkspace('fixture-feature');
    const mock = writeSequentialMock(workspace.root, [
      { next_step: 'file_blocking_fix', rationale: 'vote' },
      { next_step: 'file_blocking_fix', rationale: 'vote' },
      { next_step: 'file_blocking_fix', rationale: 'vote' },
      fullDiagnosticPayload('plan_doctor_recovery'),
    ]);
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', mock.command);

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const owner = access.resolveWorkItemContext('fixture-feature');

    const decision = access.consultDoctorOnSystemicBlocker(owner, fixtureBlocker(), 'fixture reason', null);

    expect(decision.next_step).toBe('stop_with_diagnostic');
    expect(decision.blocker.evidence.some((item) => item.includes('contradicted'))).toBe(true);
  });

  test('falls back to the single-call consultation when the ensemble gets a malformed vote', () => {
    workspace = createWorkspace('fixture-feature');
    // First call returns a vote outside the closed next_step enum -- the ensemble must recognize
    // this as untrustworthy and stop after one call (not retry or partially trust it), falling
    // back to exactly one single-call consultation, matching pre-ensemble behavior for that call.
    const mock = writeSequentialMock(workspace.root, [
      { next_step: 'not_a_real_value', rationale: 'malformed vote' },
      fullDiagnosticPayload('plan_doctor_recovery'),
    ]);
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', mock.command);

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const owner = access.resolveWorkItemContext('fixture-feature');

    const decision = access.consultDoctorOnSystemicBlocker(owner, fixtureBlocker(), 'fixture reason', null);

    expect(decision.next_step).toBe('plan_doctor_recovery');
    expect(decision.diagnosis_summary).toBe('Detail call diagnosis.');
    // Exactly 2 calls: the one malformed ensemble vote, then the single-call fallback.
    expect(Number(require('node:fs').readFileSync(mock.countPath, 'utf8'))).toBe(2);
  });
});
