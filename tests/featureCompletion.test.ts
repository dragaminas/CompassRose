import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { allCriteriaMet, unmetCriteria } from '../src/contracts/runtime/acceptanceCriteria.js';
import { copyContractsIntoWorkspace, readFixtureConfigMarkdown } from './testUtils.js';
import type { AcceptanceCriteriaVerification } from '../src/contracts/runtime/acceptanceCriteria.js';
import type { StepExecutionResult } from '../src/contracts/runtime/protoRuntime.js';

// 025-automated-development-loop: an exhausted outline used to have exactly one meaning --
// "formalize additional task requests" -- which is right when a task request was forgotten and
// wrong when the work is finished. There was no code path to `completed` at all; both features ever
// completed in this repository were closed by hand. These tests pin the second reading, and pin
// that it is never taken on assumption.

const FEATURE_ID = '400-completion-target';

interface Workspace {
  readonly root: string;
  readonly statePath: string;
  readonly dispose: () => void;
}

function featureDocument(criteria: readonly string[]): string {
  return [
    '# Feature: Completion Target',
    '',
    '## Status',
    '',
    'Formalized',
    '',
    '## Purpose',
    '',
    'Fixture.',
    '',
    '## Acceptance Criteria',
    '',
    ...(criteria.length > 0 ? criteria.map((criterion) => `- ${criterion}`) : ['']),
    '',
    '## Implementation Outline',
    '',
    '1. Do the thing',
    '',
  ].join('\n');
}

