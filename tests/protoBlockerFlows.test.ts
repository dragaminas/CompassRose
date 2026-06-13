import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsxBinary = join(repoRoot, 'node_modules', '.bin', 'tsx');

function runProtoScenario(scenario: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(tsxBinary, ['proto/protoCompassRose.e2e.ts'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PROTO_E2E_SCENARIO: scenario,
    },
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

describe('proto blocker flows', () => {
  test('continues from a recoverable blocked review into unblock planning', () => {
    const result = runProtoScenario('recoverable-review-blocked');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS: recoverable blocker created an unblock task');
    expect(result.stdout).toContain('PASS: blocked review recorded a blocker profile');
    expect(result.stdout).toContain('PASS: run completed successfully');
    expect(result.stderr).not.toContain('FAIL:');
  });

  test('stops on a terminal blocked review and preserves the blocker profile', () => {
    const result = runProtoScenario('terminal-review-blocked');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS: terminal blocker recorded a blocker profile');
    expect(result.stdout).toContain('PASS: no unblock task was created');
    expect(result.stdout).toContain('PASS: run stopped with a blocked status');
    expect(result.stderr).not.toContain('FAIL:');
  });

  test('records task-interface analysis when the review requests a narrower interface', () => {
    const result = runProtoScenario('interface-gap');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS: task-interface analysis was recorded');
    expect(result.stdout).toContain('PASS: task-interface analysis captured a limitation-oriented recommendation');
    expect(result.stdout).toContain('PASS: recovery lesson was recorded');
    expect(result.stdout).toContain('PASS: recovery lesson recorded scope isolation guidance');
    expect(result.stdout).toContain('PASS: the correction task was executed after review requested changes');
    expect(result.stdout).toContain('PASS: run completed successfully after the correction recovery loop');
    expect(result.stdout).toContain('PASS: correction task was created');
    expect(result.stderr).not.toContain('FAIL:');
  });

  test('retries implementation once when opencode leaves partial repository changes', () => {
    const result = runProtoScenario('implementation-retry');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS: implementation retry history was recorded');
    expect(result.stdout).toContain('PASS: implementation retry recorded a failed first attempt and a successful retry');
    expect(result.stdout).toContain('PASS: run completed successfully');
    expect(result.stderr).not.toContain('FAIL:');
  });

  test('creates a state correction task even when active_task is missing from malformed state', () => {
    const result = runProtoScenario('state-correction-missing-active-task');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS: state correction task was recorded');
    expect(result.stdout).toContain('PASS: state correction document was written');
    expect(result.stdout).toContain('PASS: feature state now records correction pending');
    expect(result.stderr).not.toContain('FAIL:');
  });
});
