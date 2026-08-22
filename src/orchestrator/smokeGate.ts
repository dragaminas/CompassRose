/**
 * Checking that the application actually starts, before a feature is allowed to close
 * (029-runnable-application-gate).
 *
 * Every existing quality gate -- typecheck, tests, lint, build -- passes happily on an application
 * that does not start. "It compiles and its tests pass" is not "it runs", and until this existed
 * nothing in the system could tell the difference, despite the whole loop existing to end with a
 * running application.
 *
 * Synchronous throughout, matching the rest of the orchestrator: every adapter call in this codebase
 * is a `spawnSync`, and `run()` being synchronous is a documented constraint (see
 * `src/session/session.ts`). That rules out awaiting an HTTP poll, so liveness and readiness are
 * both checked through synchronous primitives -- `process.kill(pid, 0)` for "is it still there" and
 * a short-lived child process per probe for "does it answer".
 *
 * The hardest requirement is not the checking, it is the teardown: nothing this starts may outlive
 * it. A leaked server holds a port and breaks every subsequent run on the machine, including the
 * developer's own.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stripAnsiCodes } from './implementationDiagnostics.js';
import type { SmokeSection } from '../config/configTypes.js';

export type SmokeOutcome = 'passed' | 'failed' | 'skipped';

export interface SmokeResult {
  readonly outcome: SmokeOutcome;
  /** The command as invoked, or the opt-out reason when skipped. */
  readonly command: string;
  /** Which declared conditions were not satisfied, and what was observed instead. */
  readonly unmet: readonly string[];
  /** Captured output, ANSI-stripped and clipped. */
  readonly output: string;
  readonly timedOut: boolean;
}

/**
 * A tiny Node wrapper that runs the smoke command and records its exit code.
 *
 * Two problems it solves at once, both discovered the hard way in tests/smokeGate.test.ts:
 *
 * - **Reading the exit code.** This gate is synchronous by necessity (see the module header), and
 *   Node cannot observe a child's exit code without turning the event loop. Asking the shell to
 *   write it does not work on Windows: `%ERRORLEVEL%` is expanded when the line is *parsed*, so it
 *   holds the previous command's value, and neither `call` nor a temp `.cmd` recovers it reliably.
 * - **Tearing down the process tree.** `spawnSync`'s own `timeout` kills only the intermediate
 *   `cmd.exe` on Windows and leaves the real process running -- exactly the leak this gate must
 *   never produce. With the wrapper alive and holding the shell as its child, `taskkill /T` reaches
 *   the whole tree.
 */
const EXIT_CODE_WRAPPER = [
  'const {spawn} = require("child_process");',
  'const {writeFileSync} = require("fs");',
  'const [command, exitFile, outputFile] = process.argv.slice(1);',
  'let output = "";',
  'const flush = () => { try { writeFileSync(outputFile, output); } catch {} };',
  'const record = (code) => { flush(); try { writeFileSync(exitFile, String(code)); } catch {} process.exit(0); };',
  'const child = spawn(command, {shell: true, stdio: ["ignore", "pipe", "pipe"]});',
  'child.stdout.on("data", (chunk) => { output += chunk; });',
  'child.stderr.on("data", (chunk) => { output += chunk; });',
  // Flushed periodically as well as at exit, so a run killed on timeout still leaves the human
  // whatever the application managed to say before it hung.
  'const timer = setInterval(flush, 500); timer.unref();',
  'child.on("exit", (code) => record(code === null ? -1 : code));',
  'child.on("error", () => record(-1));',
  'process.on("SIGTERM", () => record(-1));',
].join('\n');

const OUTPUT_LIMIT = 2000;
const DEFAULT_TIMEOUT_SECONDS = 60;
const POLL_INTERVAL_MS = 500;
const PROBE_TIMEOUT_MS = 2000;
const TERMINATION_GRACE_MS = 2000;

function clip(text: string): string {
  const stripped = stripAnsiCodes(text).trim();
  return stripped.length > OUTPUT_LIMIT ? `${stripped.slice(0, OUTPUT_LIMIT)}...` : stripped;
}

