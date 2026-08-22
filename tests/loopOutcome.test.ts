import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { copyContractsIntoWorkspace, readFixtureConfigMarkdown } from './testUtils.js';
import type { StepDecision } from '../src/contracts/runtime/stepDecision.js';
import type { StepExecutionResult } from '../src/contracts/runtime/protoRuntime.js';

// 025-automated-development-loop: `run()` used to return on any non-zero step exit code, so a
// single blocked work item ended the whole run -- the concrete cause of nineteen features sitting
// behind one blocked feature for weeks. These tests pin the replacement: react to what the step
// meant (`advanced` / `blocked` / `failed`), not to what number it returned.

interface Workspace {
  readonly root: string;
  readonly dispose: () => void;
}

function projectState(): string {
  return [
    '# CompassRose Project State',
    '',
    '## Status',
    '',
    'active',
    '',
    '## Active Feature',
    '',
    '`none`',
    '',
    '## Current Reality',
    '',
    '- Fixture.',
    '',
    '## Pending',
    '',
    '- Nothing pending.',
    '',
    '## Blocked',
    '',
    '- Nothing blocked.',
    '',
    '## Last Approved Change',
    '',
    'None yet.',
    '',
    '## Known Gaps',
    '',
    'None.',
    '',
    '## Next Planning Hint',
    '',
    'None.',
    '',
  ].join('\n');
}

function featureState(lifecycleState: string): string {
  return [
    '# State: Fixture Feature',
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
    '- validation: confirmed',
    '',
    '## Current Reality',
    '',
    'Fixture.',
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
    'Fixture.',
    '',
  ].join('\n');
}

