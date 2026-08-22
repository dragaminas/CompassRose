import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { StepOutcomeKind } from '../contracts/runtime/protoRuntime.js';

/**
 * How a run reports itself to a watching parent process, and how that parent asks it to stop
 * (023-terminal-session).
 *
 * ## Why files, and not IPC
 *
 * `run()` is synchronous from end to end -- every adapter call is `spawnSync` -- so while it runs,
 * the running process's event loop does not turn. That is deliberate and is what makes the loop
 * deterministic, but it rules out both halves of the obvious design:
 *
 * - `process.send()` is asynchronous. A step event sent from inside `run()` would sit unflushed
 *   until the run ended, which is exactly when it stops being live.
 * - `process.on('message')` never fires mid-run for the same reason, so a stop request cannot be
 *   delivered over IPC either.
 *
 * Both directions therefore go through the filesystem, where a synchronous write is visible to
 * another process immediately. `src/orchestrator/smokeGate.ts` solves the mirror image of this
 * problem the same way, for the same reason: there, the *parent* is blocked and the child records
 * its exit code to a file.
 *
 * The event log is append-only newline-delimited JSON. A reader may catch a half-written final
 * line, so `decodeRunEvents` only ever returns events from lines that are terminated.
 */
export interface RunStepStartEvent {
  readonly type: 'step-start';
  readonly kind: string;
  readonly itemId: string | null;
  readonly taskId: string | null;
}

export interface RunStepEndEvent {
  readonly type: 'step-end';
  readonly kind: string;
  readonly itemId: string | null;
  readonly taskId: string | null;
  readonly outcome: StepOutcomeKind;
  readonly summary: string;
}

export type RunEvent = RunStepStartEvent | RunStepEndEvent;

export function encodeRunEvent(event: RunEvent): string {
  return `${JSON.stringify(event)}\n`;
}

function isRunEvent(value: unknown): value is RunEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return candidate.type === 'step-start' || candidate.type === 'step-end';
}

/**
 * Every event the log holds so far, from terminated lines only.
 *
 * A malformed line is skipped rather than throwing: the reader is a display, and a display that
 * dies because one line arrived garbled is worse than one that misses a step.
 */
export function decodeRunEvents(text: string): RunEvent[] {
  const events: RunEvent[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isRunEvent(parsed)) {
        events.push(parsed);
      }
    } catch {
      // A half-written final line, or a line from a version that wrote something else.
    }
  }

  return events;
}

export function appendRunEvent(path: string, event: RunEvent): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, encodeRunEvent(event), 'utf8');
  } catch {
    // The run is the work; its narration is not. A log that cannot be written must never take a
    // run down with it.
  }
}

export function readRunEvents(path: string): RunEvent[] {
  try {
    return decodeRunEvents(readFileSync(path, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Asks the run to stop at its next checkpoint.
 *
 * Deliberately not an abort: the runtime notices this where it already checks for a controlled
 * stop, so a step in flight is allowed to finish rather than leaving the worktree half-written.
 * Terminating the process tree is a separate, harder action the caller takes on its own.
 */
export function requestRunStop(path: string, reason: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${reason}\n`, 'utf8');
}

export function readRunStopRequest(path: string): string | null {
  try {
    const reason = readFileSync(path, 'utf8').trim();
    return reason.length > 0 ? reason : 'Stop requested.';
  } catch {
    return null;
  }
}

export function clearRunChannel(eventLogPath: string, stopFilePath: string): void {
  for (const path of [eventLogPath, stopFilePath]) {
    rmSync(path, { force: true });
  }
}
