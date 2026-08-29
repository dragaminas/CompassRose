import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  CORE_RUNTIME_SMOKE_GATE_COMMAND,
  coreRuntimeSmokeGateCommands,
} from '../src/orchestrator/coreRuntimeSmokeGate.js';
import type { ParsedTaskDocument } from '../src/contracts/task/taskContracts.js';
import type { QualityGateResult } from '../src/contracts/runtime/attempts.js';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { copyContractsIntoWorkspace, createTempWorkspace, readFixtureConfigMarkdown, type TempWorkspace } from './testUtils.js';

const PROJECT_STATE_SEED = `# CompassRose Project State

## Status

active

## Active Feature

\`none\`

## Current Reality

- Fixture workspace for core-runtime smoke-gate tests.

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

Fixture state for testing the core-runtime smoke gate.

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
Fixture task for core-runtime smoke-gate tests.

## Scope
Allowed:
- \`src/orchestrator/fixtureModule.ts\`
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
  mkdirSync(join(workspace.root, 'src', 'orchestrator'), { recursive: true });
  writeFileSync(join(workspace.root, 'src', 'allowed.ts'), 'export const allowed = true;\n', 'utf8');

  execFileSync('git', ['init', '--quiet'], { cwd: workspace.root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspace.root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspace.root });
  execFileSync('git', ['add', '-A'], { cwd: workspace.root });
  execFileSync('git', ['commit', '--quiet', '-m', 'initial commit'], { cwd: workspace.root });

  return workspace;
}

interface CoreRuntimeSmokeGateAccess {
  loadTask(taskId: string): ParsedTaskDocument;
  runQualityGates(task: ParsedTaskDocument): QualityGateResult[];
}

function asAccess(orchestrator: CompassRoseOrchestrator): CoreRuntimeSmokeGateAccess {
  return orchestrator as unknown as CoreRuntimeSmokeGateAccess;
}

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
});

describe('core-runtime smoke gate', () => {
  test('is not added when the diff does not touch src/orchestrator, src/cli, or src/task', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const task = access.loadTask('F001-T01');

    const results = access.runQualityGates(task);

    expect(results).toHaveLength(1);
    expect(results[0]?.command).toBe('echo unused');
  });

  // ADR-0049. This used to expect two gates. The prefixes and the script are *this* repository's
  // layout, and the workspace below is not this repository -- a target with its own
  // `src/orchestrator/` was being handed a gate invoking a script it does not have, through a `tsx`
  // it has not installed. The gate itself is unchanged and still fires where it means something;
  // see the pure-function cases below, which are how that half is asserted now that a wiring test
  // cannot reach it.
  test('is not added to a repository that is not this installation, even when the diff touches src/orchestrator', () => {
    workspace = createWorkspace('fixture-feature', 'F001-T01');
    writeFileSync(join(workspace.root, 'src', 'orchestrator', 'fixtureModule.ts'), 'export const fixture = true;\n', 'utf8');

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    const task = access.loadTask('F001-T01');

    const results = access.runQualityGates(task);

    expect(results).toHaveLength(1);
    expect(results[0]?.command).toBe('echo unused');
  });
});

describe('the core-runtime smoke gate decision', () => {
  test('fires when this repository\'s own runtime changed', () => {
    expect(coreRuntimeSmokeGateCommands(['src/orchestrator/orchestrator.ts'], true)).toEqual([
      CORE_RUNTIME_SMOKE_GATE_COMMAND,
    ]);
    expect(coreRuntimeSmokeGateCommands(['src/cli/main.ts'], true)).toEqual([CORE_RUNTIME_SMOKE_GATE_COMMAND]);
    expect(coreRuntimeSmokeGateCommands(['src/task/taskDocument.ts'], true)).toEqual([CORE_RUNTIME_SMOKE_GATE_COMMAND]);
  });

  test('stays out of the way otherwise', () => {
    expect(coreRuntimeSmokeGateCommands(['compassrose/CONFIG.md'], true)).toEqual([]);
    // The same diff, in someone else's repository: the script and the prefixes mean nothing there.
    expect(coreRuntimeSmokeGateCommands(['src/orchestrator/orchestrator.ts'], false)).toEqual([]);
    expect(coreRuntimeSmokeGateCommands(['src/cli/main.ts'], false)).toEqual([]);
  });
});
