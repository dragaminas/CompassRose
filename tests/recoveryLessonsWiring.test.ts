import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ParsedTaskDocument } from '../src/contracts/task/taskContracts.js';
import type { RecoveryLesson } from '../src/contracts/runtime/taskInterfaceAnalysis.js';
import type { StepExecutionResult } from '../src/contracts/runtime/protoRuntime.js';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { copyContractsIntoWorkspace, createTempWorkspace, readFixtureConfigMarkdown, type TempWorkspace } from './testUtils.js';

// A codex mock that always returns an `approved` reviewer_output for whatever `-o <path>` the
// real CLI passes (see src/agents/codexCli.ts's runStructured), so reviewTask() never touches a
// real agent -- only ever exercises the deterministic recovery-lesson wiring under test.
//
// Written OUTSIDE the reviewed git workspace, in its own temp dir: writing it into workspace.root
// after createWorkspace()'s initial commit would leave it as an uncommitted file in the working
// tree, which the deterministic review-time scope check (item 2) would then correctly -- but
// unhelpfully for this test -- flag as an out-of-scope change belonging to the task under review.
function writeApprovedReviewerMock(): string {
  const root = mkdtempSync(join(tmpdir(), 'compassrose-recovery-lesson-mock-'));
  const path = join(root, 'codex-mock-reviewer.cjs');
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
const outputPath = outputIndex === -1 ? null : args[outputIndex + 1];
const payload = {
  task_id: 'F001-T01',
  status: 'approved',
  summary: 'Fixture review approved.',
  acceptance: { criteria: [{ criterion: 'fixture', status: 'passed', notes: 'fixture' }] },
  findings: [],
  scope_check: { status: 'passed', unrelated_changes: [] },
  quality_gate_check: { status: 'passed', failed_gates: [] },
  correction_task: null,
  project_state_update_hint: null,
};
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

- Fixture workspace for recovery-lesson wiring tests.

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

Fixture state for testing recovery-lesson wiring.

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
Fixture task for recovery-lesson wiring tests.

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

function seedRecoveryLesson(root: string, taskId: string, overrides: Partial<RecoveryLesson> = {}): void {
  const lessonsDir = join(root, '.git', 'proto-compassrose', 'recovery-lessons');
  mkdirSync(lessonsDir, { recursive: true });
  const lesson: RecoveryLesson = {
    run_id: 'fixture-run',
    created_at: new Date().toISOString(),
    feature_id: 'fixture-feature',
    task_id: taskId,
    correction_task_id: null,
    review_status: 'changes_required',
    category: 'scope_violation',
    summary: `Fixture lesson for ${taskId}.`,
    implementation_notes: null,
    review_findings: [],
    quality_gate_failures: [],
    recommended_action: 'none',
    perfectible: true,
    scope_isolation_notes: [`${taskId} leaked an out-of-scope path.`],
    implementer_limitations: [],
    task_interface_adjustments: {
      first_executable_step: null,
      minimum_progress_evidence: [],
      context_additions: [],
      scope_adjustments: [],
      acceptance_criteria_adjustments: [],
      quality_gate_adjustments: [],
    },
    notes_for_documentation: [],
    ...overrides,
  };
  writeFileSync(join(lessonsDir, `${taskId}.json`), `${JSON.stringify(lesson, null, 2)}\n`, 'utf8');
}

interface RecoveryLessonsAccess {
  loadTask(taskId: string): ParsedTaskDocument;
  reviewTask(taskId: string): StepExecutionResult;
  loadRecentRecoveryLessons(featureId: string, activeTaskId?: string | null, limit?: number): RecoveryLesson[];
  buildRecoveryLessonPromptLines(featureId: string, activeTaskId?: string | null): string[];
}

function asAccess(orchestrator: CompassRoseOrchestrator): RecoveryLessonsAccess {
  return orchestrator as unknown as RecoveryLessonsAccess;
}

function findPromptFile(root: string, labelFragment: string): string {
  const contextsRoot = join(root, '.git', 'proto-compassrose', 'logs', 'agent-contexts');
  const runDirs = readdirSync(contextsRoot);
  for (const runDir of runDirs) {
    const files = readdirSync(join(contextsRoot, runDir)).filter((name) => name.endsWith('.prompt.txt') && name.includes(labelFragment));
    if (files.length > 0) {
      return readFileSync(join(contextsRoot, runDir, files[0] as string), 'utf8');
    }
  }
  throw new Error(`No prompt file found matching "${labelFragment}" under ${contextsRoot}`);
}

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
  vi.unstubAllEnvs();
});

describe('loadRecentRecoveryLessons / buildRecoveryLessonPromptLines', () => {
  test('surfaces lessons from unrelated task anchors, not just the most recently recorded one', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    seedRecoveryLesson(workspace.root, 'F002-T09', { created_at: '2026-01-01T00:00:00.000Z' });
    seedRecoveryLesson(workspace.root, 'F003-T10', { created_at: '2026-02-01T00:00:00.000Z' });

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const lessons = asAccess(orchestrator).loadRecentRecoveryLessons('fixture-feature');

    expect(lessons.map((lesson) => lesson.task_id).sort()).toEqual(['F002-T09', 'F003-T10']);
  });

  test('sorts a lesson matching the active task anchor first, without discarding the others', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    seedRecoveryLesson(workspace.root, 'F002-T09', { created_at: '2026-02-01T00:00:00.000Z' });
    seedRecoveryLesson(workspace.root, 'F001-T01-U1', { created_at: '2026-01-01T00:00:00.000Z' });

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const lessons = asAccess(orchestrator).loadRecentRecoveryLessons('fixture-feature', 'F001-T01');

    expect(lessons[0]?.task_id).toBe('F001-T01-U1');
    expect(lessons).toHaveLength(2);
  });

  test('calls out a recurring category across unrelated anchors in the prompt lines', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    seedRecoveryLesson(workspace.root, 'F002-T09', { category: 'scope_violation' });
    seedRecoveryLesson(workspace.root, 'F003-T10', { category: 'scope_violation' });
    seedRecoveryLesson(workspace.root, 'F004-T11', { category: 'malformed_quality_gate' });

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const lines = asAccess(orchestrator).buildRecoveryLessonPromptLines('fixture-feature');

    expect(lines.some((line) => line.includes('recurring_category') && line.includes('scope_violation'))).toBe(true);
    expect(lines.filter((line) => line.includes('lesson for task_id'))).toHaveLength(3);
  });

  test('a recent lesson from an unrelated anchor reaches the reviewer prompt', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    seedRecoveryLesson(workspace.root, 'F009-T77', { summary: 'A completely unrelated prior chain leaked scope.' });

    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', writeApprovedReviewerMock());
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    const result = access.reviewTask('F001-T01');
    expect(result.exitCode).toBe(0);

    const prompt = findPromptFile(workspace.root, 'reviewer-subtask');
    expect(prompt).toContain('Recent recovery lessons for this feature');
    expect(prompt).toContain('A completely unrelated prior chain leaked scope.');
    expect(prompt).toContain('F009-T77');
  });
});
