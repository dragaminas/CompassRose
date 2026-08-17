import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { copyContractsIntoWorkspace, createTempWorkspace, readFixtureConfigMarkdown, type TempWorkspace } from './testUtils.js';

interface ResolutionAccess {
  resolveSourceTaskRequestId(taskId: string): string | null;
}

function asAccess(orchestrator: CompassRoseOrchestrator): ResolutionAccess {
  return orchestrator as unknown as ResolutionAccess;
}

function writeTaskArtifact(workspaceRoot: string, taskId: string, sourceTaskRequestId: string | null): void {
  const path = join(workspaceRoot, '.git', 'proto-compassrose', 'tasks', `${taskId}.json`);
  const payload = {
    task: {
      task_id: taskId,
      feature_id: 'fixture-feature',
      source_task_request_id: sourceTaskRequestId,
    },
  };
  mkdirSync(join(workspaceRoot, '.git', 'proto-compassrose', 'tasks'), { recursive: true });
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8');
}

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
});

describe('resolveSourceTaskRequestId', () => {
  test('reads source_task_request_id directly off the task\'s own stored artifact', () => {
    workspace = createTempWorkspace({
      files: { 'compassrose/CONFIG.md': readFixtureConfigMarkdown() },
    });
    copyContractsIntoWorkspace(workspace.root);
    execFileSync('git', ['init', '--quiet'], { cwd: workspace.root });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspace.root });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspace.root });
    execFileSync('git', ['add', '-A'], { cwd: workspace.root });
    execFileSync('git', ['commit', '--quiet', '-m', 'initial commit'], { cwd: workspace.root });

    writeTaskArtifact(workspace.root, 'F002-T17', 'F002-TR05');

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    expect(asAccess(orchestrator).resolveSourceTaskRequestId('F002-T17')).toBe('F002-TR05');
  });

  test('falls back to the primary task anchor when a correction task carries no source_task_request_id of its own', () => {
    // Regression test: F002-TR05 stayed `in_progress` forever in real production use after its
    // correction chain (F002-T17 -> F002-T17-C1 -> F002-T17-C1-CORRECTION-R1) was fully approved,
    // because the approved correction task's own stored artifact has no source_task_request_id
    // -- only the original task-planning-created task does. A later task-planning pass then
    // proposed recreating F002-T17 from scratch, colliding with the original task's own history.
    workspace = createTempWorkspace({
      files: { 'compassrose/CONFIG.md': readFixtureConfigMarkdown() },
    });
    copyContractsIntoWorkspace(workspace.root);
    execFileSync('git', ['init', '--quiet'], { cwd: workspace.root });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspace.root });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspace.root });
    execFileSync('git', ['add', '-A'], { cwd: workspace.root });
    execFileSync('git', ['commit', '--quiet', '-m', 'initial commit'], { cwd: workspace.root });

    writeTaskArtifact(workspace.root, 'F002-T17', 'F002-TR05');
    writeTaskArtifact(workspace.root, 'F002-T17-C1', null);
    writeTaskArtifact(workspace.root, 'F002-T17-C1-CORRECTION-R1', null);

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    expect(asAccess(orchestrator).resolveSourceTaskRequestId('F002-T17-C1-CORRECTION-R1')).toBe('F002-TR05');
  });

  test('returns null when neither the task nor its anchor carries a source_task_request_id', () => {
    workspace = createTempWorkspace({
      files: { 'compassrose/CONFIG.md': readFixtureConfigMarkdown() },
    });
    copyContractsIntoWorkspace(workspace.root);
    execFileSync('git', ['init', '--quiet'], { cwd: workspace.root });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspace.root });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspace.root });
    execFileSync('git', ['add', '-A'], { cwd: workspace.root });
    execFileSync('git', ['commit', '--quiet', '-m', 'initial commit'], { cwd: workspace.root });

    writeTaskArtifact(workspace.root, 'F001-T01', null);

    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    expect(asAccess(orchestrator).resolveSourceTaskRequestId('F001-T01')).toBeNull();
  });
});
