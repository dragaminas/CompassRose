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

    const args = ['run', '--dir', this.repositoryRoot, '--dangerously-skip-permissions'];
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
