import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { ParsedTaskDocument } from '../src/contracts/task/taskContracts.js';
import type { QualityGateResult } from '../src/contracts/runtime/attempts.js';
import type { FeatureInspection, FeatureRecord, StepExecutionResult, WorkItemContext } from '../src/contracts/runtime/protoRuntime.js';
import type { StepDecision } from '../src/contracts/runtime/stepDecision.js';
import type { DiagnosticAutocorrectionDecision, FixSeverity } from '../src/contracts/types.js';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { copyContractsIntoWorkspace, createTempWorkspace, readFixtureConfigMarkdown, type TempWorkspace } from './testUtils.js';

interface BlockingFixScaffold {
  readonly signature: string;
  readonly titleSubject: string;
  readonly severity: FixSeverity;
  readonly whatHappened: string;
  readonly evidenceLines: readonly string[];
  readonly outlineStep: string;
  readonly scopeExcludes: string;
  readonly problem: string;
  readonly acceptanceCriterion: string;
  readonly completionCriterion: string;
  readonly currentReality: string;
  readonly nextPlanningHint: string;
}

function baseDiagnosticDecision(overrides: Partial<DiagnosticAutocorrectionDecision> = {}): DiagnosticAutocorrectionDecision {
  return {
    feature_id: 'fixture-feature',
    diagnosis_summary: 'fixture diagnosis',
    blocker: { kind: 'unknown', signature: 'fixture-signature', recoverability: 'terminal', evidence: ['fixture evidence'] },
    next_step: 'stop_with_diagnostic',
    next_step_reason: 'fixture reason',
    interface_response: { mode: 'manual_review', summary: 'fixture summary', target_paths: [] },
    systemic_blocker: null,
    ...overrides,
  };
}

const PROJECT_STATE_SEED = `# CompassRose Project State

## Status

active

## Active Feature

\`none\`

## Current Reality

- Fixture workspace for blocking-fix workflow tests.

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

Fixture state for testing the blocking-fix workflow.

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
Fixture task for blocking-fix workflow tests.

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

function waivedResult(command: string, referencedPath: string): QualityGateResult {
  return {
    name: command,
    command,
    status: 'waived',
    output_summary:
      `Waived: this command already fails the same way on a clean checkout of HEAD, and its failure output `
      + `names no path within this task's allowed_paths or changed files -- referenced instead: ${referencedPath}.`,
  };
}

interface BlockingFixAccess {
  loadTask(taskId: string): ParsedTaskDocument;
  resolveWorkItemContext(featureId: string): WorkItemContext;
  blockOnUnrelatedFixFailure(owner: WorkItemContext, task: ParsedTaskDocument, qualityResults: readonly QualityGateResult[]): StepExecutionResult;
  tryWaiveUnrelatedGateFailure(task: ParsedTaskDocument, command: string, stdout: string, stderr: string): QualityGateResult | null;
  runShellCommand(command: string): { readonly status: number | null; readonly stdout: string; readonly stderr: string };
  listFeatures(): FeatureRecord[];
  inspectFeature(feature: FeatureRecord): FeatureInspection;
  determineNextStep(): StepDecision;
  ensureDiagnosticAutocorrectionDecision(
    feature: WorkItemContext,
    reason: string,
    decision: DiagnosticAutocorrectionDecision,
  ): DiagnosticAutocorrectionDecision;
  fileOrReuseBlockingFix(scaffold: BlockingFixScaffold): string;
}

function asAccess(orchestrator: CompassRoseOrchestrator): BlockingFixAccess {
  return orchestrator as unknown as BlockingFixAccess;
}

function listFixDirectories(root: string): string[] {
  const fixesRoot = join(root, 'docs', 'fixes');
  return existsSync(fixesRoot) ? readdirSync(fixesRoot) : [];
}

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
});

