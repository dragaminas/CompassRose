import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isDirectory } from '../filesystem/pathResolver.js';
import { readUtf8 } from '../filesystem/textNormalization.js';
import { escapeRegExp, slugify } from '../markdown/sections.js';

export function buildTaskFileName(taskId: string, title: string): string {
  const number = humanTaskNumber(taskId).replace(/^Task\s+/i, '').trim();
  return capTaskFileNameLength(`${number}-${slugify(title)}`, taskId);
}

export function buildCorrectionTaskFileName(correctionTaskId: string, title: string): string {
  const number = humanCorrectionNumber(correctionTaskId).replace(/^Task\s+/i, '').trim();
  return capTaskFileNameLength(`${number}-${slugify(title)}`, correctionTaskId);
}

// Deeply nested correction/recovery task ids (e.g. one task-id chain appending a suffix onto
// the previous one for several cycles) fall through humanTaskNumber/humanCorrectionNumber's
// short-form regexes unchanged, so the file base name can grow past Windows' ~260 character
// path limit once combined with a parent directory - breaking `git clone`/checkout for anyone
// working from a nested path (e.g. the e2e harness's temp clone). The file name is purely
// cosmetic: task lookup matches by the task's own `## Task ID` section, not by file name, so
// truncating here is safe. A short hash of the untruncated id keeps two different task ids
// that truncate to the same prefix from colliding on the same file.
export function capTaskFileNameLength(base: string, uniqueSeed: string, maxLength = 120): string {
  if (base.length <= maxLength) {
    return `${base}.md`;
  }

  const suffix = `-${createHash('sha1').update(uniqueSeed).digest('hex').slice(0, 8)}`;
  return `${base.slice(0, maxLength - suffix.length).replace(/-+$/, '')}${suffix}.md`;
}

export function buildStateCorrectionTaskId(tasksDirectory: string, activeTaskId: string): string {
  if (!isDirectory(tasksDirectory)) {
    return `${activeTaskId}-C1`;
  }

  const pattern = new RegExp('`' + escapeRegExp(activeTaskId) + '-C(\\d+)`', 'g');
  let highestCorrection = 0;

  for (const entry of readdirSync(tasksDirectory)) {
    if (!entry.endsWith('.md')) {
      continue;
    }

    const markdown = readUtf8(join(tasksDirectory, entry));
    for (const match of markdown.matchAll(pattern)) {
      highestCorrection = Math.max(highestCorrection, Number.parseInt(match[1] ?? '0', 10));
    }
  }

  return `${activeTaskId}-C${highestCorrection + 1}`;
}

export function humanTaskNumber(taskId: string): string {
  const unblockMatch = taskId.match(/-T(\d+)-U(\d+)$/);
  const unblockTaskNumber = unblockMatch?.[1];
  const unblockSequence = unblockMatch?.[2];
  if (unblockTaskNumber && unblockSequence) {
    return `${String(Number.parseInt(unblockTaskNumber, 10)).padStart(3, '0')}.U${Number.parseInt(unblockSequence, 10)}`;
  }

  const match = taskId.match(/-T(\d+)$/);
  const taskNumber = match?.[1];
  return taskNumber ? String(Number.parseInt(taskNumber, 10)).padStart(3, '0') : taskId;
}

export function humanCorrectionNumber(correctionTaskId: string): string {
  const match = correctionTaskId.match(/-T(\d+)-C(\d+)$/);
  const taskNumber = match?.[1];
  const correctionNumber = match?.[2];
  if (!taskNumber || !correctionNumber) {
    return correctionTaskId;
  }

  return `${String(Number.parseInt(taskNumber, 10)).padStart(3, '0')}.${Number.parseInt(correctionNumber, 10)}`;
}

/**
 * Wraps buildStateCorrectionTaskId with a finite correction-bound ceiling.
 *
 * Returns the next deterministic correction task id when the number of
 * existing corrections for `activeTaskId` is strictly less than `limit`.
 * Returns `null` when the boundary is reached or `limit` is non-positive.
 */
export function limitStateCorrectionTaskId(
  tasksDirectory: string,
  activeTaskId: string,
  limit: number,
): string | null {
  if (limit <= 0) {
    return null;
  }

  if (!isDirectory(tasksDirectory)) {
    if (limit >= 1) {
      return `${activeTaskId}-C1`;
    }
    return null;
  }

  const candidate = buildStateCorrectionTaskId(tasksDirectory, activeTaskId);
  const match = candidate.match(/-C(\d+)$/);
  const nextNumber = match?.[1] ? Number.parseInt(match[1], 10) : 0;

  if (nextNumber > limit) {
    return null;
  }

  return candidate;
}
