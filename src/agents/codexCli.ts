import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readTextIfExists, readUtf8 } from '../filesystem/textNormalization.js';
import { ControlledStopError, stopExitCodeForSignal } from '../runtime/controlledStop.js';
import { DEFAULT_AGENT_HEARTBEAT_MS, runCommandWithHeartbeat } from './heartbeatRunner.js';
import { resolveCodexImplementerModel, resolveCodexPlannerModel } from './modelResolution.js';
import { logAgentEnd, logAgentStart, logAgentStream } from './agentLogging.js';
import { codexSandboxArguments } from './sandboxArguments.js';
import { DEFAULT_EXECUTION_TRUST, type ExecutionTrustPolicy } from '../config/executionTrust.js';
import type { CommandExecution, TaskImplementer } from './taskImplementer.js';
import { localizePromptPaths } from '../config/installationPaths.js';

export class CodexCli implements TaskImplementer {
  constructor(
    private readonly repositoryRoot: string,
    private readonly command: string,
    private readonly executionTrust: ExecutionTrustPolicy = DEFAULT_EXECUTION_TRUST,
  ) {}

  runStructured<T>(
    prompt: string,
    schema: unknown,
    extraReadableDirs: readonly string[] = [],
    label = 'step-selector',
  ): T {
    const tempDir = mkdtempSync(join(tmpdir(), 'proto-compassrose-codex-'));
    const schemaPath = join(tempDir, 'schema.json');
    const outputPath = join(tempDir, 'output.json');
    const promptPath = join(tempDir, 'prompt.txt');
    const stdoutPath = join(tempDir, 'stdout.log');
    const stderrPath = join(tempDir, 'stderr.log');
    writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
    // ADR-0049: the prompt names files by their logical path -- CompassRose's contracts relative to
    // the installation, everything else relative to the target. This is the one boundary where those
    // names have to become paths an agent can open, and where they must all share one base: a prompt
    // mixing the two got its relative paths resolved against the installation, and an agent read the
    // wrong project's documents. A no-op when self-hosted.
    writeFileSync(promptPath, localizePromptPaths(prompt, this.repositoryRoot), 'utf8');

    const args = [
      'exec',
      '--ephemeral',
      '-C',
      this.repositoryRoot,
      ...codexSandboxArguments(this.executionTrust, 'structured'),
      '--output-schema',
      schemaPath,
      '-o',
      outputPath,
    ];

    for (const dir of extraReadableDirs) {
      args.push('--add-dir', dir);
    }

    const model = resolveCodexPlannerModel();
    if (model) {
      args.push('-m', model);
    }

    args.push('-');

    logAgentStart('codex', label, this.command);
    const startedAt = Date.now();
    const result = runCommandWithHeartbeat({
      agent: 'codex',
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
    logAgentStream('codex', label, 'stdout', stdout);
    logAgentStream('codex', label, 'stderr', stderr);
    logAgentEnd('codex', label, elapsedMs, result.status, result.error?.message ?? null);

    if (result.signal === 'SIGINT' || result.signal === 'SIGTERM') {
      throw new ControlledStopError(
        `Controlled stop requested while running codex exec for ${label}.`,
        stopExitCodeForSignal(result.signal),
        result.signal,
      );
    }

    if (result.status !== 0) {
      throw new Error(`codex exec failed:\n${stderr || stdout}`);
    }

    return JSON.parse(readUtf8(outputPath)) as T;
  }

  run(prompt: string, label = 'implementer'): CommandExecution {
    const tempDir = mkdtempSync(join(tmpdir(), 'proto-compassrose-codex-'));
    const promptPath = join(tempDir, 'prompt.txt');
    const stdoutPath = join(tempDir, 'stdout.log');
    const stderrPath = join(tempDir, 'stderr.log');
    // ADR-0049: the prompt names files by their logical path -- CompassRose's contracts relative to
    // the installation, everything else relative to the target. This is the one boundary where those
    // names have to become paths an agent can open, and where they must all share one base: a prompt
    // mixing the two got its relative paths resolved against the installation, and an agent read the
    // wrong project's documents. A no-op when self-hosted.
    writeFileSync(promptPath, localizePromptPaths(prompt, this.repositoryRoot), 'utf8');

    const args = [
      'exec',
      '--ephemeral',
      '--cd',
      this.repositoryRoot,
      ...codexSandboxArguments(this.executionTrust, 'implementation'),
    ];

    const model = resolveCodexImplementerModel();
    if (model) {
      args.push('-m', model);
    }

    args.push('-');

    logAgentStart('codex', label, this.command);
    const startedAt = Date.now();
    const result = runCommandWithHeartbeat({
      agent: 'codex',
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
    logAgentStream('codex', label, 'stdout', stdout);
    logAgentStream('codex', label, 'stderr', stderr);
    logAgentEnd('codex', label, elapsedMs, result.status, result.error?.message ?? null);

    if (result.signal === 'SIGINT' || result.signal === 'SIGTERM') {
      throw new ControlledStopError(
        `Controlled stop requested while running codex exec for ${label}.`,
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
