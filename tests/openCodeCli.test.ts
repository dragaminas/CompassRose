import { realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createTempWorkspace, type TempWorkspace } from './testUtils.js';
import { OpenCodeCli } from '../src/agents/openCodeCli.js';

let workspace: TempWorkspace | undefined;
// The localizer writes forward slashes so one prompt reads the same on either platform.
const forwardSlashes = (value: string): string => realpathSync(value).split('\\').join('/');


afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
});

function writeMockOpenCode(root: string, script: string): string {
  const path = join(root, 'opencode-mock.mjs');
  writeFileSync(path, script, 'utf8');
  return path;
}

describe('OpenCodeCli.run', () => {
  test('returns ok:true with captured stdout on success', () => {
    workspace = createTempWorkspace();
    const command = writeMockOpenCode(
      workspace.root,
      "let data = '';\nprocess.stdin.on('data', (c) => { data += c; });\nprocess.stdin.on('end', () => { process.stdout.write(`saw:${data}`); process.exit(0); });\n",
    );
    const client = new OpenCodeCli(workspace.root, command);
    const result = client.run('implement the task', 'implementer');

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    // See the same assertion in tests/codexCli.test.ts: the prompt is localized on its way to
    // the CLI, so the body arrives intact behind a working-directory preamble (ADR-0049).
    expect(result.stdout.endsWith('implement the task')).toBe(true);
    expect(result.stdout).toContain(`Your working directory is \`${forwardSlashes(workspace.root)}\`.`);
    expect(result.commandInvoked).toContain('--auto');
  });

  test('returns ok:false with captured stderr on non-zero exit', () => {
    workspace = createTempWorkspace();
    const command = writeMockOpenCode(workspace.root, "process.stderr.write('boom');\nprocess.exit(1);\n");
    const client = new OpenCodeCli(workspace.root, command);
    const result = client.run('implement the task');

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('boom');
  });
});
