import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  checkTaskRequestContainment,
  listExistingTaskIds,
  reconcileBackfilledTaskRequests,
  selectNextTaskRequest,
  stripBackfillMetadata,
  withUpdatedStatus,
  withWidenedScope,
} from '../src/orchestrator/taskRequests.js';
import type { BackfilledTaskRequest, TaskRequest } from '../src/contracts/planner/plannerContracts.js';
import { createTempWorkspace, type TempWorkspace } from './testUtils.js';

function buildTaskRequest(overrides: Partial<TaskRequest> = {}): TaskRequest {
  return {
    id: '1',
    title: 'Add the config loader',
    objective: 'Load and validate configuration from CONFIG.md.',
    scope: { allowed_paths: ['src/config', 'tests'], forbidden_paths: [] },
    status: 'not_started',
    sibling_check: { considered_features: [], belongs_to_other_feature: null },
    ...overrides,
  };
}

describe('selectNextTaskRequest', () => {
  test('picks the first not_started request', () => {
    const requests = [
      buildTaskRequest({ id: '1', status: 'complete' }),
      buildTaskRequest({ id: '2', status: 'not_started' }),
      buildTaskRequest({ id: '3', status: 'not_started' }),
    ];
    expect(selectNextTaskRequest(requests)?.id).toBe('2');
  });

  test('picks an in_progress request ahead of a later not_started one', () => {
    const requests = [
      buildTaskRequest({ id: '1', status: 'complete' }),
      buildTaskRequest({ id: '2', status: 'in_progress' }),
      buildTaskRequest({ id: '3', status: 'not_started' }),
    ];
    expect(selectNextTaskRequest(requests)?.id).toBe('2');
  });

  test('skips superseded requests', () => {
    const requests = [
      buildTaskRequest({ id: '1', status: 'superseded' }),
      buildTaskRequest({ id: '2', status: 'not_started' }),
    ];
    expect(selectNextTaskRequest(requests)?.id).toBe('2');
  });

  test('returns null when every request is complete or superseded', () => {
    const requests = [
      buildTaskRequest({ id: '1', status: 'complete' }),
      buildTaskRequest({ id: '2', status: 'superseded' }),
    ];
    expect(selectNextTaskRequest(requests)).toBeNull();
  });

  test('returns null for an empty list', () => {
    expect(selectNextTaskRequest([])).toBeNull();
  });
});

describe('checkTaskRequestContainment', () => {
  test('withinBounds is true when every allowed path is covered by the request scope', () => {
    const request = buildTaskRequest();
    const result = checkTaskRequestContainment(['src/config/loader.ts', 'tests/loader.test.ts'], request);
    expect(result.withinBounds).toBe(true);
    expect(result.exceedingPaths).toEqual([]);
  });

  test('withinBounds is false and reports exactly the exceeding paths', () => {
    const request = buildTaskRequest();
    const result = checkTaskRequestContainment(
      ['src/config/loader.ts', 'src/orchestrator/orchestrator.ts'],
      request,
    );
    expect(result.withinBounds).toBe(false);
    expect(result.exceedingPaths).toEqual(['src/orchestrator/orchestrator.ts']);
  });
});

describe('withWidenedScope', () => {
  test('appends the new paths to the named request only', () => {
    const requests = [
      buildTaskRequest({ id: '1', scope: { allowed_paths: ['src/config'], forbidden_paths: [] } }),
      buildTaskRequest({ id: '2', scope: { allowed_paths: ['src/other'], forbidden_paths: [] } }),
    ];
    const widened = withWidenedScope(requests, '1', ['src/orchestrator']);

    expect(widened.find((r) => r.id === '1')?.scope.allowed_paths).toEqual(['src/config', 'src/orchestrator']);
    expect(widened.find((r) => r.id === '2')?.scope.allowed_paths).toEqual(['src/other']);
  });

  test('does not duplicate a path that is already present', () => {
    const requests = [buildTaskRequest({ id: '1', scope: { allowed_paths: ['src/config'], forbidden_paths: [] } })];
    const widened = withWidenedScope(requests, '1', ['src/config']);
    expect(widened[0]?.scope.allowed_paths).toEqual(['src/config']);
  });
});

