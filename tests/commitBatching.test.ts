import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import {
  MAX_RENDERED_TRAIL_ENTRIES,
  renderTaskCommitMessage,
  type TaskCommitTrailEntry,
} from '../src/orchestrator/taskCommitTrail.js';
import { copyContractsIntoWorkspace, createTempWorkspace, readFixtureConfigMarkdown, type TempWorkspace } from './testUtils.js';

// 025-automated-development-loop: every internal step used to commit for itself, so one unit of
// work landed as three or four commits and the history read as telemetry. Nothing tested any of
// that -- the whole commit surface had exactly one test anywhere in the suite, on an unrelated
// path -- so these pin both halves: the bookkeeping steps stop being commit boundaries, and what
// they would have said survives in the body of the one commit the task does produce.

const FEATURE_ID = '500-batching-target';
const TASK_ID = 'F500-T01';

function entry(step: string, detail: string): TaskCommitTrailEntry {
  return { step, detail, at: '2026-08-22T00:00:00.000Z' };
}

function featureState(lifecycleState: string, activeTask: string): string {
  return [
    '# State: Batching Target',
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
    '- last_implementation_result: not_run',
    '- last_quality_gate_result: unknown',
    '- last_review_result: not_run',
    '- validation: confirmed',
    '',
    '## Current Reality',
    '',
    'Fixture.',
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

const PROJECT_STATE = [
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

const TASK_DOCUMENT = [
  `# Task: ${TASK_ID}`,
  '',
  '## Objective',
  '',
  'Fixture task.',
  '',
].join('\n');

function createWorkspace(lifecycleState = 'task_ready'): TempWorkspace {
  const workspace = createTempWorkspace({
    files: {
      'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
      'compassrose/PROJECT_STATE.md': PROJECT_STATE,
      [`compassrose/features/${FEATURE_ID}/request.md`]: '# Request\n',
      [`compassrose/features/${FEATURE_ID}/feature.md`]: '# Feature\n',
      [`compassrose/features/${FEATURE_ID}/architecture.md`]: '# Architecture\n',
      [`compassrose/features/${FEATURE_ID}/state.md`]: featureState(lifecycleState, TASK_ID),
      // A fix alongside the feature: ensureCleanWorktreeIfRequired only ever allowed dirt under
      // the *feature* directory, which no caller noticed while planning committed for itself.
      'compassrose/fixes/500-batching-fix/request.md': '# Fix request\n',
      'compassrose/fixes/500-batching-fix/fix.md': '# Fix\n',
      'compassrose/fixes/500-batching-fix/state.md': featureState('formalized', 'none'),
    },
  });
  copyContractsIntoWorkspace(workspace.root);

  execFileSync('git', ['init', '--quiet'], { cwd: workspace.root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspace.root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspace.root });
  execFileSync('git', ['add', '-A'], { cwd: workspace.root });
  execFileSync('git', ['commit', '--quiet', '-m', 'initial commit'], { cwd: workspace.root });

  return workspace;
}

function gitLog(root: string): string {
  return execFileSync('git', ['log', '--format=%B%x00'], { cwd: root, encoding: 'utf8' });
}

function commitSubjects(root: string): string[] {
  return execFileSync('git', ['log', '--format=%s'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function dirtyPaths(root: string): string[] {
  return execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.slice(3).trim())
    .filter((line) => line.length > 0);
}

interface Access {
  planSubtask: (taskId: string) => void;
  recordTaskTrail: (taskId: string, step: string, detail: string) => void;
  commitTaskArc: (taskId: string, subject: string) => void;
  ensureCleanWorktreeIfRequired: (id: string) => void;
  loadTask: (taskId: string) => unknown;
}

function asAccess(orchestrator: CompassRoseOrchestrator): Access {
  return orchestrator as unknown as Access;
}

function buildOrchestrator(workspace: TempWorkspace, commit = true): CompassRoseOrchestrator {
  const orchestrator = new CompassRoseOrchestrator({
    loop: false,
    commit,
    cwd: workspace.root,
    implementer: 'opencode',
  });
  // planSubtask() only needs the task's id; loading the real document would drag the whole
  // planner artifact chain into a test about commit boundaries.
  asAccess(orchestrator).loadTask = () => ({ taskId: TASK_ID, featureId: FEATURE_ID });
  return orchestrator;
}

describe('renderTaskCommitMessage', () => {
  test('is just the subject when the task has no recorded trail', () => {
    // A task planned before the trail existed, or one whose artifact could not be read. The commit
    // must still happen; only its body degrades.
    expect(renderTaskCommitMessage('proto: complete task F1-T1', [])).toBe('proto: complete task F1-T1');
  });

  test('renders the trail as the commit body, in order, after a blank line', () => {
    const message = renderTaskCommitMessage('proto: complete task F1-T1', [
      entry('planned', 'Add the widget'),
      entry('implemented', 'opencode, 3 file(s) changed'),
      entry('review', 'approved'),
    ]);

    expect(message).toBe(
      [
        'proto: complete task F1-T1',
        '',
        '- planned: Add the widget',
        '- implemented: opencode, 3 file(s) changed',
        '- review: approved',
      ].join('\n'),
    );
  });

  test('bounds the body and says how much it left out', () => {
    const entries = Array.from({ length: MAX_RENDERED_TRAIL_ENTRIES + 5 }, (_, index) => entry('retry', `attempt ${index}`));
    const lines = renderTaskCommitMessage('proto: complete task F1-T1', entries).split('\n');

    // subject + blank + capped entries + the one truncation line
    expect(lines).toHaveLength(MAX_RENDERED_TRAIL_ENTRIES + 3);
    expect(lines.at(-1)).toBe('- ... and 5 earlier step(s); full detail in .git/proto-compassrose/');
  });
});

describe('one commit per task arc', () => {
  let workspace: TempWorkspace | null = null;

  afterEach(() => {
    workspace?.dispose();
    workspace = null;
  });

  test('moving a task into implementation writes state but does not commit', () => {
    workspace = createWorkspace();
    const orchestrator = buildOrchestrator(workspace);

    asAccess(orchestrator).planSubtask(TASK_ID);

    expect(commitSubjects(workspace.root)).toEqual(['initial commit']);
    expect(dirtyPaths(workspace.root)).toContain(`compassrose/features/${FEATURE_ID}/state.md`);
    const state = readFileSync(join(workspace.root, 'compassrose', 'features', FEATURE_ID, 'state.md'), 'utf8');
    expect(state).toContain('implementation_running');
  });

  test('the arc commit carries the whole trail as its body and sweeps the uncommitted task document', () => {
    workspace = createWorkspace();
    const orchestrator = buildOrchestrator(workspace);
    const access = asAccess(orchestrator);

    // The task document is untracked at this point, exactly as it is once planning stopped
    // committing for itself: the arc commit is the only thing that can pick it up.
    const tasksDirectory = join(workspace.root, 'compassrose', 'features', FEATURE_ID, 'tasks');
    mkdirSync(tasksDirectory, { recursive: true });
    writeFileSync(join(tasksDirectory, `${TASK_ID}.md`), TASK_DOCUMENT, 'utf8');

    access.recordTaskTrail(TASK_ID, 'planned', 'Fixture task');
    access.planSubtask(TASK_ID);
    access.recordTaskTrail(TASK_ID, 'implemented', 'opencode, 2 file(s) changed');
    access.recordTaskTrail(TASK_ID, 'quality gates', 'typecheck passed, tests passed');
    access.recordTaskTrail(TASK_ID, 'review', 'approved');
    access.commitTaskArc(TASK_ID, `proto: complete task ${TASK_ID}`);

    expect(commitSubjects(workspace.root)).toEqual([`proto: complete task ${TASK_ID}`, 'initial commit']);
    expect(dirtyPaths(workspace.root)).toEqual([]);

    const body = gitLog(workspace.root);
    expect(body).toContain('- planned: Fixture task');
    expect(body).toContain('- prepared: task_ready -> implementation_running');
    expect(body).toContain('- implemented: opencode, 2 file(s) changed');
    expect(body).toContain('- quality gates: typecheck passed, tests passed');
    expect(body).toContain('- review: approved');

    const committed = execFileSync('git', ['show', '--name-only', '--format=', 'HEAD'], {
      cwd: workspace.root,
      encoding: 'utf8',
    });
    expect(committed).toContain(`compassrose/features/${FEATURE_ID}/tasks/${TASK_ID}.md`);
  });

  test('the trail belongs to one arc and is not inherited by the next', () => {
    workspace = createWorkspace();
    const orchestrator = buildOrchestrator(workspace);
    const access = asAccess(orchestrator);

    access.recordTaskTrail(TASK_ID, 'planned', 'first arc');
    access.planSubtask(TASK_ID);
    access.commitTaskArc(TASK_ID, `proto: complete task ${TASK_ID}`);

    writeFileSync(join(workspace.root, 'compassrose', 'PROJECT_STATE.md'), `${PROJECT_STATE}\nsecond arc\n`, 'utf8');
    access.commitTaskArc(TASK_ID, 'proto: second arc');

    const head = execFileSync('git', ['log', '-1', '--format=%B'], { cwd: workspace.root, encoding: 'utf8' }).trim();
    expect(head).toBe('proto: second arc');
  });

  test('a trail is still recorded when the run is not committing', () => {
    // --no-commit is exactly the run whose steps would otherwise leave no trace at all.
    workspace = createWorkspace();
    const orchestrator = buildOrchestrator(workspace, false);
    asAccess(orchestrator).recordTaskTrail(TASK_ID, 'planned', 'recorded without committing');

    const trail = JSON.parse(
      readFileSync(join(workspace.root, '.git', 'proto-compassrose', 'task-trails', `${TASK_ID}.json`), 'utf8'),
    );
    expect(trail).toHaveLength(1);
    expect(trail[0].detail).toBe('recorded without committing');
    expect(commitSubjects(workspace.root)).toEqual(['initial commit']);
  });
});

describe('the clean-worktree precondition after batching', () => {
  let workspace: TempWorkspace | null = null;

  afterEach(() => {
    workspace?.dispose();
    workspace = null;
  });

  test('tolerates the uncommitted plan a previous step deliberately left behind', () => {
    workspace = createWorkspace();
    const orchestrator = buildOrchestrator(workspace);
    asAccess(orchestrator).planSubtask(TASK_ID);

    expect(() => asAccess(orchestrator).ensureCleanWorktreeIfRequired(FEATURE_ID)).not.toThrow();
  });

  test('tolerates a dirty fix directory, which it never did before', () => {
    // Latent while planning committed for itself: the precondition allowed dirt under
    // compassrose/features/<id> only, so a fix's own uncommitted state.md was reported as a
    // disallowed dirty path the moment its next task was planned.
    workspace = createWorkspace();
    const orchestrator = buildOrchestrator(workspace);
    writeFileSync(
      join(workspace.root, 'compassrose', 'fixes', '500-batching-fix', 'state.md'),
      featureState('task_planning_pending', 'none'),
      'utf8',
    );

    expect(() => asAccess(orchestrator).ensureCleanWorktreeIfRequired('500-batching-fix')).not.toThrow();
  });

  test('still refuses a dirty path outside the active work item entirely', () => {
    workspace = createWorkspace();
    const orchestrator = buildOrchestrator(workspace);
    writeFileSync(join(workspace.root, 'src', 'stray.ts'), 'export const stray = 1;\n', 'utf8');

    expect(() => asAccess(orchestrator).ensureCleanWorktreeIfRequired(FEATURE_ID)).toThrow(/stray\.ts/);
  });
});
