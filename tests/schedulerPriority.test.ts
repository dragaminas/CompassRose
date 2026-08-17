import { describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import type { StepDecision } from '../src/contracts/runtime/stepDecision.js';
import { copyContractsIntoWorkspace, readFixtureConfigMarkdown } from './testUtils.js';

function createWorkspace(files: Record<string, string> = {}): { root: string; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'compassrose-scheduler-priority-'));
  if (!existsSync(join(root, '.git'))) {
    mkdirSync(join(root, '.git'), { recursive: true });
  }
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = join(root, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
  }
  return {
    root,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

function buildOrchestrator(root: string): { determineNextStep(): StepDecision } {
  const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: root, implementer: 'opencode' });
  return orchestrator as unknown as { determineNextStep(): StepDecision };
}

function featureState(lifecycleState: string, activeTask = 'none'): string {
  return [
    '# State: Fixture',
    '',
    '## Lifecycle State',
    '',
    lifecycleState,
    '',
    '## Source Request',
    '',
    '`request.md`',
    '',
    '## Operational Status',
    '',
    '- formalization: complete',
    `- active_task: ${activeTask}`,
    '- active_correction_task: none',
    '- active_unblock_task: none',
    '- last_implementation_result: not_run',
    '- last_quality_gate_result: unknown',
    '- last_review_result: not_run',
    '- last_unblock_result: not_run',
    '',
    '## Current Reality',
    '',
    'Fixture state.',
    '',
    '## Implemented Deliverables',
    '',
    '- none',
    '',
    '## Remaining Deliverables',
    '',
    '- none',
    '',
    '## Outline Progress',
    '',
    '- none',
    '',
    '## Blocked By',
    '',
    '- None',
    '',
    '## Blocked From',
    '',
    '- lifecycle_state: none',
    '- active_task: none',
    '- active_correction_task: none',
    '- active_unblock_task: none',
    '',
    '## Last Approved Change',
    '',
    'None yet.',
    '',
    '## Known Gaps',
    '',
    '- None',
    '',
    '## Next Planning Hint',
    '',
    'Fixture next step.',
    '',
  ].join('\n');
}

function fixState(lifecycleState: string, severity: string, owningFeature = 'none'): string {
  return [
    '# State: Fixture Fix',
    '',
    '## Lifecycle State',
    '',
    lifecycleState,
    '',
    '## Source Request',
    '',
    '`request.md`',
    '',
    '## Operational Status',
    '',
    '- formalization: complete',
    '- active_task: none',
    '- active_correction_task: none',
    '- active_unblock_task: none',
    '- last_implementation_result: not_run',
    '- last_quality_gate_result: unknown',
    '- last_review_result: not_run',
    '- last_unblock_result: not_run',
    `- severity: ${severity}`,
    `- owning_feature: ${owningFeature}`,
    '',
    '## Current Reality',
    '',
    'Fixture fix state.',
    '',
    '## Implemented Deliverables',
    '',
    '- none',
    '',
    '## Remaining Deliverables',
    '',
    '- none',
    '',
    '## Outline Progress',
    '',
    '- none',
    '',
    '## Blocked By',
    '',
    '- None',
    '',
    '## Blocked From',
    '',
    '- lifecycle_state: none',
    '- active_task: none',
    '- active_correction_task: none',
    '- active_unblock_task: none',
    '',
    '## Last Approved Change',
    '',
    'None yet.',
    '',
    '## Known Gaps',
    '',
    '- None',
    '',
    '## Next Planning Hint',
    '',
    'Fixture next step.',
    '',
  ].join('\n');
}

function seedFeature(root: string, id: string, lifecycleState: string, activeTask = 'none'): void {
  const dir = join(root, 'compassrose', 'features', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'request.md'), `# Request: ${id}\n`, 'utf8');
  writeFileSync(join(dir, 'feature.md'), `# Feature: ${id}\n\n## Purpose\n\nFixture.\n`, 'utf8');
  writeFileSync(join(dir, 'architecture.md'), `# Architecture: ${id}\n`, 'utf8');
  writeFileSync(join(dir, 'state.md'), featureState(lifecycleState, activeTask), 'utf8');
}