describe('blockOnUnrelatedFixFailure', () => {
  test('files a new high-severity fix and blocks the feature on it', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const owner = access.resolveWorkItemContext('fixture-feature');
    const task = access.loadTask('F001-T01');
    const command = "node -e \"console.error('FAIL tests/unrelated.test.ts:1:1'); process.exit(1)\"";

    const result = access.blockOnUnrelatedFixFailure(owner, task, [waivedResult(command, 'tests/unrelated.test.ts')]);

    expect(result.exitCode).toBe(2);
    expect(result.continueLoop).toBe(false);

    const fixDirectories = listFixDirectories(workspace.root);
    expect(fixDirectories).toHaveLength(1);
    const [fixId] = fixDirectories;

    const fixState = readFileSync(join(workspace.root, 'docs', 'fixes', fixId, 'state.md'), 'utf8');
    expect(fixState).toContain('task_planning_pending');
    expect(fixState).toMatch(/- severity: high/);
    expect(fixState).toMatch(/- owning_feature: none/);

    const requestMarkdown = readFileSync(join(workspace.root, 'docs', 'fixes', fixId, 'request.md'), 'utf8');
    expect(requestMarkdown).toContain('tests/unrelated.test.ts');
    expect(requestMarkdown).toMatch(/Signature: `[0-9a-f]{12}`/);
    expect(existsSync(join(workspace.root, 'docs', 'fixes', fixId, 'fix.md'))).toBe(true);

    const featureState = readFileSync(join(workspace.root, 'docs', 'features', 'fixture-feature', 'state.md'), 'utf8');
    expect(featureState.match(/## Lifecycle State\n\n(\S+)/)?.[1]).toBe('blocked');
    expect(featureState).toContain(`- blocked_on_fix: ${fixId}`);
  });

  test('discards the abandoned task\'s own dirty diff so future runs are not permanently blocked', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const owner = access.resolveWorkItemContext('fixture-feature');
    const task = access.loadTask('F001-T01');
    const command = "node -e \"console.error('FAIL tests/unrelated.test.ts:1:1'); process.exit(1)\"";

    // The task's own in-progress, uncommitted work within its allowed_paths (`src/allowed.ts`),
    // exactly like an implementer attempt's diff sitting in the tree when quality gates fail.
    writeFileSync(join(workspace.root, 'src', 'allowed.ts'), 'export const allowed = false;\n', 'utf8');

    access.blockOnUnrelatedFixFailure(owner, task, [waivedResult(command, 'tests/unrelated.test.ts')]);

    const statusAfter = execFileSync('git', ['status', '--porcelain'], { cwd: workspace.root, encoding: 'utf8' });
    expect(statusAfter).not.toContain('src/allowed.ts');
  });

  test('names the fix after the actually-referenced file, not the task\'s own changed file', () => {
    // Regression test: tryWaiveUnrelatedGateFailure()'s output_summary quotes the task's own
    // allowed_paths/changed files (for human context) before the "referenced instead:" list of
    // paths the failing command's own output actually named. blockOnUnrelatedFixFailure() used to
    // re-extract paths from that summary text, so it would pick up the task's own changed file
    // (src/allowed.ts, matched here since it has a .ts extension) as primaryPath instead of the
    // file genuinely responsible for the failure (tests/unrelated.test.ts) -- exactly what
    // happened live: a fix got titled "Pre-existing failure in `src/doctor/doctorDiagnostics.ts`"
    // (the task's own new file) instead of the real flaky test file.
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const owner = access.resolveWorkItemContext('fixture-feature');

    // Give the task its own uncommitted, in-scope, .ts-extensioned changed file so it appears in
    // the waiver's output_summary alongside the real out-of-scope failure.
    writeFileSync(join(workspace.root, 'src', 'allowed.ts'), 'export const allowed = 2;\n', 'utf8');
    const task = access.loadTask('F001-T01');

    const command = "node -e \"console.error('FAIL tests/unrelated.test.ts:1:1'); process.exit(1)\"";
    const { stdout, stderr } = access.runShellCommand(command);
    const waived = access.tryWaiveUnrelatedGateFailure(task, command, stdout, stderr);

    expect(waived).not.toBeNull();
    expect(waived?.status).toBe('waived');
    expect(waived?.referenced_paths).toEqual(['tests/unrelated.test.ts']);

    const result = access.blockOnUnrelatedFixFailure(owner, task, [waived as QualityGateResult]);
    expect(result.exitCode).toBe(2);

    const [fixId] = listFixDirectories(workspace.root);
    const fixMarkdown = readFileSync(join(workspace.root, 'docs', 'fixes', fixId, 'fix.md'), 'utf8');
    expect(fixMarkdown).toContain('tests/unrelated.test.ts');
    expect(fixMarkdown).not.toContain('Pre-existing failure in `src/allowed.ts`');
  });

  test('reuses the existing fix for the same signature instead of filing a duplicate', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const owner = access.resolveWorkItemContext('fixture-feature');
    const task = access.loadTask('F001-T01');
    const command = "node -e \"console.error('FAIL tests/unrelated.test.ts:1:1'); process.exit(1)\"";

    access.blockOnUnrelatedFixFailure(owner, task, [waivedResult(command, 'tests/unrelated.test.ts')]);
    const firstRunFixes = listFixDirectories(workspace.root);
    expect(firstRunFixes).toHaveLength(1);

    // A second, unrelated task hits the exact same command/path signature.
    access.blockOnUnrelatedFixFailure(owner, task, [waivedResult(command, 'tests/unrelated.test.ts')]);
    const secondRunFixes = listFixDirectories(workspace.root);

    expect(secondRunFixes).toHaveLength(1);
    expect(secondRunFixes).toEqual(firstRunFixes);
  });

  test('the scheduler moves on to the filed fix instead of re-diagnosing the blocked feature', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const owner = access.resolveWorkItemContext('fixture-feature');
    const task = access.loadTask('F001-T01');
    const command = "node -e \"console.error('FAIL tests/unrelated.test.ts:1:1'); process.exit(1)\"";

    access.blockOnUnrelatedFixFailure(owner, task, [waivedResult(command, 'tests/unrelated.test.ts')]);

    const decision = access.determineNextStep();

    expect(decision.feature_id).not.toBe('fixture-feature');
    expect(decision.kind).toBe('plan_fix_task');
  });

  test('resumes the feature deterministically once the blocking fix reaches completed', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const owner = access.resolveWorkItemContext('fixture-feature');
    const task = access.loadTask('F001-T01');
    const command = "node -e \"console.error('FAIL tests/unrelated.test.ts:1:1'); process.exit(1)\"";

    access.blockOnUnrelatedFixFailure(owner, task, [waivedResult(command, 'tests/unrelated.test.ts')]);
    const [fixId] = listFixDirectories(workspace.root);

    // Simulate the fix's own task chain having reached completed.
    const fixStatePath = join(workspace.root, 'docs', 'fixes', fixId, 'state.md');
    writeFileSync(fixStatePath, readFileSync(fixStatePath, 'utf8').replace('task_planning_pending', 'completed'), 'utf8');

    const feature = access.listFeatures().find((candidate) => candidate.id === 'fixture-feature');
    expect(feature).toBeDefined();
    const inspection = access.inspectFeature(feature as FeatureRecord);

    expect(inspection.kind).not.toBe('blocked_on_fix');
    expect(inspection.kind).toBe('implementation_running');
    expect(inspection.snapshot?.activeTask).toBe('F001-T01');

    const featureState = readFileSync(join(workspace.root, 'docs', 'features', 'fixture-feature', 'state.md'), 'utf8');
    expect(featureState).toContain('- blocked_on_fix: none');
    expect(featureState.match(/## Lifecycle State\n\n(\S+)/)?.[1]).toBe('implementation_running');
  });
});

