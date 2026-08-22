/**
 * The live view of a running loop.
 *
 * Split deliberately in two, matching how `TerminalWriter` works: a completed step becomes one
 * permanent appended line, and only the step currently in flight lives in the transient frame. That
 * split is what makes the run readable after the fact -- scrollback holds one line per step, with
 * no redrawn spinner debris between them.
 */

export type StepStatus = 'running' | 'ok' | 'failed' | 'blocked' | 'skipped';

export interface ProgressStep {
  /** Short, fixed-width-ish verb: `plan`, `implement`, `gates`, `review`. */
  readonly label: string;
  /** What it did, in a few words. Empty is fine while a step is still running. */
  readonly detail: string;
  readonly status: StepStatus;
  readonly elapsedMs: number;
}

const STATUS_MARK: Readonly<Record<StepStatus, string>> = {
  running: '▸',
  ok: '✓',
  failed: '✗',
  blocked: '⊘',
  skipped: '·',
};

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;
const LABEL_WIDTH = 10;

export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m${String(seconds).padStart(2, '0')}s`;
}

export function renderRunHeader(itemId: string): string[] {
  return [`  ▸ ${itemId}`];
}

/** One permanent line for a step that has finished. */
export function renderCompletedStep(step: ProgressStep): string {
  const mark = STATUS_MARK[step.status];
  const label = step.label.padEnd(LABEL_WIDTH);
  const elapsed = formatElapsed(step.elapsedMs);
  return `  ${mark} ${label} ${step.detail}`.trimEnd() + `  ${elapsed}`;
}

/** The transient frame for the step currently in flight. */
export function renderRunningStep(step: ProgressStep, spinnerTick: number): string[] {
  const spinner = SPINNER_FRAMES[spinnerTick % SPINNER_FRAMES.length];
  const label = step.label.padEnd(LABEL_WIDTH);
  const elapsed = formatElapsed(step.elapsedMs);
  const detail = step.detail.length > 0 ? ` ${step.detail}` : '';
  return [`  ${spinner} ${label}${detail}`.trimEnd() + `  ${elapsed}`, '', '  esc to stop'];
}

export interface RunSummaryInput {
  readonly completed: readonly string[];
  readonly advanced: readonly { readonly itemId: string; readonly steps: number }[];
  readonly blocked: readonly { readonly itemId: string; readonly reason: string }[];
  readonly stoppedByHuman: boolean;
  readonly failure: string | null;
}

export function renderRunSummary(input: RunSummaryInput): string[] {
  const lines: string[] = [''];

  if (input.failure) {
    lines.push(`  Run stopped: ${input.failure}`);
  } else if (input.stoppedByHuman) {
    lines.push('  Run stopped at your request. State is saved.');
  } else {
    lines.push('  Run finished.');
  }

  for (const itemId of input.completed) {
    lines.push(`    completed  ${itemId}`);
  }
  for (const item of input.advanced) {
    lines.push(`    advanced   ${item.itemId} · ${item.steps} step${item.steps === 1 ? '' : 's'}`);
  }
  for (const item of input.blocked) {
    lines.push(`    blocked    ${item.itemId} · ${item.reason}`);
  }

  if (input.blocked.length > 0) {
    lines.push('');
    lines.push('  Type /desbloquear to work through a blocked item together.');
  }

  lines.push('');
  return lines;
}
