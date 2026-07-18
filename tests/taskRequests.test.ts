import { describe, expect, test } from 'vitest';
import { checkTaskRequestContainment, selectNextTaskRequest, withWidenedScope } from '../src/orchestrator/taskRequests.js';
import type { TaskRequest } from '../src/contracts/planner/plannerContracts.js';

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