function featureState(options: {
  activeTask?: string;
  gateResult?: string;
  reviewResult?: string;
}): string {
  return [
    '# State: Completion Target',
    '',
    '## Lifecycle State',
    '',
    'task_planning_pending',
    '',
    '## Source Request',
    '',
    '`request.md`',
    '',
    '## Operational Status',
    '',
    '- formalization: complete',
    `- active_task: ${options.activeTask ?? 'none'}`,
    '- active_correction_task: none',
    '- active_unblock_task: none',
    '- last_implementation_result: passed',
    `- last_quality_gate_result: ${options.gateResult ?? 'passed'}`,
    `- last_review_result: ${options.reviewResult ?? 'approved'}`,
    '- last_unblock_result: not_run',
    '- validation: confirmed',
    '',
    '## Current Reality',
    '',
    'Fixture.',
    '',
    '## Implemented Deliverables',
    '',
    '- everything',
    '',
    '## Remaining Deliverables',
    '',
    '- something still listed here',
    '',
    '## Outline Progress',
    '',
    '- 1. Do the thing: complete',
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
    `\`${FEATURE_ID}\``,
    '',
    '## Current Reality',
    '',
    '- Fixture.',
    '',
    '## Implemented',
    '',
    '- Nothing yet.',
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

function createWorkspace(options: {
  criteria?: readonly string[];
  activeTask?: string;
  gateResult?: string;
  reviewResult?: string;
} = {}): Workspace {
  const root = mkdtempSync(join(tmpdir(), 'compassrose-completion-'));
  const featureDirectory = join(root, 'compassrose', 'features', FEATURE_ID);

  mkdirSync(join(root, '.git', 'proto-compassrose', 'task-requests'), { recursive: true });
  mkdirSync(join(featureDirectory, 'tasks'), { recursive: true });
  writeFileSync(join(root, 'compassrose', 'CONFIG.md'), readFixtureConfigMarkdown(), 'utf8');
  writeFileSync(join(root, 'compassrose', 'PROJECT_STATE.md'), projectState(), 'utf8');
  writeFileSync(join(featureDirectory, 'request.md'), '# Request\n', 'utf8');
  writeFileSync(
    join(featureDirectory, 'feature.md'),
    featureDocument(options.criteria ?? ['the thing is done', 'the thing is tested']),
    'utf8',
  );
  writeFileSync(join(featureDirectory, 'architecture.md'), '# Architecture\n', 'utf8');
  writeFileSync(join(featureDirectory, 'state.md'), featureState(options), 'utf8');

  // Every task request already complete: the outline is exhausted, which is the situation under
  // test.
  writeFileSync(
    join(root, '.git', 'proto-compassrose', 'task-requests', `${FEATURE_ID}.json`),
    JSON.stringify([
      {
        id: '1',
        title: 'Do the thing',
        objective: 'Do it.',
        scope: { allowed_paths: ['src'], forbidden_paths: [] },
        status: 'complete',
        sibling_check: { considered_features: [], belongs_to_other_feature: null },
      },
    ]),
    'utf8',
  );

  copyContractsIntoWorkspace(root);

  return {
    root,
    statePath: join(featureDirectory, 'state.md'),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

function planTask(
  workspace: Workspace,
  verification: AcceptanceCriteriaVerification | null,
): { result: StepExecutionResult; verifierCalls: number } {
  const orchestrator = new CompassRoseOrchestrator({
    cwd: workspace.root,
    commit: false,
    implementer: 'codex',
    loop: true,
  });

  const git = Reflect.get(orchestrator, 'git') as { dirtyPaths: () => readonly string[] };
  git.dirtyPaths = () => [];

  let verifierCalls = 0;
  const mutable = orchestrator as unknown as Record<string, unknown>;
  mutable.verifyAcceptanceCriteria = () => {
    verifierCalls += 1;
    if (!verification) {
      throw new Error('the verifier should not have been called');
    }
    return verification;
  };

  const runPlanTask = Reflect.get(orchestrator, 'planTask') as (featureId: string) => StepExecutionResult;
  return { result: runPlanTask.call(orchestrator, FEATURE_ID), verifierCalls };
}

describe('allCriteriaMet', () => {
  test('an unverifiable criterion counts against closing', () => {
    const verification: AcceptanceCriteriaVerification = {
      feature_id: FEATURE_ID,
      summary: 'mixed',
      verdicts: [
        { criterion: 'a', status: 'met', evidence: 'src/a.ts' },
        { criterion: 'b', status: 'unverifiable', evidence: 'nothing read covers this' },
      ],
    };

    expect(allCriteriaMet(verification)).toBe(false);
    expect(unmetCriteria(verification).map((verdict) => verdict.criterion)).toEqual(['b']);
  });

  test('an empty verdict list never closes a feature', () => {
    expect(allCriteriaMet({ feature_id: FEATURE_ID, summary: 'none', verdicts: [] })).toBe(false);
  });

  test('every criterion met closes it', () => {
    expect(
      allCriteriaMet({
        feature_id: FEATURE_ID,
        summary: 'all good',
        verdicts: [{ criterion: 'a', status: 'met', evidence: 'src/a.ts' }],
      }),
    ).toBe(true);
  });
});

describe('an exhausted outline can now close a feature', () => {
  test('marks the feature completed and records why, when every criterion is met', () => {
    const workspace = createWorkspace();

    try {
      const { result, verifierCalls } = planTask(workspace, {
        feature_id: FEATURE_ID,
        summary: 'Both criteria are satisfied by the implementation and its tests.',
        verdicts: [
          { criterion: 'the thing is done', status: 'met', evidence: 'src/thing.ts' },
          { criterion: 'the thing is tested', status: 'met', evidence: 'tests/thing.test.ts' },
        ],
      });

      expect(verifierCalls).toBe(1);
      expect(result.kind).toBe('advanced');
      expect(result.continueLoop).toBe(true);

      const state = readFileSync(workspace.statePath, 'utf8');
      expect(state).toContain('## Lifecycle State\n\ncompleted');
      expect(state).toContain('## Remaining Deliverables\n\n- None');
      // The verdicts are the record of why it was closed -- the one thing a bare `completed`
      // never says.
      expect(state).toContain('the thing is done — met (src/thing.ts)');
      expect(state).toContain('the thing is tested — met (tests/thing.test.ts)');
    } finally {
      workspace.dispose();
    }
  });

  test('blocks and names the unmet criteria instead of closing', () => {
    const workspace = createWorkspace();

    try {
      const { result } = planTask(workspace, {
        feature_id: FEATURE_ID,
        summary: 'One criterion has no supporting evidence.',
        verdicts: [
          { criterion: 'the thing is done', status: 'met', evidence: 'src/thing.ts' },
          { criterion: 'the thing is tested', status: 'unmet', evidence: 'no test file references it' },
        ],
      });

      expect(result.kind).toBe('blocked');
      expect(result.summary).toContain('the thing is tested');

      const state = readFileSync(workspace.statePath, 'utf8');
      expect(state).toContain('## Lifecycle State\n\nblocked');
      expect(state).not.toContain('## Lifecycle State\n\ncompleted');
    } finally {
      workspace.dispose();
    }
  });
});

describe('the cheap deterministic checks run before the AI call', () => {
  test('an unfinished active task blocks without asking the verifier', () => {
    const workspace = createWorkspace({ activeTask: 'F400-T01' });

    try {
      const { result, verifierCalls } = planTask(workspace, null);

      expect(verifierCalls).toBe(0);
      expect(result.kind).toBe('blocked');
      expect(result.summary).toContain('F400-T01');
    } finally {
      workspace.dispose();
    }
  });

  test('a failed quality gate blocks without asking the verifier', () => {
    const workspace = createWorkspace({ gateResult: 'failed' });

    try {
      const { result, verifierCalls } = planTask(workspace, null);

      expect(verifierCalls).toBe(0);
      expect(result.kind).toBe('blocked');
      expect(result.summary).toContain('quality gate');
    } finally {
      workspace.dispose();
    }
  });

  test('a review that requested changes blocks without asking the verifier', () => {
    const workspace = createWorkspace({ reviewResult: 'changes_required' });

    try {
      const { result, verifierCalls } = planTask(workspace, null);

      expect(verifierCalls).toBe(0);
      expect(result.kind).toBe('blocked');
    } finally {
      workspace.dispose();
    }
  });

  test('a feature with no acceptance criteria cannot be closed, and costs no AI call', () => {
    const workspace = createWorkspace({ criteria: [] });

    try {
      const { result, verifierCalls } = planTask(workspace, null);

      expect(verifierCalls).toBe(0);
      expect(result.kind).toBe('blocked');
      expect(result.summary).toContain('no acceptance criteria');
    } finally {
      workspace.dispose();
    }
  });
});
