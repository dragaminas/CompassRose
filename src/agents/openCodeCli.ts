import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readTextIfExists } from '../filesystem/textNormalization.js';
import { ControlledStopError, stopExitCodeForSignal } from '../runtime/controlledStop.js';
import { DEFAULT_AGENT_HEARTBEAT_MS, runCommandWithHeartbeat } from './heartbeatRunner.js';
import { resolveOpenCodeModel } from './modelResolution.js';
import { logAgentEnd, logAgentStart, logAgentStream } from './agentLogging.js';
import type { CommandExecution } from './taskImplementer.js';

export class OpenCodeCli {
  constructor(
    private readonly repositoryRoot: string,
    private readonly command: string,
  ) {}

  run(prompt: string, label = 'implementer'): CommandExecution {
    const tempDir = mkdtempSync(join(tmpdir(), 'proto-compassrose-opencode-'));
    const promptPath = join(tempDir, 'prompt.txt');
    const stdoutPath = join(tempDir, 'stdout.log');
    const stderrPath = join(tempDir, 'stderr.log');
    writeFileSync(promptPath, prompt, 'utf8');

    // `opencode run --help` has no `--dangerously-skip-permissions` flag (that name comes from a
    // different CLI's convention); this installed CLI's actual auto-approve flag is `--auto`.
    // The wrong flag name means yargs silently ignores it, so opencode never actually gets
    // permission to write/edit files non-interactively -- it just talks about what it would do
    // and exits with no diff, which is indistinguishable from a "did nothing" implementation
    // failure. Found live: two consecutive implementer runs against this same
    // task produced zero file changes despite reporting success.
    //
    // `--pure` disables the user's globally-installed opencode plugins for this invocation. One
    // of those (a "superpowers" plugin) ships a `brainstorming` skill with a hard gate against
    // writing any code before a human approves a design through back-and-forth dialogue -- built
    // for interactive sessions, and liable to fire (non-deterministically, since routing is the
    // model's own judgment call) on a one-shot, non-interactive CompassRose task prompt with no
    // human present to ever satisfy it. CompassRose's planner/reviewer roles already do this
    // project's design/scoping work before the implementer ever runs, so a second, uncontrolled
    // planning-oriented skill inside the implementer call is redundant risk with no upside here.
    const args = ['run', '--dir', this.repositoryRoot, '--auto', '--pure'];
    const model = resolveOpenCodeModel();
    if (model) {
      args.push('-m', model);
    }

    logAgentStart('opencode', label, this.command);
    const startedAt = Date.now();
    const result = runCommandWithHeartbeat({
      agent: 'opencode',
      label,
      command: this.command,
      args,
      cwd: this.repositoryRoot,
      promptPath,
      promptMode: 'stdin',
      stdoutPath,
      stderrPath,
      heartbeatIntervalMs: DEFAULT_AGENT_HEARTBEAT_MS,
    });
    const elapsedMs = Date.now() - startedAt;

    const stdout = readTextIfExists(stdoutPath);
    const stderr = readTextIfExists(stderrPath);
    logAgentStream('opencode', label, 'stdout', stdout);
    logAgentStream('opencode', label, 'stderr', stderr);
    logAgentEnd('opencode', label, elapsedMs, result.status, result.error?.message ?? null);

    if (result.signal === 'SIGINT' || result.signal === 'SIGTERM') {
      throw new ControlledStopError(
        `Controlled stop requested while running opencode for ${label}.`,
        stopExitCodeForSignal(result.signal),
        result.signal,
      );
    }

    return {
      ok: result.status === 0 && !result.error,
      stdout,
      stderr,
      exitCode: result.status,
      signal: result.signal ?? null,
      timedOut: false,
      commandInvoked: [this.command, ...args].join(' '),
    };
  }
}
