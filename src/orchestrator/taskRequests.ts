import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BackfilledTaskRequest, TaskRequest, TaskRequestStatus } from '../contracts/planner/plannerContracts.js';
import { pathsExceedingPrefixes } from '../shared/pathPrefix.js';
import { uniqueStrings } from '../shared/arrays.js';
import { parseTaskDocument } from '../task/taskDocument.js';

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

/**
 * Flips one task request's status by id, leaving every other request untouched -- the
 * code-driven counterpart to state.md's `## Outline Progress`, which is only ever regenerated
 * from this artifact, never hand-edited after formalization (see updateFeatureStateForTaskPlan/
 * updateFeatureStateAfterApprovedReview in orchestrator.ts).
 */
export function withUpdatedStatus(
  requests: readonly TaskRequest[],
  requestId: string,
  status: TaskRequestStatus,
): TaskRequest[] {
  return requests.map((request) => (request.id === requestId ? { ...request, status } : request));
}

/**
 * Lists every task document's own `## Task ID` directly under `tasksDirectory`, for a feature
 * being backfilled (see backfillTaskRequests() in orchestrator.ts). Reuses parseTaskDocument
 * (the same parser findTaskDocumentPath already relies on) instead of inventing new prose
 * parsing -- a malformed or unrelated file is simply skipped, matching that existing precedent.
 */
export function listExistingTaskIds(tasksDirectory: string): string[] {
  if (!existsSync(tasksDirectory)) {
    return [];
  }

  const taskIds: string[] = [];
  for (const entry of readdirSync(tasksDirectory)) {
    if (!entry.endsWith('.md')) {
      continue;
    }

    const fullPath = join(tasksDirectory, entry);
    try {
      taskIds.push(parseTaskDocument(fullPath, readFileSync(fullPath, 'utf8')).taskId);
    } catch {
      continue;
    }
  }

  return taskIds;
}

export interface BackfillReconciliation {
  readonly ok: boolean;
  readonly reason: string | null;
}

/**
 * Verifies a backfilled task_requests array actually accounts for every task anchor that
 * already exists for the feature, so a feature formalized before task requests existed can't
 * silently start from a baseline that doesn't match repository reality (e.g. every backfilled
 * item claiming not_started when five tasks are already done).
 */
export function reconcileBackfilledTaskRequests(
  backfilled: readonly BackfilledTaskRequest[],
  existingTaskAnchors: readonly string[],
): BackfillReconciliation {
  const coveredAnchors = new Set(backfilled.flatMap((request) => request.covers_existing_task_ids));
  const uncovered = existingTaskAnchors.filter((anchor) => !coveredAnchors.has(anchor));
  if (uncovered.length > 0) {
    return {
      ok: false,
      reason: `existing task anchor(s) not covered by any backfilled task request: ${uncovered.join(', ')}`,
    };
  }

  const misstated = backfilled.filter(
    (request) => request.covers_existing_task_ids.length > 0 && request.status === 'not_started',
  );
  if (misstated.length > 0) {
    return {
      ok: false,
      reason: `task request(s) ${misstated.map((request) => request.id).join(', ')} cover an existing task anchor but are marked not_started`,
    };
  }

  return { ok: true, reason: null };
}

/** Drops backfill-only metadata before task_requests is persisted -- see BackfilledTaskRequest. */
export function stripBackfillMetadata(requests: readonly BackfilledTaskRequest[]): TaskRequest[] {
  return requests.map(({ covers_existing_task_ids: _coversExistingTaskIds, ...request }) => request);
}