describe('fileOrReuseBlockingFix (generalized scaffold, doctor-filed severity)', () => {
  test('files a critical-severity fix from the doctor-flavored scaffold', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    const fixId = access.fileOrReuseBlockingFix({
      signature: 'systemic-signature-1',
      titleSubject: 'Systemic defect in the framework',
      severity: 'critical',
      whatHappened: 'The framework itself is broken, unrelated to any bounded task.',
      evidenceLines: ['- The environment cannot recover without human intervention.'],
      outlineStep: 'Diagnose and repair the systemic defect.',
      scopeExcludes: 'Any work belonging to the feature that surfaced this defect.',
      problem: 'The framework itself is broken.',
      acceptanceCriterion: 'The systemic defect no longer reproduces.',
      completionCriterion: 'The defect is repaired and every blocked feature/fix can resume.',
      currentReality: 'The framework itself is broken.',
      nextPlanningHint: 'diagnose and repair the systemic defect.',
    });

    const fixState = readFileSync(join(workspace.root, 'docs', 'fixes', fixId, 'state.md'), 'utf8');
    expect(fixState).toMatch(/- severity: critical/);
    expect(existsSync(join(workspace.root, 'docs', 'fixes', fixId, 'fix.md'))).toBe(true);

    // Reusing the same signature must not spawn a duplicate fix.
    const reusedFixId = access.fileOrReuseBlockingFix({
      signature: 'systemic-signature-1',
      titleSubject: 'Systemic defect in the framework (second sighting)',
      severity: 'critical',
      whatHappened: 'Same defect observed again.',
      evidenceLines: ['- Same evidence.'],
      outlineStep: 'Diagnose and repair the systemic defect.',
      scopeExcludes: 'Nothing new.',
      problem: 'Same problem.',
      acceptanceCriterion: 'Same criterion.',
      completionCriterion: 'Same completion criterion.',
      currentReality: 'Same reality.',
      nextPlanningHint: 'diagnose and repair the systemic defect.',
    });

    expect(reusedFixId).toBe(fixId);
    expect(listFixDirectories(workspace.root)).toHaveLength(1);
  });
});

