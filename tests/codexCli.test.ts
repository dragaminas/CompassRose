import { realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createTempWorkspace, type TempWorkspace } from './testUtils.js';
import { CodexCli } from '../src/agents/codexCli.js';

let workspace: TempWorkspace | undefined;
// The localizer writes forward slashes so one prompt reads the same on either platform.
const forwardSlashes = (value: string): string => realpathSync(value).split('\\').join('/');


afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
});

function writeMockCodex(root: string, script: string): string {
  const path = join(root, 'codex-mock.mjs');
  writeFileSync(path, script, 'utf8');
  return path;
}

describe('CodexCli.run', () => {
  test('returns ok:true with captured stdout on success', () => {
    workspace = createTempWorkspace();
    const command = writeMockCodex(
      workspace.root,
      "let data = '';\nprocess.stdin.on('data', (c) => { data += c; });\nprocess.stdin.on('end', () => { process.stdout.write(`saw:${data}`); process.exit(0); });\n",
    );
    const client = new CodexCli(workspace.root, command);
    const result = client.run('do the thing', 'implementer');

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    // Ends with, not equals: every prompt on its way to an agent goes through
    // localizePromptPaths, and a workspace that is not the installation gets a
    // working-directory preamble in front of it (ADR-0049). Asserted here rather than only on
    // the localizer because this is the boundary the localization was missing from -- and the
    // body still has to arrive untouched.
    expect(result.stdout.endsWith('do the thing')).toBe(true);
    expect(result.stdout).toContain(`Your working directory is \`${forwardSlashes(workspace.root)}\`.`);
    expect(result.commandInvoked).toContain(command);
    // 030-execution-trust: this assertion used to require the opposite -- that every implementer
    // call carried `--dangerously-bypass-approvals-and-sandbox`, whose own help reads "Intended
    // solely for running in environments that are externally sandboxed". CompassRose runs in the
    // user's repository on the user's machine; there was no external sandbox, and the flag also
    // overrode whatever the user had declared in their own codex config. The behavior it pinned is
    // the defect, so the assertion is inverted rather than dropped.
    expect(result.commandInvoked).not.toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(result.commandInvoked).toContain('-s workspace-write');
  });

  test('returns ok:false with captured stderr on non-zero exit', () => {
    workspace = createTempWorkspace();
    const command = writeMockCodex(
      workspace.root,
      "process.stderr.write('boom');\nprocess.exit(1);\n",
    );
    const client = new CodexCli(workspace.root, command);
    const result = client.run('do the thing');

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('boom');
  });
});

describe('CodexCli.runStructured', () => {
  test('parses the JSON written to the -o output path on success', () => {
    workspace = createTempWorkspace();
    const command = writeMockCodex(
      workspace.root,
      [
        "const fs = await import('node:fs');",
        "const outIndex = process.argv.indexOf('-o');",
        "const outputPath = process.argv[outIndex + 1];",
        "fs.writeFileSync(outputPath, JSON.stringify({ status: 'approved' }));",
        'process.exit(0);',
      ].join('\n'),
    );
    const client = new CodexCli(workspace.root, command);
    const result = client.runStructured<{ status: string }>('review this', { type: 'object' });

    expect(result).toEqual({ status: 'approved' });
  });

  test('throws when the command exits non-zero', () => {
    workspace = createTempWorkspace();
    const command = writeMockCodex(workspace.root, "process.stderr.write('bad schema');\nprocess.exit(1);\n");
    const client = new CodexCli(workspace.root, command);

    expect(() => client.runStructured('review this', { type: 'object' })).toThrow(/codex exec failed/);
  });
});