function seedFix(root: string, id: string, lifecycleState: string, severity: string, owningFeature = 'none'): void {
  const dir = join(root, 'compassrose', 'fixes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'request.md'), `# Request: ${id}\n`, 'utf8');
  writeFileSync(join(dir, 'fix.md'), `# Fix: ${id}\n\n## Purpose\n\nFixture.\n`, 'utf8');
  writeFileSync(join(dir, 'state.md'), fixState(lifecycleState, severity, owningFeature), 'utf8');
}

function seedRawFixRequest(root: string, id: string): void {
  const dir = join(root, 'compassrose', 'fixes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'request.md'), `# Request: ${id}\n\nFresh, unformalized request.\n`, 'utf8');
}

describe('scheduler priority: features vs fixes', () => {
  test('a continuing (in-flight) feature wins over a lower-numbered startable feature', () => {
    const workspace = createWorkspace({ 'compassrose/CONFIG.md': readFixtureConfigMarkdown() });
    copyContractsIntoWorkspace(workspace.root);

    try {
      seedFeature(workspace.root, '001-lower-startable', 'formalized');
      seedFeature(workspace.root, '002-higher-continuing', 'implementation_running', 'F002-T01');

      const decision = buildOrchestrator(workspace.root).determineNextStep();

      expect(decision.kind).toBe('implement_subtask');
      expect(decision.feature_id).toBe('002-higher-continuing');
      expect(decision.task_id).toBe('F002-T01');
    } finally {
      workspace.dispose();
    }
  });

  test('a critical fix preempts a startable feature when nothing is in flight', () => {
    const workspace = createWorkspace({ 'compassrose/CONFIG.md': readFixtureConfigMarkdown() });
    copyContractsIntoWorkspace(workspace.root);

    try {
      seedFeature(workspace.root, '001-startable-feature', 'formalized');
      seedFix(workspace.root, '001-critical-fix', 'task_planning_pending', 'critical');

      const decision = buildOrchestrator(workspace.root).determineNextStep();

      expect(decision.kind).toBe('plan_fix_task');
      expect(decision.feature_id).toBe('001-critical-fix');
    } finally {
      workspace.dispose();
    }
  });

  test('a critical fix does NOT interrupt a feature task already in flight', () => {
    const workspace = createWorkspace({ 'compassrose/CONFIG.md': readFixtureConfigMarkdown() });
    copyContractsIntoWorkspace(workspace.root);

    try {
      seedFeature(workspace.root, '001-in-flight-feature', 'implementation_running', 'F001-T01');
      seedFix(workspace.root, '001-critical-fix', 'task_planning_pending', 'critical');

      const decision = buildOrchestrator(workspace.root).determineNextStep();

      expect(decision.kind).toBe('implement_subtask');
      expect(decision.feature_id).toBe('001-in-flight-feature');
      expect(decision.task_id).toBe('F001-T01');
    } finally {
      workspace.dispose();
    }
  });

  test('a medium-severity fix does not preempt a startable feature (only critical/high do)', () => {
    const workspace = createWorkspace({ 'compassrose/CONFIG.md': readFixtureConfigMarkdown() });
    copyContractsIntoWorkspace(workspace.root);

    try {
      seedFeature(workspace.root, '001-startable-feature', 'formalized');
      seedFix(workspace.root, '001-medium-fix', 'task_planning_pending', 'medium');

      const decision = buildOrchestrator(workspace.root).determineNextStep();

      expect(decision.kind).toBe('plan_task');
      expect(decision.feature_id).toBe('001-startable-feature');
    } finally {
      workspace.dispose();
    }
  });

  test('a medium-severity fix is still scheduled once no feature has new work to start', () => {
    const workspace = createWorkspace({ 'compassrose/CONFIG.md': readFixtureConfigMarkdown() });
    copyContractsIntoWorkspace(workspace.root);

    try {
      seedFeature(workspace.root, '001-completed-feature', 'completed');
      seedFix(workspace.root, '001-medium-fix', 'task_planning_pending', 'medium');

      const decision = buildOrchestrator(workspace.root).determineNextStep();

      expect(decision.kind).toBe('plan_fix_task');
      expect(decision.feature_id).toBe('001-medium-fix');
    } finally {
      workspace.dispose();
    }
  });

  test('among multiple startable fixes, higher severity wins regardless of numeric id', () => {
    const workspace = createWorkspace({ 'compassrose/CONFIG.md': readFixtureConfigMarkdown() });
    copyContractsIntoWorkspace(workspace.root);

    try {
      seedFix(workspace.root, '001-high-severity-fix', 'task_planning_pending', 'high');
      seedFix(workspace.root, '002-critical-severity-fix', 'task_planning_pending', 'critical');

      const decision = buildOrchestrator(workspace.root).determineNextStep();

      expect(decision.kind).toBe('plan_fix_task');
      expect(decision.feature_id).toBe('002-critical-severity-fix');
    } finally {
      workspace.dispose();
    }
  });

  test('a fresh, unformalized fix request defaults to critical and preempts an existing medium fix', () => {
    const workspace = createWorkspace({ 'compassrose/CONFIG.md': readFixtureConfigMarkdown() });
    copyContractsIntoWorkspace(workspace.root);

    try {
      seedFix(workspace.root, '001-medium-fix', 'task_planning_pending', 'medium');
      seedRawFixRequest(workspace.root, '002-fresh-fix-request');

      const decision = buildOrchestrator(workspace.root).determineNextStep();

      expect(decision.kind).toBe('plan_fix');
      expect(decision.feature_id).toBe('002-fresh-fix-request');
    } finally {
      workspace.dispose();
    }
  });
});