describe('withUpdatedStatus', () => {
  test('flips only the named request\'s status', () => {
    const requests = [
      buildTaskRequest({ id: '1', status: 'not_started' }),
      buildTaskRequest({ id: '2', status: 'not_started' }),
    ];
    const updated = withUpdatedStatus(requests, '1', 'in_progress');
    expect(updated.find((r) => r.id === '1')?.status).toBe('in_progress');
    expect(updated.find((r) => r.id === '2')?.status).toBe('not_started');
  });
});

function buildBackfilledTaskRequest(overrides: Partial<BackfilledTaskRequest> = {}): BackfilledTaskRequest {
  return { ...buildTaskRequest(), covers_existing_task_ids: [], ...overrides };
}

describe('listExistingTaskIds', () => {
  let workspace: TempWorkspace | undefined;

  afterEach(() => {
    workspace?.dispose();
    workspace = undefined;
  });

  test('reads the Task ID of every task document in the directory', () => {
    workspace = createTempWorkspace({
      files: {
        'tasks/001-add-the-loader.md': [
          '# Task 001: Add the loader',
          '',
          '## Task ID',
          '`F001-T01`',
          '',
          '## Parent Feature',
          '`001-widgets`',
          '',
          '## Goal',
          'Load configuration.',
          '',
          '## Scope',
          'Allowed:',
          '- `src/config/loader.ts`',
          '',
          'Forbidden:',
          '',
        ].join('\n'),
        'tasks/002-wire-it-up.md': [
          '# Task 002: Wire it up',
          '',
          '## Task ID',
          '`F001-T02`',
          '',
          '## Parent Feature',
          '`001-widgets`',
          '',
          '## Goal',
          'Wire the loader in.',
          '',
          '## Scope',
          'Allowed:',
          '- `src/orchestrator/orchestrator.ts`',
          '',
          'Forbidden:',
          '',
        ].join('\n'),
      },
    });

    expect(listExistingTaskIds(join(workspace.root, 'tasks')).sort()).toEqual(['F001-T01', 'F001-T02']);
  });

  test('returns an empty array when the tasks directory does not exist', () => {
    workspace = createTempWorkspace();
    expect(listExistingTaskIds(join(workspace.root, 'tasks'))).toEqual([]);
  });

  test('skips files that are not parseable task documents', () => {
    workspace = createTempWorkspace({
      files: {
        'tasks/not-a-task.md': '# Just some notes\n\nNothing structured here.\n',
      },
    });

    expect(listExistingTaskIds(join(workspace.root, 'tasks'))).toEqual([]);
  });
});

describe('reconcileBackfilledTaskRequests', () => {
  test('ok when every existing anchor is covered and no covering request is not_started', () => {
    const backfilled = [
      buildBackfilledTaskRequest({ id: '1', status: 'complete', covers_existing_task_ids: ['F001-T01'] }),
      buildBackfilledTaskRequest({ id: '2', status: 'not_started', covers_existing_task_ids: [] }),
    ];
    expect(reconcileBackfilledTaskRequests(backfilled, ['F001-T01'])).toEqual({ ok: true, reason: null });
  });

  test('fails when an existing anchor is not covered by any backfilled request', () => {
    const backfilled = [buildBackfilledTaskRequest({ id: '1', status: 'not_started', covers_existing_task_ids: [] })];
    const result = reconcileBackfilledTaskRequests(backfilled, ['F001-T01']);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('F001-T01');
  });

  test('fails when a covering request is left not_started', () => {
    const backfilled = [buildBackfilledTaskRequest({ id: '1', status: 'not_started', covers_existing_task_ids: ['F001-T01'] })];
    const result = reconcileBackfilledTaskRequests(backfilled, ['F001-T01']);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('1');
  });

  test('ok when there are no existing anchors at all', () => {
    expect(reconcileBackfilledTaskRequests([], [])).toEqual({ ok: true, reason: null });
  });
});

describe('stripBackfillMetadata', () => {
  test('removes covers_existing_task_ids from every request', () => {
    const backfilled = [buildBackfilledTaskRequest({ covers_existing_task_ids: ['F001-T01'] })];
    const stripped = stripBackfillMetadata(backfilled);
    expect(stripped[0]).not.toHaveProperty('covers_existing_task_ids');
    expect(stripped[0]?.id).toBe('1');
  });
});
