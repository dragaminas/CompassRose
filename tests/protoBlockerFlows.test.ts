import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentToolName } from '../src/contracts/runtime/agentContext.js';
import { describe, expect, test, vi } from 'vitest';

// Each test here spawns a real tsx -> node -> proto e2e harness subprocess (a full clone plus
// mock-CLI scenario) and takes ~9-11s even running alone; the suite-wide 30000ms default
// (vitest.config.ts) leaves too little headroom once these run alongside the rest of the full
// suite under contention.
vi.setConfig({ testTimeout: 60000 });

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsxBinary = join(repoRoot, 'node_modules', '.bin', 'tsx');

function runProtoScenario(
  scenario: string,
  options: { commit?: boolean; implementer?: AgentToolName } = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(tsxBinary, ['proto/protoCompassRose.e2e.ts'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PROTO_E2E_COMMIT: options.commit ? '1' : '0',
      ...(options.implementer ? { PROTO_E2E_IMPLEMENTER: options.implementer } : {}),
      PROTO_E2E_SCENARIO: scenario,
    },
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    shell: process.platform === 'win32',
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

describe('proto blocker flows', () => {
  test('continues from a recoverable blocked review into doctor recovery planning', () => {
    const result = runProtoScenario('recoverable-review-blocked');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS: recoverable blocker created a doctor recovery task');
    expect(result.stdout).toContain('PASS: blocked review recorded a blocker profile');
    expect(result.stdout).toContain('PASS: run completed successfully');
    expect(result.stderr).not.toContain('FAIL:');
  });

  test('files a critical blocking fix on a terminal blocked review instead of a bounded doctor recovery', () => {
    const result = runProtoScenario('terminal-review-blocked');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS: terminal blocker recorded a blocker profile');
    expect(result.stdout).toContain('PASS: no doctor recovery task was created');
    expect(result.stdout).toContain('PASS: a systemic blocking fix was filed');
    expect(result.stdout).toContain('PASS: the feature was blocked on the filed fix');
    expect(result.stdout).toContain('PASS: run set the item aside and finished needing a human');
    expect(result.stderr).not.toContain('FAIL:');
  });

  test('recovers from implementation_failed through doctor recovery planning and resumes the original task', () => {
    const result = runProtoScenario('implementation-failed-recovery');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS: implementation_failed recovery created a doctor recovery task');
    expect(result.stdout).toContain('PASS: implementation_failed recovery recorded a diagnostic artifact');
    expect(result.stdout).toContain('PASS: the original implementation task was resumed after recovery');
    expect(result.stdout).toContain('PASS: run completed successfully');
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

  test('keeps the worktree clean when state repair checkpoints are committed', () => {
    const result = runProtoScenario('state-correction-missing-active-task', { commit: true });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS: state correction artifact was recorded');
    expect(result.stdout).toContain('PASS: state correction document was written');
    expect(result.stdout).toContain('PASS: feature state no longer contains the malformed task_ready gap');
    expect(result.stdout).toContain('PASS: committed recovery steps left a clean worktree');
    expect(result.stderr).not.toContain('FAIL:');
  });

  test('keeps the worktree clean after a committed correction recovery loop', () => {
    const result = runProtoScenario('interface-gap', { commit: true });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS: recovery lesson was recorded');
    expect(result.stdout).toContain('PASS: recovery lesson recorded scope isolation guidance');
    expect(result.stdout).toContain('PASS: the correction task was executed after review requested changes');
    expect(result.stdout).toContain('PASS: run completed successfully after the correction recovery loop');
    expect(result.stdout).toContain('PASS: committed recovery steps left a clean worktree');
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

  test('captures implementation notes from the implementer as reviewer context', () => {
    const result = runProtoScenario('implementation-notes');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS: implementation notes were captured in the implementation artifact');
    expect(result.stdout).toContain('PASS: run completed successfully');
    expect(result.stderr).not.toContain('FAIL:');
  });

  test('captures implementation notes through the codex implementer path as well', () => {
    const result = runProtoScenario('implementation-notes', { implementer: 'codex' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS: codex was called enough times to implement and review under the deterministic loop');
    expect(result.stdout).toContain('PASS: opencode call count matched the configured implementer');
    expect(result.stdout).toContain('PASS: implementation notes were captured in the implementation artifact');
    expect(result.stderr).not.toContain('FAIL:');
  });

  test('fails implementation attempts that omit the required justification notes', () => {
    const result = runProtoScenario('implementation-missing-notes');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS: implementation attempt failed because the justification was missing');
    expect(result.stdout).toContain('PASS: implementation diagnostics recorded the missing justification');
    expect(result.stdout).toContain('PASS: implementation artifact recorded no notes');
    expect(result.stderr).not.toContain('FAIL:');
  });

  test('accepts mixed deliverables for bounded doctor recovery tasks when recovery needs them', () => {
    const result = runProtoScenario('unblock-doc-code-mismatch');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS: doctor recovery task was materialized');
    expect(result.stdout).toContain('PASS: run completed successfully');
    expect(result.stderr).not.toContain('FAIL:');
  });

  test('creates a state correction task even when active_task is missing from malformed state', () => {
    const result = runProtoScenario('state-correction-missing-active-task');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS: state correction artifact was recorded');
    expect(result.stdout).toContain('PASS: state correction document was written');
    expect(result.stdout).toContain('PASS: feature state no longer contains the malformed task_ready gap');
    expect(result.stderr).not.toContain('FAIL:');
  });
});
