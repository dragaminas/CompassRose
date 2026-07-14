import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createTempWorkspace, type TempWorkspace } from './testUtils.js';
import { DEFAULT_AGENT_HEARTBEAT_MS, runCommandWithHeartbeat } from '../src/agents/heartbeatRunner.js';

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
});

describe('runCommandWithHeartbeat', () => {
  test('runs a real child script via stdin, capturing its stdout and exiting 0', () => {
    workspace = createTempWorkspace();
    const scriptPath = join(workspace.root, 'echo-stdin.mjs');
    writeFileSync(
      scriptPath,
      "let data = '';\nprocess.stdin.on('data', (chunk) => { data += chunk; });\nprocess.stdin.on('end', () => { process.stdout.write(`echoed:${data}`); process.exit(0); });\n",
      'utf8',
    );
    const promptPath = join(workspace.root, 'prompt.txt');
    writeFileSync(promptPath, 'hello heartbeat', 'utf8');
    const stdoutPath = join(workspace.root, 'stdout.log');
    const stderrPath = join(workspace.root, 'stderr.log');

    const result = runCommandWithHeartbeat({
      agent: 'codex',
      label: 'test',
      command: scriptPath,
      args: [],
      cwd: workspace.root,
      promptPath,
      promptMode: 'stdin',
      stdoutPath,
      stderrPath,
      heartbeatIntervalMs: DEFAULT_AGENT_HEARTBEAT_MS,
    });

    expect(result.status).toBe(0);
    expect(result.signal).toBeNull();
    expect(readFileSync(stdoutPath, 'utf8')).toBe('echoed:hello heartbeat');
  });

  test('propagates a non-zero exit code from the child script', () => {
    workspace = createTempWorkspace();
    const scriptPath = join(workspace.root, 'fail.mjs');
    writeFileSync(scriptPath, 'process.exit(1);\n', 'utf8');
    const promptPath = join(workspace.root, 'prompt.txt');
    writeFileSync(promptPath, '', 'utf8');

    const result = runCommandWithHeartbeat({
      agent: 'codex',
      label: 'test',
      command: scriptPath,
      args: [],
      cwd: workspace.root,
      promptPath,
      promptMode: 'stdin',
      stdoutPath: join(workspace.root, 'stdout.log'),
      stderrPath: join(workspace.root, 'stderr.log'),
      heartbeatIntervalMs: DEFAULT_AGENT_HEARTBEAT_MS,
    });

    expect(result.status).toBe(1);
  });
});
