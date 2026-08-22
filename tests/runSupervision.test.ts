import { EventEmitter } from 'node:events';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import {
  appendRunEvent,
  clearRunChannel,
  decodeRunEvents,
  encodeRunEvent,
  readRunEvents,
  readRunStopRequest,
  requestRunStop,
} from '../src/runtime/runChannel.js';
import { runChannelPaths, superviseRun } from '../src/session/runSupervisor.js';
import { copyContractsIntoWorkspace, readFixtureConfigMarkdown } from './testUtils.js';

// 023-terminal-session: `run()` is synchronous, so the process executing it can neither animate
// anything nor read a key until it finishes. The loop moved to a child process; these pin the two
// halves of that -- the file channel the two processes talk through, and the supervision that keeps
// the parent's event loop free.

vi.setConfig({ testTimeout: 60000 });

/** Written as an escape rather than the byte itself: an invisible control character in source is a trap. */
const ESC = '\u001b';

const PROJECT_STATE = [
  '# CompassRose Project State',
  '',
  '## Status',
  '',
  'active',
  '',
  '## Active Feature',
  '',
  '`none`',
  '',
  '## Current Reality',
  '',
  '- Fixture.',
  '',
  '## Implemented',
  '',
  '- Nothing yet.',
  '',
  '## Pending',
  '',
  '- Nothing pending.',
  '',
  '## Blocked',
  '',
  '- Nothing blocked.',
  '',
  '## Last Approved Change',
  '',
  'None yet.',
  '',
  '## Known Gaps',
  '',
  'None.',
  '',
  '## Next Planning Hint',
  '',
  'None.',
  '',
].join('\n');

function createEmptyRepository(): { root: string; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'compassrose-supervision-'));
  mkdirSync(join(root, 'compassrose'), { recursive: true });
  writeFileSync(join(root, 'compassrose', 'CONFIG.md'), readFixtureConfigMarkdown(), 'utf8');
  writeFileSync(join(root, 'compassrose', 'PROJECT_STATE.md'), PROJECT_STATE, 'utf8');
  copyContractsIntoWorkspace(root);

  // The orchestrator refuses to construct outside a git repository, and this fixture exists to run
  // a real one.
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '--quiet', '-m', 'initial commit'], { cwd: root });

  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

describe('the run channel', () => {
  let root: string | null = null;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = null;
    }
  });

  test('round-trips an event through one appended line', () => {
    const encoded = encodeRunEvent({ type: 'step-start', kind: 'plan_task', itemId: '001-x', taskId: null });
    expect(encoded.endsWith('\n')).toBe(true);
    expect(decodeRunEvents(encoded)).toEqual([
      { type: 'step-start', kind: 'plan_task', itemId: '001-x', taskId: null },
    ]);
  });

  test('ignores a final line the writer has not finished writing', () => {
    // The reader polls a file another process is appending to, so catching a half-written line is
    // normal rather than exceptional.
    const complete = encodeRunEvent({ type: 'step-start', kind: 'plan_task', itemId: '001-x', taskId: null });
    const partial = '{"type":"step-end","kind":"plan_ta';

    expect(decodeRunEvents(complete + partial)).toEqual([
      { type: 'step-start', kind: 'plan_task', itemId: '001-x', taskId: null },
    ]);
  });

  test('skips a line it cannot understand rather than throwing', () => {
    // A display that dies because one line arrived garbled is worse than one that misses a step.
    const text = ['not json at all', encodeRunEvent({ type: 'step-end', kind: 'stop', itemId: null, taskId: null, outcome: 'advanced', summary: 'done' }).trim(), '{"type":"something-else"}'].join('\n');

    expect(decodeRunEvents(text)).toEqual([
      { type: 'step-end', kind: 'stop', itemId: null, taskId: null, outcome: 'advanced', summary: 'done' },
    ]);
  });

  test('appends, reads back, and clears', () => {
    root = mkdtempSync(join(tmpdir(), 'compassrose-channel-'));
    const { eventLogPath, stopFilePath } = runChannelPaths(root);

    appendRunEvent(eventLogPath, { type: 'step-start', kind: 'plan_task', itemId: 'a', taskId: null });
    appendRunEvent(eventLogPath, { type: 'step-start', kind: 'review_task', itemId: 'a', taskId: 'A-T1' });
    expect(readRunEvents(eventLogPath)).toHaveLength(2);

    requestRunStop(stopFilePath, 'because');
    expect(readRunStopRequest(stopFilePath)).toBe('because');

    clearRunChannel(eventLogPath, stopFilePath);
    expect(readRunEvents(eventLogPath)).toEqual([]);
    expect(readRunStopRequest(stopFilePath)).toBeNull();
  });

  test('reads nothing, rather than throwing, when the log does not exist yet', () => {
    root = mkdtempSync(join(tmpdir(), 'compassrose-channel-'));
    expect(readRunEvents(join(root, 'never-written.jsonl'))).toEqual([]);
    expect(readRunStopRequest(join(root, 'never-written'))).toBeNull();
  });
});

