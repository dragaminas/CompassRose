import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ParsedTaskDocument } from '../src/contracts/task/taskContracts.js';
import type { StepExecutionResult } from '../src/contracts/runtime/protoRuntime.js';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { copyContractsIntoWorkspace, createTempWorkspace, readFixtureConfigMarkdown, type TempWorkspace } from './testUtils.js';

// Points the reviewer's own agent invocation at a binary that cannot possibly exist, so that if
// reviewTask() ever regresses into invoking the reviewer LLM despite an already-detected scope
// violation, the test fails loudly (ENOENT) instead of silently succeeding.
const NONEXISTENT_CODEX_COMMAND = 'compassrose-codex-binary-that-does-not-exist';

const PROJECT_STATE_SEED = `# CompassRose Project State

## Status

active

## Active Feature

\`none\`

## Current Reality

- Fixture workspace for deterministic scope-check tests.

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
- last_implementation_result: not_run
- last_quality_gate_result: unknown
- last_review_result: not_run

## Current Reality

Fixture state for testing the deterministic review-time scope check.

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

function taskDoc(taskId: string, featureId: string): string {
  return `# Task: Fixture task

## Task ID
\`${taskId}\`

## Parent Feature
\`${featureId}\`

## Goal
Fixture task for deterministic scope-check tests.

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

interface DeterministicScopeCheckAccess {
  loadTask(taskId: string): ParsedTaskDocument;
  reviewTask(taskId: string): StepExecutionResult;
}

function asAccess(orchestrator: CompassRoseOrchestrator): DeterministicScopeCheckAccess {
  return orchestrator as unknown as DeterministicScopeCheckAccess;
}

function listTaskFiles(root: string, featureId: string): string[] {
  return readdirSync(join(root, 'compassrose', 'features', featureId, 'tasks'));
}

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
  vi.unstubAllEnvs();
});

describe('deterministic review-time scope check', () => {
  test('blocks on an out-of-scope diff with a correction task, without ever invoking the reviewer', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    // The implementer's diff leaks outside the task's own allowed_paths (`src/allowed.ts`).
    writeFileSync(join(workspace.root, 'src', 'unrelated.ts'), 'export const unrelated = true;\n', 'utf8');

    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', NONEXISTENT_CODEX_COMMAND);
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: true, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    const result = access.reviewTask('F001-T01');

    expect(result.exitCode).toBe(0);
    expect(result.continueLoop).toBe(true);
    expect(result.summary).toContain('Deterministic scope check');
    expect(result.summary).toContain('src/unrelated.ts');
    expect(result.summary).toContain('without invoking the reviewer');

    const taskFiles = listTaskFiles(workspace.root, 'fixture-feature');
    const correctionFile = taskFiles.find((name) => name !== '001-fixture-task.md');
    expect(correctionFile).toBeDefined();

    const correctionMarkdown = readFileSync(join(workspace.root, 'compassrose', 'features', 'fixture-feature', 'tasks', correctionFile as string), 'utf8');
    expect(correctionMarkdown).toContain('src/unrelated.ts');
    expect(correctionMarkdown).toMatch(/F001-T01-C1/);

    const featureState = readFileSync(join(workspace.root, 'compassrose', 'features', 'fixture-feature', 'state.md'), 'utf8');
    expect(featureState.match(/## Lifecycle State\n\n(\S+)/)?.[1]).toBe('correction_pending');
    expect(featureState).toContain('- active_correction_task: F001-T01-C1');
  });

  test('does not trigger when the diff stays entirely within allowed_paths', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    writeFileSync(join(workspace.root, 'src', 'allowed.ts'), 'export const allowed = true;\nexport const more = 1;\n', 'utf8');

    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', NONEXISTENT_CODEX_COMMAND);
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    // With no scope violation, reviewTask() proceeds to invoke the (nonexistent) reviewer binary
    // and must throw rather than silently returning a scope-violation result.
    expect(() => access.reviewTask('F001-T01')).toThrow();
  });
});
