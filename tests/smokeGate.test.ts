import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test, vi } from 'vitest';
import { runSmokeGate } from '../src/orchestrator/smokeGate.js';

// 029-runnable-application-gate. Typecheck, tests, lint and build all pass happily on an
// application that does not start; this is the one gate that observes the application rather than
// reading about it.

// Spawns real child processes, some of which are deliberately made to time out.
vi.setConfig({ testTimeout: 60000 });

function workspace(): { root: string; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'compassrose-smoke-'));
  return {
    root,
    // Windows does not release a killed process's working directory immediately, so removing it
    // right after a timeout test raises EBUSY. Same retry treatment the e2e fixtures already use.
    dispose: () => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
  };
}

describe('opting out', () => {
  test('no smoke section at all is a skip, not a failure', () => {
    const result = runSmokeGate({ smoke: undefined, cwd: process.cwd() });
    expect(result.outcome).toBe('skipped');
  });

  test('an explicit opt-out is a skip that carries its reason forward', () => {
    const result = runSmokeGate({
      smoke: { none: 'Library with no entry point; correctness is covered entirely by its test suite.' },
      cwd: process.cwd(),
    });

    expect(result.outcome).toBe('skipped');
    // The reason travels into the state document, which is the whole point of requiring one.
    expect(result.command).toContain('Library with no entry point');
  });
});

describe('a command that is expected to exit', () => {
  test('passes when the exit code and expected output both match', () => {
    const space = workspace();

    try {
      const result = runSmokeGate({
        smoke: {
          command: `${JSON.stringify(process.execPath)} -e "console.log('Status: OK')"`,
          expect: { exit_code: 0, stdout_contains: 'Status: OK' },
          timeout_seconds: 30,
        },
        cwd: space.root,
      });

      expect(result.outcome).toBe('passed');
      expect(result.unmet).toEqual([]);
    } finally {
      space.dispose();
    }
  });

  test('fails on a wrong exit code, saying what it expected and what it observed', () => {
    const space = workspace();

    try {
      const result = runSmokeGate({
        smoke: {
          command: `${JSON.stringify(process.execPath)} -e "process.exit(3)"`,
          expect: { exit_code: 0 },
          timeout_seconds: 30,
        },
        cwd: space.root,
      });

      expect(result.outcome).toBe('failed');
      expect(result.unmet[0]).toContain('expected exit code 0');
      expect(result.unmet[0]).toContain('observed 3');
    } finally {
      space.dispose();
    }
  });

  test('fails when the expected output is absent, even though the command succeeded', () => {
    const space = workspace();

    try {
      const result = runSmokeGate({
        smoke: {
          command: `${JSON.stringify(process.execPath)} -e "console.log('something else')"`,
          expect: { exit_code: 0, stdout_contains: 'Status: OK' },
          timeout_seconds: 30,
        },
        cwd: space.root,
      });

      expect(result.outcome).toBe('failed');
      expect(result.unmet.join(' ')).toContain('Status: OK');
    } finally {
      space.dispose();
    }
  });

  test('all declared conditions must hold, not just one', () => {
    const space = workspace();

    try {
      const result = runSmokeGate({
        smoke: {
          command: `${JSON.stringify(process.execPath)} -e "console.log('nope'); process.exit(1)"`,
          expect: { exit_code: 0, stdout_contains: 'Status: OK' },
          timeout_seconds: 30,
        },
        cwd: space.root,
      });

      expect(result.outcome).toBe('failed');
      expect(result.unmet).toHaveLength(2);
    } finally {
      space.dispose();
    }
  });

  test('a timeout is a failure, and is distinguishable from a wrong exit code', () => {
    const space = workspace();

    try {
      const result = runSmokeGate({
        smoke: {
          command: `${JSON.stringify(process.execPath)} -e "setTimeout(() => {}, 30000)"`,
          expect: { exit_code: 0 },
          timeout_seconds: 2,
        },
        cwd: space.root,
      });

      expect(result.outcome).toBe('failed');
      expect(result.timedOut).toBe(true);
      expect(result.unmet[0]).toContain('did not finish within 2s');
    } finally {
      space.dispose();
    }
  });

  test('captured output is ANSI-stripped, so evidence written into a state document stays readable', () => {
    const space = workspace();

    try {
      const result = runSmokeGate({
        smoke: {
          command: `${JSON.stringify(process.execPath)} -e "console.log('\\u001b[31mStatus: OK\\u001b[0m')"`,
          expect: { exit_code: 0, stdout_contains: 'Status: OK' },
          timeout_seconds: 30,
        },
        cwd: space.root,
      });

      expect(result.outcome).toBe('passed');
      expect(result.output).toBe('Status: OK');
      expect(result.output).not.toContain('');
    } finally {
      space.dispose();
    }
  });
});

describe('a command that is expected to stay up', () => {
  test('passes when the declared endpoint answers, and the server does not outlive the gate', () => {
    const space = workspace();
    const port = 34567;
    const server = [
      `require("http").createServer((_, res) => { res.writeHead(200); res.end("ok"); }).listen(${port});`,
      'setTimeout(() => {}, 60000);',
    ].join('');

    try {
      const result = runSmokeGate({
        smoke: {
          command: `${JSON.stringify(process.execPath)} -e ${JSON.stringify(server)}`,
          expect: { http_ok: `http://127.0.0.1:${port}/` },
          timeout_seconds: 20,
        },
        cwd: space.root,
      });

      expect(result.outcome).toBe('passed');

      // Nothing the gate started may outlive it: a leaked server holds the port and breaks every
      // later run on this machine, starting with the next test.
      const second = runSmokeGate({
        smoke: {
          command: `${JSON.stringify(process.execPath)} -e ${JSON.stringify(server)}`,
          expect: { http_ok: `http://127.0.0.1:${port}/` },
          timeout_seconds: 20,
        },
        cwd: space.root,
      });
      expect(second.outcome).toBe('passed');
    } finally {
      space.dispose();
    }
  });

  test('fails when the command exits immediately instead of staying up', () => {
    const space = workspace();

    try {
      const result = runSmokeGate({
        smoke: {
          command: `${JSON.stringify(process.execPath)} -e "process.exit(0)"`,
          expect: { http_ok: 'http://127.0.0.1:34599/' },
          timeout_seconds: 10,
        },
        cwd: space.root,
      });

      expect(result.outcome).toBe('failed');
      expect(result.unmet.join(' ')).toContain('did not');
    } finally {
      space.dispose();
    }
  });

  test('fails on timeout when nothing ever answers', () => {
    const space = workspace();

    try {
      const result = runSmokeGate({
        smoke: {
          command: `${JSON.stringify(process.execPath)} -e "setTimeout(() => {}, 30000)"`,
          expect: { http_ok: 'http://127.0.0.1:34598/' },
          timeout_seconds: 3,
        },
        cwd: space.root,
      });

      expect(result.outcome).toBe('failed');
      expect(result.timedOut).toBe(true);
      expect(result.unmet[0]).toContain('did not answer within 3s');
    } finally {
      space.dispose();
    }
  });
});