function createWorkspace(featureIds: readonly string[]): Workspace {
  const root = mkdtempSync(join(tmpdir(), 'compassrose-loop-outcome-'));
  mkdirSync(join(root, '.git'), { recursive: true });
  mkdirSync(join(root, 'compassrose'), { recursive: true });
  writeFileSync(join(root, 'compassrose', 'CONFIG.md'), readFixtureConfigMarkdown(), 'utf8');
  writeFileSync(join(root, 'compassrose', 'PROJECT_STATE.md'), projectState(), 'utf8');

  for (const id of featureIds) {
    const directory = join(root, 'compassrose', 'features', id);
    mkdirSync(join(directory, 'tasks'), { recursive: true });
    writeFileSync(join(directory, 'request.md'), `# Request: ${id}\n`, 'utf8');
    writeFileSync(join(directory, 'feature.md'), `# Feature: ${id}\n`, 'utf8');
    // Without architecture.md an item inspects as `request_pending`, and since
    // 024-specification-flow that is no longer selectable at all -- the loop may not author a
    // specification. These fixtures used to pass only because `request_pending` was startable.
    writeFileSync(join(directory, 'architecture.md'), `# Architecture: ${id}\n`, 'utf8');
    writeFileSync(join(directory, 'state.md'), featureState('formalized'), 'utf8');
  }

  copyContractsIntoWorkspace(root);
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

function decision(featureId: string | null): StepDecision {
  return { kind: 'plan_task', feature_id: featureId, task_id: null, correction_task_id: null, reason: 'fixture' };
}

function stopDecision(): StepDecision {
  return { kind: 'stop', feature_id: null, task_id: null, correction_task_id: null, reason: 'nothing left' };
}

/**
 * Drives `run()` over a scripted sequence of steps, so the loop's reaction to each outcome kind is
 * observable without standing up planners, implementers, or reviewers.
 */
function runScripted(
  workspace: Workspace,
  script: readonly { readonly decision: StepDecision; readonly result: StepExecutionResult }[],
): { exitCode: number; executed: StepDecision[] } {
  const orchestrator = new CompassRoseOrchestrator({
    cwd: workspace.root,
    commit: false,
    implementer: 'codex',
    loop: true,
  });

  const git = Reflect.get(orchestrator, 'git') as { dirtyPaths: () => readonly string[] };
  git.dirtyPaths = () => [];

  const executed: StepDecision[] = [];
  let index = 0;

  const mutable = orchestrator as unknown as Record<string, unknown>;
  mutable.determineNextStep = () => (index < script.length ? script[index]!.decision : stopDecision());
  mutable.executeStep = (stepDecision: StepDecision) => {
    executed.push(stepDecision);
    const scripted = script[index];
    index += 1;
    return scripted
      ? scripted.result
      : ({ kind: 'advanced', exitCode: 0, continueLoop: false, summary: 'nothing left' } satisfies StepExecutionResult);
  };
  mutable.writeRefinementFeedback = () => {};
  mutable.writeRunSummary = () => {};
  mutable.refreshContractsAtCheckpoint = () => null;

  return { exitCode: orchestrator.run(), executed };
}

describe('run() reacts to the outcome kind, not the exit code', () => {
  test('a blocked step does not end the run; the next selectable item is attempted', () => {
    const workspace = createWorkspace(['001-alpha', '002-beta']);

    try {
      const { exitCode, executed } = runScripted(workspace, [
        {
          decision: decision('001-alpha'),
          result: { kind: 'blocked', exitCode: 2, continueLoop: false, summary: 'gates failed' },
        },
        {
          decision: decision('002-beta'),
          result: { kind: 'advanced', exitCode: 0, continueLoop: true, summary: 'planned' },
        },
      ]);

      expect(executed.map((step) => step.feature_id)).toEqual(['001-alpha', '002-beta', null]);
      // Ended cleanly, but something needs a human: distinct from both success and failure.
      expect(exitCode).toBe(3);
    } finally {
      workspace.dispose();
    }
  });

  test('a failed step ends the run immediately, before anything else is attempted', () => {
    const workspace = createWorkspace(['001-alpha', '002-beta']);

    try {
      const { exitCode, executed } = runScripted(workspace, [
        {
          decision: decision('001-alpha'),
          result: { kind: 'failed', exitCode: 1, continueLoop: false, summary: 'contract registry broken' },
        },
        {
          decision: decision('002-beta'),
          result: { kind: 'advanced', exitCode: 0, continueLoop: true, summary: 'never reached' },
        },
      ]);

      expect(executed.map((step) => step.feature_id)).toEqual(['001-alpha']);
      expect(exitCode).toBe(1);
    } finally {
      workspace.dispose();
    }
  });

  test('a run that blocks nothing returns 0', () => {
    const workspace = createWorkspace(['001-alpha']);

    try {
      const { exitCode } = runScripted(workspace, [
        {
          decision: decision('001-alpha'),
          result: { kind: 'advanced', exitCode: 0, continueLoop: true, summary: 'planned' },
        },
      ]);

      expect(exitCode).toBe(0);
    } finally {
      workspace.dispose();
    }
  });

  test('an item blocked during the run is not selected again in that same run', () => {
    const workspace = createWorkspace(['001-alpha']);

    try {
      const orchestrator = new CompassRoseOrchestrator({
        cwd: workspace.root,
        commit: false,
        implementer: 'codex',
        loop: true,
      });
      const git = Reflect.get(orchestrator, 'git') as { dirtyPaths: () => readonly string[] };
      git.dirtyPaths = () => [];

      const mutable = orchestrator as unknown as Record<string, unknown>;
      mutable.writeRefinementFeedback = () => {};
      mutable.writeRunSummary = () => {};
      mutable.refreshContractsAtCheckpoint = () => null;

      // Always blocks the same item. Without the per-run set-aside, the real determineNextStep
      // would keep handing it back and the loop would spin forever.
      let executions = 0;
      mutable.executeStep = (stepDecision: StepDecision) => {
        executions += 1;
        return stepDecision.kind === 'stop'
          ? { kind: 'advanced', exitCode: 0, continueLoop: false, summary: 'stop' }
          : { kind: 'blocked', exitCode: 2, continueLoop: false, summary: 'blocked again' };
      };

      const exitCode = orchestrator.run();

      expect(exitCode).toBe(3);
      // One attempt at the item, then one terminal `stop` decision once it is set aside.
      expect(executions).toBeLessThanOrEqual(2);
      expect([...orchestrator.blockedDuringRun().keys()]).toEqual(['001-alpha']);
    } finally {
      workspace.dispose();
    }
  });

  test('set-aside state does not leak into the next run', () => {
    const workspace = createWorkspace(['001-alpha']);

    try {
      const orchestrator = new CompassRoseOrchestrator({
        cwd: workspace.root,
        commit: false,
        implementer: 'codex',
        loop: true,
      });
      const git = Reflect.get(orchestrator, 'git') as { dirtyPaths: () => readonly string[] };
      git.dirtyPaths = () => [];

      const mutable = orchestrator as unknown as Record<string, unknown>;
      mutable.writeRefinementFeedback = () => {};
      mutable.writeRunSummary = () => {};
      mutable.refreshContractsAtCheckpoint = () => null;

      const attempted: string[] = [];
      mutable.executeStep = (stepDecision: StepDecision) => {
        if (stepDecision.feature_id) {
          attempted.push(stepDecision.feature_id);
        }
        return stepDecision.kind === 'stop'
          ? { kind: 'advanced', exitCode: 0, continueLoop: false, summary: 'stop' }
          : { kind: 'blocked', exitCode: 2, continueLoop: false, summary: 'blocked' };
      };

      orchestrator.run();
      const afterFirst = attempted.length;
      orchestrator.run();

      expect(attempted.length).toBeGreaterThan(afterFirst);
      expect(orchestrator.blockedDuringRun().size).toBe(1);
    } finally {
      workspace.dispose();
    }
  });
});

describe('setRunTarget', () => {
  test('refuses a target that does not exist, instead of quietly running everything', () => {
    const workspace = createWorkspace(['001-alpha']);

    try {
      const orchestrator = new CompassRoseOrchestrator({
        cwd: workspace.root,
        commit: false,
        implementer: 'codex',
        loop: true,
      });

      expect(() => orchestrator.setRunTarget('999-nope')).toThrow(/No feature or fix named 999-nope/);
    } finally {
      workspace.dispose();
    }
  });

  test('restricts selection to the named item and leaves the others untouched', () => {
    const workspace = createWorkspace(['001-alpha', '002-beta']);

    try {
      const orchestrator = new CompassRoseOrchestrator({
        cwd: workspace.root,
        commit: false,
        implementer: 'codex',
        loop: true,
      });
      const git = Reflect.get(orchestrator, 'git') as { dirtyPaths: () => readonly string[] };
      git.dirtyPaths = () => [];

      const mutable = orchestrator as unknown as Record<string, unknown>;
      mutable.writeRefinementFeedback = () => {};
      mutable.writeRunSummary = () => {};
      mutable.refreshContractsAtCheckpoint = () => null;

      const attempted: string[] = [];
      mutable.executeStep = (stepDecision: StepDecision) => {
        if (stepDecision.feature_id) {
          attempted.push(stepDecision.feature_id);
        }
        return { kind: 'advanced', exitCode: 0, continueLoop: false, summary: 'done' };
      };

      orchestrator.setRunTarget('002-beta');
      orchestrator.run();

      expect(attempted).not.toContain('001-alpha');
    } finally {
      workspace.dispose();
    }
  });

  test('clearing the target restores ordinary priority selection', () => {
    const workspace = createWorkspace(['001-alpha', '002-beta']);

    try {
      const orchestrator = new CompassRoseOrchestrator({
        cwd: workspace.root,
        commit: false,
        implementer: 'codex',
        loop: true,
      });
      const git = Reflect.get(orchestrator, 'git') as { dirtyPaths: () => readonly string[] };
      git.dirtyPaths = () => [];

      const mutable = orchestrator as unknown as Record<string, unknown>;
      mutable.writeRefinementFeedback = () => {};
      mutable.writeRunSummary = () => {};
      mutable.refreshContractsAtCheckpoint = () => null;

      const attempted: string[] = [];
      mutable.executeStep = (stepDecision: StepDecision) => {
        if (stepDecision.feature_id) {
          attempted.push(stepDecision.feature_id);
        }
        return { kind: 'advanced', exitCode: 0, continueLoop: false, summary: 'done' };
      };

      orchestrator.setRunTarget('002-beta');
      orchestrator.setRunTarget(null);
      orchestrator.run();

      expect(attempted[0]).toBe('001-alpha');
    } finally {
      workspace.dispose();
    }
  });
});