/** Synchronous sleep. `Atomics.wait` on a never-signalled buffer is the only one Node offers. */
function sleepSync(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function isAlive(pid: number): boolean {
  try {
    // Signal 0 performs the permission and existence checks without delivering anything.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kills a process and everything it started.
 *
 * On Windows signals do not propagate to a process tree at all, so `taskkill /T` is the only thing
 * that reliably reaches children. Elsewhere, killing the negated pid reaches the process group,
 * which is why the child is spawned detached.
 */
function terminateTree(pid: number, force: boolean): void {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }

  try {
    process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM');
  } catch {
    try {
      process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
    } catch {
      // Already gone, which is the outcome we wanted.
    }
  }
}

/**
 * One readiness probe, in its own short-lived process because Node has no synchronous HTTP client.
 * Cheap enough at a 500ms poll interval, and it keeps the whole gate synchronous.
 */
function probeHttpSync(url: string): boolean {
  const script = [
    'const {get} = require(require("url").parse(process.argv[1]).protocol === "https:" ? "https" : "http");',
    'const r = get(process.argv[1], (res) => { res.resume(); process.exit(res.statusCode >= 200 && res.statusCode < 400 ? 0 : 1); });',
    'r.on("error", () => process.exit(1));',
    `r.setTimeout(${PROBE_TIMEOUT_MS}, () => { r.destroy(); process.exit(1); });`,
  ].join('\n');

  const result = spawnSync(process.execPath, ['-e', script, url], {
    timeout: PROBE_TIMEOUT_MS + 500,
    stdio: 'ignore',
  });

  return result.status === 0;
}

/**
 * Evaluates the declared conditions, returning the unmet ones -- each stating what was expected and
 * what was observed, so the evidence a human reads is actionable rather than "smoke failed".
 */
function evaluate(
  smoke: SmokeSection,
  observed: { exitCode: number | null; output: string; httpAnswered: boolean | null },
): string[] {
  const unmet: string[] = [];
  const expected = smoke.expect ?? {};

  if (expected.exit_code !== undefined && observed.exitCode !== expected.exit_code) {
    unmet.push(`expected exit code ${expected.exit_code}, observed ${observed.exitCode ?? 'none (still running)'}`);
  }

  if (expected.stdout_contains !== undefined && !observed.output.includes(expected.stdout_contains)) {
    unmet.push(`expected output to contain ${JSON.stringify(expected.stdout_contains)}, and it did not`);
  }

  if (expected.http_ok !== undefined && observed.httpAnswered !== true) {
    unmet.push(`expected ${expected.http_ok} to answer, and it did not`);
  }

  return unmet;
}

export interface RunSmokeGateOptions {
  readonly smoke: SmokeSection | undefined;
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
}

function skipped(command: string): SmokeResult {
  return { outcome: 'skipped', command, unmet: [], output: '', timedOut: false };
}

export function runSmokeGate(options: RunSmokeGateOptions): SmokeResult {
  const smoke = options.smoke;

  if (!smoke || (!smoke.command && !smoke.none)) {
    return skipped('no smoke check is configured');
  }
  if (smoke.none) {
    return skipped(smoke.none);
  }

  const command = smoke.command!;
  const timeoutSeconds = smoke.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS;
  const env = { ...process.env, ...options.env, NO_COLOR: '1', FORCE_COLOR: '0' };

  // Whether the command is expected to exit is decided by the declaration, not by guessing at the
  // kind of project: `http_ok` means "it stays up and answers", its absence means "it exits".
  const readiness = smoke.expect?.http_ok;

  // One shape for both cases -- start, poll, tear the tree down -- rather than `spawnSync` for one
  // and a detached spawn for the other. `spawnSync`'s own `timeout` looked like the obvious choice
  // for a command expected to exit, and it is wrong on Windows: with `shell: true` it kills the
  // intermediate `cmd.exe` and leaves the actual process running, which is exactly the leak this
  // gate must not produce. Caught by tests/smokeGate.test.ts, where the leaked process kept holding
  // its working directory after the gate had returned.
  const scratchDirectory = mkdtempSync(join(tmpdir(), 'compassrose-smoke-'));
  const exitCodeFile = join(scratchDirectory, 'exit-code');
  const outputFile = join(scratchDirectory, 'output');

  const child = spawn(process.execPath, ['-e', EXIT_CODE_WRAPPER, command, exitCodeFile, outputFile], {
    cwd: options.cwd,
    detached: process.platform !== 'win32',
    stdio: 'ignore',
    env,
  });

  const pid = child.pid;
  const deadline = Date.now() + timeoutSeconds * 1000;
  let httpAnswered: boolean | null = readiness === undefined ? null : false;
  let exited = false;

  try {
    while (Date.now() < deadline) {
      if (pid !== undefined && !isAlive(pid)) {
        exited = true;
        break;
      }

      // A command expected to stay up but which exits immediately is a legitimate failure: the
      // endpoint never answers, and the evidence says exactly that.
      if (readiness !== undefined && probeHttpSync(readiness)) {
        httpAnswered = true;
        break;
      }

      sleepSync(POLL_INTERVAL_MS);
    }
  } finally {
    // Runs on success, failure, timeout, and exception alike. Nothing this started may outlive it.
    if (pid !== undefined && isAlive(pid)) {
      terminateTree(pid, false);
      const graceDeadline = Date.now() + TERMINATION_GRACE_MS;
      while (Date.now() < graceDeadline && isAlive(pid)) {
        sleepSync(100);
      }
      if (isAlive(pid)) {
        terminateTree(pid, true);
      }
    }
  }

  const exitCode = exited ? readRecordedExitCode(exitCodeFile) : null;
  const captured = clip(existsSync(outputFile) ? readFileSync(outputFile, 'utf8') : '');
  rmSync(scratchDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });

  const timedOut = readiness === undefined ? !exited : httpAnswered !== true && !exited;
  const unmet = timedOut
    ? [readiness === undefined
        ? `the command did not finish within ${timeoutSeconds}s`
        : `${readiness} did not answer within ${timeoutSeconds}s`]
    : evaluate(smoke, { exitCode, output: captured, httpAnswered });

  return { outcome: unmet.length === 0 ? 'passed' : 'failed', command, unmet, output: captured, timedOut };
}

/**
 * The exit code, recovered from the sentinel file the instrumented command wrote.
 *
 * Node offers no way to read a child's exit code without turning the event loop, and this gate is
 * synchronous by necessity (see the module header). Having the shell record it is the portable way
 * to observe it anyway.
 */
function readRecordedExitCode(path: string): number | null {
  // The shell writes the file as its very last act, so it can lag the process disappearing by a
  // few milliseconds.
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (existsSync(path)) {
      const parsed = Number.parseInt(readFileSync(path, 'utf8').trim(), 10);
      return Number.isNaN(parsed) ? null : parsed;
    }
    sleepSync(50);
  }

  return null;
}
