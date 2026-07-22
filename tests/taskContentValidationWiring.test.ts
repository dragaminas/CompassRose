import { chmodSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ParsedTaskDocument } from '../src/contracts/task/taskContracts.js';
import type { StepDecision } from '../src/contracts/runtime/stepDecision.js';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { copyContractsIntoWorkspace, createTempWorkspace, readFixtureConfigMarkdown, type TempWorkspace } from './testUtils.js';

// Builds a codex mock that returns a fixed PlannerOutput JSON for whatever `-o <path>` the real
// CLI passes (see src/agents/codexCli.ts's runStructured), so planDoctorRecoveryTask() never
// touches a real agent -- only ever exercises the deterministic sanitization/validation wiring
// under test.
function writePlannerOutputMock(root: string, taskJson: unknown): string {
  const path = join(root, 'codex-mock-planner.cjs');
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
const outputPath = outputIndex === -1 ? null : args[outputIndex + 1];
const payload = ${JSON.stringify({ task: taskJson })};
if (outputPath) {
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\\n', 'utf8');
}
process.exit(0);
`;
  writeFileSync(path, script, 'utf8');
  chmodSync(path, 0o755);
  return path;
}

const PROJECT_STATE_SEED = `# CompassRose Project State

## Status

active

## Active Feature

\`none\`

## Current Reality

- Fixture workspace for task-content validation wiring tests.

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
- active_unblock_task: none
- last_implementation_result: not_run
- last_quality_gate_result: failed
- last_review_result: not_run
- last_unblock_result: not_run
- doctor_recovery_attempts: 0

## Current Reality

Fixture state for testing task-content validation wiring.

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
Fixture task for task-content validation wiring tests.

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

function baseDoctorRecoveryTaskJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    task_id: 'F001-T01-U1',
    previous_task_id: null,
    feature_id: 'fixture-feature',
    title: 'Fixture doctor recovery task',
    objective: 'Recover the fixture feature from a quality-gate failure.',
    first_executable_step: 'Inspect the failure and repair it.',
    minimum_progress_evidence: ['The quality gate passes again.'],
    trace: { roadmap_objective: 'Fixture', feature_goal: 'Fixture', state_gap: 'Fixture' },
    context: { summary: 'Fixture doctor recovery.', relevant_paths: ['src/allowed.ts'], relevant_modules: ['fixture'] },
    scope: {
      allowed_paths: ['src/allowed.ts'],
      forbidden_paths: [],
    },
    constraints: [],
    development_policy: { mode: 'test_guided' },
    quality_gates: { before_review: ['echo unused'] },
    acceptance_criteria: ['The gate passes.'],
    expected_deliverables: ['code'],
    scope_justification: { included_by: 'n/a - fixture', excluded_by: ['n/a - fixture'], belongs_to_other_feature: null },
    source_task_request_id: null,
    ...overrides,
  };
}

interface WiringAccess {
  loadTask(taskId: string): ParsedTaskDocument;
  planDoctorRecoveryTask(featureId: string, reason: string): void;
  executeStep(decision: StepDecision): { exitCode: number; continueLoop: boolean; summary: string };
}

function asAccess(orchestrator: CompassRoseOrchestrator): WiringAccess {
  return orchestrator as unknown as WiringAccess;
}

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
  vi.unstubAllEnvs();
});

describe('task-content validation wiring (planDoctorRecoveryTask)', () => {
  test('strips a parenthetical annotation glued onto an allowed_paths entry before writing the task document', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    const taskJson = baseDoctorRecoveryTaskJson({
      scope: {
        allowed_paths: ['src/allowed.ts (cleanup only: remove the stray helper)'],
        forbidden_paths: [],
      },
    });
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', writePlannerOutputMock(workspace.root, taskJson));

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    asAccess(orchestrator).planDoctorRecoveryTask('fixture-feature', 'quality gates failed');

    const tasksDir = join(workspace.root, 'docs', 'features', 'fixture-feature', 'tasks');
    const recoveryTaskFile = readdirSync(tasksDir).find((name) => name !== '001-fixture-task.md');
    expect(recoveryTaskFile).toBeDefined();

    const markdown = readFileSync(join(tasksDir, recoveryTaskFile as string), 'utf8');
    expect(markdown).toContain('`src/allowed.ts`');
    expect(markdown).not.toContain('cleanup only');
  });

  test('refuses to plan a doctor recovery task whose quality gate is an unenforceable git diff --exit-code with no ref', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    const taskJson = baseDoctorRecoveryTaskJson({
      quality_gates: { before_review: ['git diff --name-only --exit-code -- src/allowed.ts'] },
    });
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', writePlannerOutputMock(workspace.root, taskJson));

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });

    expect(() => asAccess(orchestrator).planDoctorRecoveryTask('fixture-feature', 'quality gates failed')).toThrow(
      /git diff ... --exit-code.*no explicit ref/,
    );

    const tasksDir = join(workspace.root, 'docs', 'features', 'fixture-feature', 'tasks');
    expect(readdirSync(tasksDir)).toEqual(['001-fixture-task.md']);
  });

  test('an unenforceable quality gate surfaces as a clean diagnostic stop through executeStep, not an uncaught crash', () => {
    // Regression test: this same rejection used to escape planDoctorRecoveryTask() as a bare
    // Error, which executeStep()'s `unblock_task` branch only guarded against
    // DoctorRecoveryLimitReachedError -- so it propagated uncaught and crashed the whole process
    // instead of the controlled { exitCode: 2, continueLoop: false } stop every other planning
    // rejection on this path produces.
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    const taskJson = baseDoctorRecoveryTaskJson({
      quality_gates: { before_review: ['git diff --name-only --exit-code -- src/allowed.ts'] },
    });
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', writePlannerOutputMock(workspace.root, taskJson));

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const decision: StepDecision = {
      kind: 'unblock_task',
      feature_id: 'fixture-feature',
      task_id: null,
      correction_task_id: null,
      reason: 'quality gates failed',
    };

    let result: { exitCode: number; continueLoop: boolean; summary: string } | undefined;
    expect(() => {
      result = asAccess(orchestrator).executeStep(decision);
    }).not.toThrow();

    expect(result).toBeDefined();
    expect(result?.exitCode).toBe(2);
    expect(result?.continueLoop).toBe(false);
    expect(result?.summary).toMatch(/git diff ... --exit-code.*no explicit ref/);

    const tasksDir = join(workspace.root, 'docs', 'features', 'fixture-feature', 'tasks');
    expect(readdirSync(tasksDir)).toEqual(['001-fixture-task.md']);
  });

  test('accepts a git diff --exit-code gate that includes an explicit ref', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    const taskJson = baseDoctorRecoveryTaskJson({
      quality_gates: { before_review: ['git diff --name-only --exit-code abc1234 -- src/allowed.ts'] },
    });
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', writePlannerOutputMock(workspace.root, taskJson));

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    expect(() => asAccess(orchestrator).planDoctorRecoveryTask('fixture-feature', 'quality gates failed')).not.toThrow();

    const tasksDir = join(workspace.root, 'docs', 'features', 'fixture-feature', 'tasks');
    expect(readdirSync(tasksDir)).toHaveLength(2);
  });
});