describe('a run notices a stop file', () => {
  let repository: { root: string; dispose: () => void } | null = null;

  afterEach(() => {
    repository?.dispose();
    repository = null;
    vi.unstubAllEnvs();
  });

  test('stops with the controlled-stop exit code when the file is already there', () => {
    // This is the only mechanism that can reach a synchronous run from outside: IPC cannot, because
    // the message would not be delivered until the run had already ended.
    repository = createEmptyRepository();
    const { stopFilePath } = runChannelPaths(repository.root);
    requestRunStop(stopFilePath, 'Stop requested from the session.');
    vi.stubEnv('PROTO_COMPASSROSE_STOP_FILE', stopFilePath);

    const orchestrator = new CompassRoseOrchestrator({
      loop: true,
      commit: false,
      cwd: repository.root,
      implementer: 'opencode',
    });

    expect(orchestrator.run()).toBe(130);
  });

  test('runs normally when no stop file was written', () => {
    repository = createEmptyRepository();
    const { stopFilePath } = runChannelPaths(repository.root);
    vi.stubEnv('PROTO_COMPASSROSE_STOP_FILE', stopFilePath);

    const orchestrator = new CompassRoseOrchestrator({
      loop: true,
      commit: false,
      cwd: repository.root,
      implementer: 'opencode',
    });

    expect(orchestrator.run()).toBe(0);
  });
});

/** A stdin stand-in the supervisor will treat as an interactive terminal. */
function createFakeInput(): NodeJS.ReadStream & { press: (keys: string) => void } {
  const stream = new EventEmitter() as unknown as NodeJS.ReadStream & { press: (keys: string) => void };
  Object.assign(stream, {
    isTTY: true,
    setRawMode: () => stream,
    resume: () => stream,
    pause: () => stream,
    press: (keys: string) => stream.emit('data', Buffer.from(keys, 'utf8')),
  });
  return stream;
}

