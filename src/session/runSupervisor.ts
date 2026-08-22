import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import {
  clearRunChannel,
  readRunEvents,
  requestRunStop,
  type RunEvent,
} from '../runtime/runChannel.js';

/**
 * The half of a run that keeps its event loop free (023-terminal-session).
 *
 * `run()` is synchronous, so a process executing it can neither animate anything nor read a
 * keypress until it finishes. Running it here, in the same process as the prompt, is why the live
 * view was drawn only at step boundaries and why `esc` did nothing at all.
 *
 * The run moves to a child process. This module watches it: it polls the child's event log (see
 * `src/runtime/runChannel.ts` for why that is a file and not IPC), redraws the frame on a timer,
 * and reads keys.
 *
 * ## What `esc` can and cannot do
 *
 * Two presses, two different things, and the difference is honest rather than cosmetic:
 *
 * - **Once** requests a controlled stop. The child notices it at its next checkpoint, so a step in
 *   flight is allowed to finish. On a long implementer call that is not immediate -- it lands when
 *   the agent returns. What changed is that the request is *taken* immediately and the view says so.
 * - **Twice** terminates the process tree, agent CLI included. That is immediate, and it can leave
 *   the worktree mid-write, which is why it takes a second, deliberate press.
 *
 * `Ctrl-C` is the second one: in raw mode it arrives as a keystroke rather than a signal, so this
 * module handles it explicitly instead of relying on a handler that would never run.
 */

export interface SupervisedRunEvents {
  /** A step began. */
  onStepStart(event: Extract<RunEvent, { type: 'step-start' }>): void;
  /** A step landed. */
  onStepEnd(event: Extract<RunEvent, { type: 'step-end' }>): void;
  /** Redraw the transient frame. Called on every tick, including while a step is in flight. */
  onTick(tick: number): void;
  /** Output the child wrote to stdout/stderr, already split into lines. */
  onOutput(lines: readonly string[]): void;
  /** The human asked to stop; `hard` is the second press. */
  onStopRequested(hard: boolean): void;
}

export interface SupervisedRunOptions {
  readonly repositoryRoot: string;
  readonly target: string | null;
  readonly events: SupervisedRunEvents;
  /** Overridable so tests can supervise something other than a real orchestrator. */
  readonly spawnChild?: (channel: RunChannelPaths) => ChildProcess;
  readonly pollIntervalMs?: number;
  /** Overridable so a non-interactive caller can supervise without touching the real stdin. */
  readonly input?: NodeJS.ReadStream;
}

export interface RunChannelPaths {
  readonly eventLogPath: string;
  readonly stopFilePath: string;
}

export interface SupervisedRunResult {
  readonly exitCode: number;
  readonly stopRequested: boolean;
  readonly terminated: boolean;
}

const DEFAULT_POLL_INTERVAL_MS = 90;
const ESC = '\u001b';
const CTRL_C = '\u0003';

export function runChannelPaths(repositoryRoot: string): RunChannelPaths {
  const root = join(repositoryRoot, '.git', 'proto-compassrose', 'session');
  return {
    eventLogPath: join(root, 'run-events.jsonl'),
    stopFilePath: join(root, 'stop-requested'),
  };
}

/**
 * Relaunches this same CLI as `compassrose run --loop`, carrying the loader flags the current
 * process was started with so a `tsx` session forks a `tsx` child and a compiled one forks node.
 */
function defaultSpawnChild(
  repositoryRoot: string,
  target: string | null,
  channel: RunChannelPaths,
): ChildProcess {
  const entryScript = process.argv[1];
  if (!entryScript) {
    throw new Error('Cannot supervise a run: this process has no entry script to relaunch.');
  }

  const args = [...process.execArgv, entryScript, 'run', '--loop', '--cwd', repositoryRoot];
  if (target) {
    args.push('--target', target);
  }

  return spawn(process.execPath, args, {
    cwd: repositoryRoot,
    // The parent owns the terminal: the child's own output is captured and re-emitted through the
    // writer, so it can never land in the middle of a redrawn frame.
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PROTO_COMPASSROSE_RUN_EVENT_LOG: channel.eventLogPath,
      PROTO_COMPASSROSE_STOP_FILE: channel.stopFilePath,
    },
  });
}

/** Kills the child and everything it started, including the agent CLI it is waiting on. */
function terminateTree(pid: number): void {
  if (process.platform === 'win32') {
    // `taskkill /T` is the only thing on Windows that reaches a grandchild; killing the child
    // alone leaves the agent CLI running and holding the worktree. Same reasoning, and the same
    // call, as src/orchestrator/smokeGate.ts.
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Already gone, which is the outcome we wanted.
    }
  }
}

function splitLines(chunk: string): string[] {
  return chunk.split(/\r?\n/).filter((line) => line.length > 0);
}

export async function superviseRun(options: SupervisedRunOptions): Promise<SupervisedRunResult> {
  const channel = runChannelPaths(options.repositoryRoot);
  clearRunChannel(channel.eventLogPath, channel.stopFilePath);

  const child = options.spawnChild
    ? options.spawnChild(channel)
    : defaultSpawnChild(options.repositoryRoot, options.target, channel);

  let emittedEvents = 0;
  let tick = 0;
  let stopRequested = false;
  let terminated = false;

  const drainEvents = (): void => {
    const events = readRunEvents(channel.eventLogPath);
    for (const event of events.slice(emittedEvents)) {
      if (event.type === 'step-start') {
        options.events.onStepStart(event);
      } else {
        options.events.onStepEnd(event);
      }
    }
    emittedEvents = events.length;
  };

  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => options.events.onOutput(splitLines(chunk)));
  child.stderr?.on('data', (chunk: string) => options.events.onOutput(splitLines(chunk)));

  const requestStop = (): void => {
    if (!stopRequested) {
      stopRequested = true;
      requestRunStop(channel.stopFilePath, 'Stop requested from the session.');
      options.events.onStopRequested(false);
      return;
    }

    if (!terminated && typeof child.pid === 'number') {
      terminated = true;
      options.events.onStopRequested(true);
      terminateTree(child.pid);
    }
  };

  const input = options.input ?? process.stdin;
  const rawModeAvailable = typeof input.setRawMode === 'function' && input.isTTY === true;
  const onKey = (chunk: Buffer | string): void => {
    const keys = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    if (keys.includes(CTRL_C)) {
      // Ctrl-C in raw mode is a keystroke, not a signal: nothing else will act on it, and the
      // human pressing it means "now", not "at the next checkpoint".
      stopRequested = true;
      requestStop();
      return;
    }
    if (keys.includes(ESC)) {
      requestStop();
    }
  };

  if (rawModeAvailable) {
    input.setRawMode(true);
    input.resume();
    input.on('data', onKey);
  }

  const timer = setInterval(() => {
    tick += 1;
    drainEvents();
    options.events.onTick(tick);
  }, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  // A polling timer must never be the reason a process stays alive.
  timer.unref?.();

  const exitCode = await new Promise<number>((resolveExit) => {
    child.once('error', () => resolveExit(1));
    child.once('close', (code, signal) => {
      // A terminated tree reports whatever signal killed it; the human asked for that, so it is a
      // controlled stop (130), not an engine failure.
      resolveExit(terminated || signal ? 130 : code ?? 1);
    });
  });

  clearInterval(timer);
  if (rawModeAvailable) {
    input.off('data', onKey);
    input.setRawMode(false);
    input.pause();
  }

  // One last drain: the child can write its final events and exit between two ticks.
  drainEvents();

  return { exitCode, stopRequested, terminated };
}
