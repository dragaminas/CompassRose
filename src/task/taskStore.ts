import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { StoredTaskArtifact } from '../contracts/task/taskContracts.js';
import type { ImplementationAttemptHistory } from '../contracts/runtime/attempts.js';
import { isDirectory } from '../filesystem/pathResolver.js';
import { readUtf8 } from '../filesystem/textNormalization.js';
import { parseTaskDocument } from './taskDocument.js';

/**
 * Finds the on-disk path of the task document whose `## Task ID` section matches `taskId`,
 * searching every `.md` file directly under each of `searchRoots` in turn. Throws if no
 * document claims that id anywhere.
 */
export function findTaskDocumentPath(taskId: string, searchRoots: readonly string[]): string {
  for (const root of searchRoots) {
    if (!isDirectory(root)) {
      continue;
    }

    for (const entry of readdirSync(root)) {
      if (!entry.endsWith('.md')) {
        continue;
      }

      const fullPath = join(root, entry);
      const markdown = readUtf8(fullPath);
      try {
        if (parseTaskDocument(fullPath, markdown).taskId === taskId) {
          return fullPath;
        }
      } catch {
        continue;
      }
    }
  }

  throw new Error(`Task document for ${taskId} was not found.`);
}

export function tryFindTaskDocumentPath(taskId: string, searchRoots: readonly string[]): string | null {
  try {
    return findTaskDocumentPath(taskId, searchRoots);
  } catch {
    return null;
  }
}

// Task/correction/state-correction ids are proposed by an LLM call and never
// otherwise checked for uniqueness before being written. A planner that echoes a stale id
// (e.g. re-deriving already-completed correction work from state-doc history) silently
// overwrites that id's stored JSON artifact and leaves two task documents claiming the same
// id, making findTaskDocumentPath() ambiguous from then on. Fail loudly before writing
// anything instead of corrupting the existing task's history.
export function assertTaskIdIsUnused(tasksDirectory: string, taskId: string, context: string, repositoryRoot: string): void {
  const existingPath = tryFindTaskDocumentPath(taskId, [tasksDirectory]);
  if (existingPath) {
    throw new Error(
      `${context} proposed task id \`${taskId}\`, but a task document already claims that id at ${relative(repositoryRoot, existingPath)}. Task ids must be unique; this would silently overwrite that task's stored history.`,
    );
  }
}

/**
 * Breaks filesystem-mtime ties with the file name: two artifacts written back-to-back (e.g.
 * during planning followed immediately by a correction) can land on the same timestamp when
 * mtime resolution is coarser than the gap between the writes, which otherwise makes "latest"
 * resolve arbitrarily instead of deterministically.
 */
function sortArtifactsByRecency<T extends { readonly name: string; readonly mtimeMs: number }>(
  artifacts: readonly T[],
): T[] {
  return [...artifacts].sort((left, right) => right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name));
}

export function findLatestTaskArtifactTaskId(
  taskArtifacts: readonly { readonly name: string; readonly mtimeMs: number }[],
  readTaskArtifact: (fileName: string) => StoredTaskArtifact | null,
  featureId: string,
): string | null {
  for (const artifact of sortArtifactsByRecency(taskArtifacts)) {
    if (!artifact.name.endsWith('.json')) {
      continue;
    }

    const stored = readTaskArtifact(artifact.name);
    const task = stored?.task;
    if (!task || task.feature_id !== featureId) {
      continue;
    }

    if (typeof task.task_id !== 'string' || task.task_id.trim().length === 0) {
      continue;
    }

    return task.task_id;
  }

  return null;
}

export function findLatestImplementationAttemptTaskId(
  attemptArtifacts: readonly { readonly name: string; readonly mtimeMs: number }[],
  readAttemptHistory: (fileName: string) => ImplementationAttemptHistory | null,
  readTaskArtifactByTaskId: (taskId: string) => StoredTaskArtifact | null,
  featureId: string,
): string | null {
  for (const artifact of sortArtifactsByRecency(attemptArtifacts)) {
    if (!artifact.name.endsWith('.json') || artifact.name.includes('.attempt-')) {
      continue;
    }

    const history = readAttemptHistory(artifact.name);
    const taskId = history?.task_id;
    if (typeof taskId !== 'string' || taskId.trim().length === 0) {
      continue;
    }

    const stored = readTaskArtifactByTaskId(taskId);
    if (stored?.task?.feature_id !== featureId) {
      continue;
    }

    return taskId;
  }

  return null;
}
