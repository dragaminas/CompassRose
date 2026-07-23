import { dirname, join } from 'node:path';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { normalizeTextForWrite } from '../filesystem/textNormalization.js';
import { isDirectory } from '../filesystem/pathResolver.js';
import { escapeRegExp } from '../markdown/sections.js';

export function compareFeatureIds(left: string, right: string): number {
  const leftNumber = Number.parseInt(left.split('-')[0] ?? '0', 10);
  const rightNumber = Number.parseInt(right.split('-')[0] ?? '0', 10);
  return leftNumber - rightNumber;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readRecordString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function readPositiveInteger(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

export function createRunId(): string {
  return `run-${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '--').replace('Z', '')}`;
}

const RECOVERY_LESSON_NOTE_HEAD_CHARS = 600;
const RECOVERY_LESSON_NOTE_TAIL_CHARS = 400;
const RECOVERY_LESSON_NOTE_MAX_CHARS = RECOVERY_LESSON_NOTE_HEAD_CHARS + RECOVERY_LESSON_NOTE_TAIL_CHARS;

/**
 * Bounds a recovery lesson's `implementation_notes` before it is ever written to disk.
 *
 * extractImplementationNotes() (src/implementer/implementationNotes.ts) falls back to the
 * implementer's ENTIRE raw reply when no literal `## Implementation Notes` heading is found --
 * a deliberate, documented choice to avoid discarding a legitimate outcome over a formatting
 * miss. But every recovery lesson gets replayed verbatim into every later planning/implementation
 * prompt for the same feature (buildRecoveryLessonPromptLines, up to 5 lessons), so an unbounded
 * fallback there compounds: a real production prompt reached ~295KB across a six-recovery chain
 * for a single task, most of it multiple copies of the same rambling multi-thousand-word replies.
 * This is the one field in a recovery lesson with no schema-enforced size (findings, adjustments,
 * etc. come from a separate structured call with its own contract) and no natural task-scoped
 * bound, so it is the one place a hard cap belongs. Keeps the head (usually states what was
 * attempted) and tail (usually states the outcome/status) and elides the noisy middle, which for
 * a rambling transcript carries the least signal per character.
 */
export function boundRecoveryLessonNotes(notes: string | null): string | null {
  if (notes === null) {
    return null;
  }

  if (notes.length <= RECOVERY_LESSON_NOTE_MAX_CHARS) {
    return notes;
  }

  const head = notes.slice(0, RECOVERY_LESSON_NOTE_HEAD_CHARS).trimEnd();
  const tail = notes.slice(notes.length - RECOVERY_LESSON_NOTE_TAIL_CHARS).trimStart();
  const omitted = notes.length - head.length - tail.length;
  return `${head}\n\n...[${omitted} characters omitted for context size]...\n\n${tail}`;
}

export function statSafeIsFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function writeText(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, normalizeTextForWrite(contents), 'utf8');
}

export function requireString(value: string | null, field: string): string {
  if (!value) {
    throw new Error(`Missing required field ${field}.`);
  }

  return value;
}

export function requireNonNoneValue(value: string | null | undefined, message: string): string {
  if (!value || value === 'none') {
    throw new Error(message);
  }

  return value;
}

export function primaryTaskAnchorFromId(taskId: string): string {
  const match = taskId.match(/^(F\d+-T\d+)/);
  return match?.[1] ?? taskId;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}

const ANSI_ESCAPE_PATTERN = /\x1b\[[0-9;]*m/g;
// Matches repo-relative-looking source/test/doc paths, optionally followed by :line or
// :line:col (as vitest/node stack traces print them), e.g. "tests/foo.test.ts:12:34".
// Deliberately only matches forward-slash paths built from ASCII path characters: an absolute
// Windows path (backslashes) won't match, which is fine -- extractReferencedPaths() is a
// best-effort signal used only to decide whether a gate failure is safe to double-check against
// a clean baseline, and it is safer to extract nothing than to guess wrong.
const REFERENCED_PATH_PATTERN = /([A-Za-z0-9_.\/-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md))(?::\d+(?::\d+)?)?/g;

/**
 * Best-effort extraction of source/test file paths a failing command's output points to (e.g.
 * vitest's "FAIL tests/foo.test.ts" summary lines, or a stack trace's "at ... (path:line:col)").
 * Used to judge whether a quality-gate failure is plausibly related to a task's own allowed_paths
 * before spending the cost of confirming it against a clean baseline. `node_modules` paths are
 * excluded since a failure inside a dependency is never attributable to the task's own scope.
 */
export function extractReferencedPaths(output: string): string[] {
  const stripped = output.replace(ANSI_ESCAPE_PATTERN, '');
  const paths = new Set<string>();

  for (const match of stripped.matchAll(REFERENCED_PATH_PATTERN)) {
    const path = match[1];
    if (!path || path.includes('node_modules/')) {
      continue;
    }

    // A match immediately preceded by a backslash is a fragment of a longer absolute Windows
    // path this pattern can't safely reconstruct (e.g. "orchestrator.ts" out of
    // "C:\repo\src\orchestrator\orchestrator.ts") -- discard it rather than treat a truncated
    // basename as if it were the real repo-relative path.
    const precedingChar = match.index !== undefined && match.index > 0 ? stripped[match.index - 1] : undefined;
    if (precedingChar === '\\') {
      continue;
    }

    paths.add(path);
  }

  return [...paths];
}

function correctionSuffixDepth(anchor: string): number {
  return anchor.match(/-C\d+/g)?.length ?? 0;
}

function highestCorrectionNumber(tasksDirectory: string, anchor: string): number {
  if (!isDirectory(tasksDirectory)) {
    return 0;
  }

  const pattern = new RegExp('`' + escapeRegExp(anchor) + '-C(\\d+)(?:-C\\d+)*`', 'g');
  let highest = 0;

  for (const entry of readdirSync(tasksDirectory)) {
    if (!entry.endsWith('.md')) {
      continue;
    }

    const markdown = readFileSync(join(tasksDirectory, entry), 'utf8');
    for (const match of markdown.matchAll(pattern)) {
      highest = Math.max(highest, Number.parseInt(match[1] ?? '0', 10));
    }
  }

  return highest;
}

/**
 * Returns the next state-correction task id when both the active anchor depth
 * and its same-anchor correction count remain below the configured limit.
 */
export function limitStateCorrectionTaskId(
  tasksDirectory: string,
  anchor: string,
  limit: number,
): string | null {
  if (limit <= 0 || correctionSuffixDepth(anchor) >= limit) {
    return null;
  }

  const highest = highestCorrectionNumber(tasksDirectory, anchor);
  if (highest >= limit) {
    return null;
  }

  return `${anchor}-C${highest + 1}`;
}