describe('ensureDiagnosticAutocorrectionDecision (file_blocking_fix safety net)', () => {
  test('accepts a well-formed file_blocking_fix decision unchanged', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const owner = access.resolveWorkItemContext('fixture-feature');

    const decision = baseDiagnosticDecision({
      next_step: 'file_blocking_fix',
      systemic_blocker: {
        title: 'Systemic defect',
        evidence_summary: 'The environment cannot recover without human intervention.',
        scope_note: 'Excludes the blocked feature\'s own remaining work.',
        severity: 'critical',
      },
    });

    const ensured = access.ensureDiagnosticAutocorrectionDecision(owner, 'fixture reason', decision);

    expect(ensured.next_step).toBe('file_blocking_fix');
    expect(ensured.systemic_blocker?.title).toBe('Systemic defect');
  });

  test('falls back to stop_with_diagnostic when file_blocking_fix has no systemic_blocker payload', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const owner = access.resolveWorkItemContext('fixture-feature');

    const decision = baseDiagnosticDecision({ next_step: 'file_blocking_fix', systemic_blocker: null });

    const ensured = access.ensureDiagnosticAutocorrectionDecision(owner, 'fixture reason', decision);

    expect(ensured.next_step).toBe('stop_with_diagnostic');
    expect(ensured.systemic_blocker).toBeNull();
  });

  test('falls back to stop_with_diagnostic when systemic_blocker is missing required fields', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const owner = access.resolveWorkItemContext('fixture-feature');

    const decision = baseDiagnosticDecision({
      next_step: 'file_blocking_fix',
      systemic_blocker: {
        title: '',
        evidence_summary: 'Some evidence.',
        scope_note: 'Some scope note.',
        severity: 'critical',
      },
    });

    const ensured = access.ensureDiagnosticAutocorrectionDecision(owner, 'fixture reason', decision);

    expect(ensured.next_step).toBe('stop_with_diagnostic');
  });
});
