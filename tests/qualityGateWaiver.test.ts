import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
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

- Fixture workspace for quality-gate waiver tests.

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

// A minimal real task document, narrowly scoped to `src/allowed.ts`, so allowedPaths is small
// and predictable for the in-scope/out-of-scope checks below.
function taskDoc(taskId: string, featureId: string, qualityGateCommand: string): string {
  return `# Task: Fixture task

## Task ID
\`${taskId}\`

## Parent Feature
\`${featureId}\`

## Goal
Fixture task for quality-gate waiver tests.

## Scope
Allowed:
- \`src/allowed.ts\`

Forbidden:
- all other paths

## Quality Gates to Run
\`\`\`bash
${qualityGateCommand}
\`\`\`
`;
}

function createWorkspace(featureId: string, taskId: string, qualityGateCommand: string): TempWorkspace {
  const workspace = createTempWorkspace({
    files: {
      'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown(),
      'docs/compassrose/PROJECT_STATE.md': PROJECT_STATE_SEED,
      [`docs/features/${featureId}/tasks/001-fixture-task.md`]: taskDoc(taskId, featureId, qualityGateCommand),
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

interface QualityGateAccess {
  loadTask(taskId: string): ParsedTaskDocument;
  runQualityGates(task: ParsedTaskDocument): QualityGateResult[];
}

function asQualityGateAccess(orchestrator: CompassRoseOrchestrator): QualityGateAccess {
  return orchestrator as unknown as QualityGateAccess;
}

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
});

describe('runQualityGates() unrelated-failure waiver', () => {
  test('waives a failure that references an out-of-scope file and reproduces on a clean baseline', () => {
    // Always fails, regardless of worktree state -- simulates a pre-existing, unrelated failure
    // (the F002-T07-C2 / F002-T10 pattern: an out-of-scope test failing for reasons that have
    // nothing to do with this task's own diff).
    const command = "node -e \"console.error('FAIL tests/unrelated.test.ts:1:1'); process.exit(1)\"";
    workspace = createWorkspace('fixture-feature', 'F001-T01', command);
    writeFileSync(join(workspace.root, 'src', 'allowed.ts'), 'export const allowed = 2;\n', 'utf8');

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asQualityGateAccess(orchestrator);
    const task = access.loadTask('F001-T01');
    const results = access.runQualityGates(task);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('waived');
    expect(results[0].output_summary).toContain('tests/unrelated.test.ts');
    // The baseline check must leave the worktree exactly as it found it.
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: workspace.root, encoding: 'utf8' }).trim())
      .toContain('src/allowed.ts');
  });

  test('does not waive a failure that references an in-scope file', () => {
    const command = "node -e \"console.error('FAIL src/allowed.ts:1:1'); process.exit(1)\"";
    workspace = createWorkspace('fixture-feature', 'F001-T01', command);
    writeFileSync(join(workspace.root, 'src', 'allowed.ts'), 'export const allowed = 2;\n', 'utf8');

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asQualityGateAccess(orchestrator);
    const task = access.loadTask('F001-T01');
    const results = access.runQualityGates(task);

    expect(results[0].status).toBe('failed');
  });

  test('does not waive a failure that does not reproduce on the clean baseline', () => {
    // Fails only when trigger.txt exists -- created by this task's own (out-of-scope) change, so
    // it passes cleanly on the baseline (HEAD, before trigger.txt existed).
    const command = "node -e \"process.exit(require('node:fs').existsSync('trigger.txt') ? 1 : 0); \" || node -e \"console.error('FAIL tests/unrelated.test.ts:1:1'); process.exit(1)\"";
    workspace = createWorkspace('fixture-feature', 'F001-T01', command);
    writeFileSync(join(workspace.root, 'trigger.txt'), 'trigger\n', 'utf8');

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asQualityGateAccess(orchestrator);
    const task = access.loadTask('F001-T01');
    const results = access.runQualityGates(task);

    expect(results[0].status).toBe('failed');
    // The baseline check must still restore the worktree, including the trigger file.
    expect(existsSync(join(workspace.root, 'trigger.txt'))).toBe(true);
  });

  test('does not waive a failure whose output names no path at all', () => {
    const command = "node -e \"console.error('generic failure, no file mentioned'); process.exit(1)\"";
    workspace = createWorkspace('fixture-feature', 'F001-T01', command);

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asQualityGateAccess(orchestrator);
    const task = access.loadTask('F001-T01');
    const results = access.runQualityGates(task);

    expect(results[0].status).toBe('failed');
  });

  test('leaves a passing gate as passed', () => {
    const command = "node -e \"process.exit(0)\"";
    workspace = createWorkspace('fixture-feature', 'F001-T01', command);

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asQualityGateAccess(orchestrator);
    const task = access.loadTask('F001-T01');
    const results = access.runQualityGates(task);

    expect(results[0].status).toBe('passed');
  });
});
