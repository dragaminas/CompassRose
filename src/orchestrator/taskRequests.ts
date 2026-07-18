import type { TaskRequest } from '../contracts/planner/plannerContracts.js';
import { pathsExceedingPrefixes } from '../shared/pathPrefix.js';
import { uniqueStrings } from '../shared/arrays.js';

/**
 * Deterministically picks the next task request to elaborate into a task: the first one (in
 * declared order) that isn't already complete or superseded. No LLM judgment call -- the order
 * was already fixed once, at feature formalization time.
 */
export function selectNextTaskRequest(requests: readonly TaskRequest[]): TaskRequest | null {
  return requests.find((request) => request.status === 'not_started' || request.status === 'in_progress') ?? null;
}

export interface TaskRequestContainmentResult {
  readonly withinBounds: boolean;
  readonly exceedingPaths: readonly string[];
}

/**
 * Deterministically checks an elaborated task's allowed_paths against its task request's
 * pre-declared, locked-in boundary -- directory-prefix containment (see
 * src/shared/pathPrefix.ts), not exact-set equality, since a task request necessarily names
 * coarser prefixes than the specific files a later task elaborates.
 */
export function checkTaskRequestContainment(
  taskAllowedPaths: readonly string[],
  request: TaskRequest,
): TaskRequestContainmentResult {
  const exceedingPaths = pathsExceedingPrefixes(taskAllowedPaths, request.scope.allowed_paths);
  return { withinBounds: exceedingPaths.length === 0, exceedingPaths };
}

/**
 * Persists an explicitly justified scope deviation back into the task request's own
 * allowed_paths, so later rendering (renderImplementationOutlineMarkdown) and the next task
 * request's own elaboration both see the feature's actual, current boundaries rather than a
 * stale picture from formalization time.
 */
export function withWidenedScope(
  requests: readonly TaskRequest[],
  requestId: string,
  additionalAllowedPaths: readonly string[],
): TaskRequest[] {
  return requests.map((request) =>
    request.id === requestId
      ? {
          ...request,
          scope: {
            ...request.scope,
            allowed_paths: uniqueStrings([...request.scope.allowed_paths, ...additionalAllowedPaths]),
          },
        }
      : request,
  );
}