describe('supervising a run', () => {
  let root: string | null = null;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = null;
    }
  });

  test('reports steps while the child is still running, and keeps its own loop free', async () => {
    root = mkdtempSync(join(tmpdir(), 'compassrose-supervise-'));
    const { eventLogPath } = runChannelPaths(root);

    const started: string[] = [];
    const ended: string[] = [];
    let ticks = 0;

    const result = await superviseRun({
      repositoryRoot: root,
      target: null,
      pollIntervalMs: 20,
      spawnChild: (channel) => {
        // A real child, not a fake: what is under test is that a separate process writing to the
        // log is seen by a parent whose event loop keeps turning.
        const script = [
          'const { appendFileSync, mkdirSync } = require("node:fs");',
          'const path = process.argv[1];',
          'mkdirSync(require("node:path").dirname(path), { recursive: true });',
          'const write = (event) => appendFileSync(path, JSON.stringify(event) + "\\n", "utf8");',
          'write({ type: "step-start", kind: "plan_task", itemId: "001-x", taskId: null });',
          'setTimeout(() => {',
          '  write({ type: "step-end", kind: "plan_task", itemId: "001-x", taskId: "F1-T1", outcome: "advanced", summary: "planned" });',
          '  console.log("child said something");',
          '  process.exit(0);',
          '}, 120);',
        ].join('\n');
        return spawn(process.execPath, ['-e', script, channel.eventLogPath], { stdio: ['ignore', 'pipe', 'pipe'] });
      },
      events: {
        onStepStart: (event) => started.push(event.kind),
        onStepEnd: (event) => ended.push(`${event.kind}:${event.outcome}`),
        onTick: () => { ticks += 1; },
        onOutput: () => {},
        onStopRequested: () => {},
      },
    });

    expect(result.exitCode).toBe(0);
    expect(started).toEqual(['plan_task']);
    expect(ended).toEqual(['plan_task:advanced']);
    // The whole point of the child process: the parent animated while the run was in flight.
    expect(ticks).toBeGreaterThan(1);
    expect(existsSync(eventLogPath)).toBe(true);
  });

  test('forwards the child output instead of letting it print itself', async () => {
    root = mkdtempSync(join(tmpdir(), 'compassrose-supervise-'));
    const output: string[] = [];

    await superviseRun({
      repositoryRoot: root,
      target: null,
      pollIntervalMs: 20,
      spawnChild: () =>
        spawn(process.execPath, ['-e', 'console.log("from stdout"); console.error("from stderr");'], {
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      events: {
        onStepStart: () => {},
        onStepEnd: () => {},
        onTick: () => {},
        onOutput: (lines) => output.push(...lines),
        onStopRequested: () => {},
      },
    });

    expect(output).toContain('from stdout');
    expect(output).toContain('from stderr');
  });

  test('one esc asks; a second esc terminates the tree', async () => {
    root = mkdtempSync(join(tmpdir(), 'compassrose-supervise-'));
    const { stopFilePath } = runChannelPaths(root);
    const input = createFakeInput();
    const stopRequests: boolean[] = [];

    const running = superviseRun({
      repositoryRoot: root,
      target: null,
      pollIntervalMs: 20,
      input,
      // Sleeps far longer than this test will wait: only the hard stop can end it.
      spawnChild: () => spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 60000);'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
      events: {
        onStepStart: () => {},
        onStepEnd: () => {},
        onTick: () => {},
        onOutput: () => {},
        onStopRequested: (hard) => stopRequests.push(hard),
      },
    });

    // Give the supervisor a turn to attach its key listener before pressing anything.
    await new Promise((resolve) => setTimeout(resolve, 60));
    input.press(ESC);
    expect(stopRequests).toEqual([false]);
    expect(readRunStopRequest(stopFilePath)).toBe('Stop requested from the session.');

    input.press(ESC);
    const result = await running;

    expect(stopRequests).toEqual([false, true]);
    expect(result.terminated).toBe(true);
    expect(result.stopRequested).toBe(true);
    // A tree the human killed is a controlled stop, not an engine failure.
    expect(result.exitCode).toBe(130);
  });

  test('a previous run leaves nothing behind for the next one to replay', async () => {
    root = mkdtempSync(join(tmpdir(), 'compassrose-supervise-'));
    const { eventLogPath } = runChannelPaths(root);
    appendRunEvent(eventLogPath, { type: 'step-start', kind: 'stale', itemId: 'old', taskId: null });

    const started: string[] = [];
    await superviseRun({
      repositoryRoot: root,
      target: null,
      pollIntervalMs: 20,
      spawnChild: () => spawn(process.execPath, ['-e', 'process.exit(0);'], { stdio: ['ignore', 'pipe', 'pipe'] }),
      events: {
        onStepStart: (event) => started.push(event.kind),
        onStepEnd: () => {},
        onTick: () => {},
        onOutput: () => {},
        onStopRequested: () => {},
      },
    });

    expect(started).toEqual([]);
    // Cleared by removing the log, not by emptying it: a stale log from a previous run must not be
    // replayable at all.
    expect(existsSync(eventLogPath)).toBe(false);
  });
});
