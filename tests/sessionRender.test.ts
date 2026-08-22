import { describe, expect, test } from 'vitest';
import { renderSessionHeader } from '../src/session/render/header.js';
import {
  formatElapsed,
  renderCompletedStep,
  renderRunHeader,
  renderRunSummary,
  renderRunningStep,
} from '../src/session/render/progress.js';
import { renderFailureView } from '../src/session/render/failure.js';
import { parseCommandLine, SESSION_COMMANDS } from '../src/session/commands.js';

// 023-terminal-session's architecture requires every render function to be testable by comparing
// `string[]` values, with no terminal emulation and no escape-sequence snapshots. Escape sequences
// live exclusively in terminalWriter.ts, which is verified by hand.

describe('renderSessionHeader', () => {
  test('a quiet project prints only the counts and the prompt hint', () => {
    expect(
      renderSessionHeader({
        projectName: 'CompassRose',
        completedIds: ['001', '002'],
        inProgressIds: [],
        blockedIds: [],
        awaitingValidationIds: [],
        pendingSpecificationIds: [],
      }),
    ).toEqual([
      'CompassRose · CompassRose',
      '2 work items · 2 complete',
      '',
      'Type to talk. /help for commands.',
      '',
    ]);
  });

  test('only buckets that need a human are named', () => {
    const lines = renderSessionHeader({
      projectName: 'CompassRose',
      completedIds: ['001'],
      inProgressIds: ['023'],
      blockedIds: ['003'],
      awaitingValidationIds: [],
      pendingSpecificationIds: ['021', '022'],
    });

    expect(lines).toContain('blocked: 003');
    expect(lines).toContain('pending specification: 021, 022');
    expect(lines.some((line) => line.startsWith('awaiting'))).toBe(false);
    expect(lines[1]).toBe('5 work items · 1 complete');
  });

  test('long id lists are summarized rather than wrapped', () => {
    const lines = renderSessionHeader({
      projectName: 'p',
      completedIds: [],
      inProgressIds: [],
      blockedIds: ['a', 'b', 'c', 'd', 'e'],
      awaitingValidationIds: [],
      pendingSpecificationIds: [],
    });

    expect(lines).toContain('blocked: a, b, c and 2 more');
  });

  test('singular work item', () => {
    const lines = renderSessionHeader({
      projectName: 'p',
      completedIds: ['only'],
      inProgressIds: [],
      blockedIds: [],
      awaitingValidationIds: [],
      pendingSpecificationIds: [],
    });

    expect(lines[1]).toBe('1 work item · 1 complete');
  });
});

describe('progress rendering', () => {
  test('elapsed time is seconds under a minute and m/s above', () => {
    expect(formatElapsed(0)).toBe('0s');
    expect(formatElapsed(12_400)).toBe('12s');
    expect(formatElapsed(59_999)).toBe('59s');
    expect(formatElapsed(60_000)).toBe('1m00s');
    expect(formatElapsed(160_000)).toBe('2m40s');
  });

  test('a completed step is one line carrying mark, label, detail and elapsed', () => {
    expect(
      renderCompletedStep({ label: 'plan', detail: 'F023-T01 · outline', status: 'ok', elapsedMs: 12_000 }),
    ).toBe('  ✓ plan       F023-T01 · outline  12s');
  });

  test('a step with no detail does not leave trailing whitespace before the elapsed time', () => {
    expect(renderCompletedStep({ label: 'review', detail: '', status: 'failed', elapsedMs: 1_000 })).toBe(
      '  ✗ review  1s',
    );
  });

  test('each status has its own mark', () => {
    const marks = (['ok', 'failed', 'blocked', 'skipped'] as const).map((status) =>
      renderCompletedStep({ label: 'x', detail: '', status, elapsedMs: 0 }).trim()[0],
    );
    expect(new Set(marks).size).toBe(4);
  });

  test('the running frame advances with the spinner tick and tells the user how to stop', () => {
    const step = { label: 'implement', detail: '', status: 'running' as const, elapsedMs: 5_000 };
    const first = renderRunningStep(step, 0);
    const second = renderRunningStep(step, 1);

    expect(first).toHaveLength(3);
    expect(first[2]).toBe('  esc to stop');
    expect(first[0]).not.toBe(second[0]);
    expect(first[0]).toContain('implement');
    expect(first[0]).toContain('5s');
  });

  test('the run header names the item', () => {
    expect(renderRunHeader('023-terminal-session')).toEqual(['  ▸ 023-terminal-session']);
  });
});

describe('renderRunSummary', () => {
  test('reports every bucket and points at the unblocking command when something is blocked', () => {
    const lines = renderRunSummary({
      completed: ['001'],
      advanced: [{ itemId: '023', steps: 3 }],
      blocked: [{ itemId: '003', reason: 'quality gates failed' }],
      stoppedByHuman: false,
      failure: null,
    });

    expect(lines).toContain('  Run finished.');
    expect(lines).toContain('    completed  001');
    expect(lines).toContain('    advanced   023 · 3 steps');
    expect(lines).toContain('    blocked    003 · quality gates failed');
    expect(lines.some((line) => line.includes('/desbloquear'))).toBe(true);
  });

  test('a human stop is reported as a stop, not as a failure', () => {
    const lines = renderRunSummary({
      completed: [],
      advanced: [],
      blocked: [],
      stoppedByHuman: true,
      failure: null,
    });

    expect(lines).toContain('  Run stopped at your request. State is saved.');
  });

  test('an engine failure is reported distinctly and outranks the human stop', () => {
    const lines = renderRunSummary({
      completed: [],
      advanced: [],
      blocked: [],
      stoppedByHuman: true,
      failure: 'contract registry refused to load',
    });

    expect(lines).toContain('  Run stopped: contract registry refused to load');
  });

  test('a clean run does not suggest unblocking anything', () => {
    const lines = renderRunSummary({
      completed: ['001'],
      advanced: [],
      blocked: [],
      stoppedByHuman: false,
      failure: null,
    });

    expect(lines.some((line) => line.includes('/desbloquear'))).toBe(false);
  });

  test('a single advanced step reads in the singular', () => {
    const lines = renderRunSummary({
      completed: [],
      advanced: [{ itemId: '023', steps: 1 }],
      blocked: [],
      stoppedByHuman: false,
      failure: null,
    });

    expect(lines).toContain('    advanced   023 · 1 step');
  });
});

describe('renderFailureView', () => {
  const card = {
    itemId: '003-doctor-command',
    itemPathRelative: 'compassrose/features/003-doctor-command/state.md',
    kind: 'review_failure',
    recoverability: 'human',
    reason: 'Quality gates failed after implementing F003-T01-C02.',
    evidence: ['npm test: 3 failing'],
  };

  test('renders the structured card and invites a conversation about it', () => {
    const lines = renderFailureView({ card, explanation: null });

    expect(lines.some((line) => line.includes('=== BLOCKED: 003-doctor-command ==='))).toBe(true);
    expect(lines.some((line) => line.includes('kind: review_failure'))).toBe(true);
    expect(lines.some((line) => line.includes('/desbloquear 003-doctor-command'))).toBe(true);
  });

  test('a human-language explanation is wrapped and placed after the card', () => {
    const explanation = 'The test gate failed after implementing F003-T01-C02. '.repeat(6).trim();
    const lines = renderFailureView({ card, explanation });

    const cardIndex = lines.findIndex((line) => line.includes('=== BLOCKED'));
    const explanationIndex = lines.findIndex((line) => line.includes('The test gate failed'));
    const closingIndex = lines.findIndex((line) => line.includes('/desbloquear'));
    expect(explanationIndex).toBeGreaterThan(cardIndex);

    // Only the explanation is wrapped; the card's own lines are bounded by blockerCard.ts's
    // truncation and are deliberately left exactly as that renderer produced them.
    const explanationLines = lines.slice(explanationIndex, closingIndex);
    expect(explanationLines.length).toBeGreaterThan(1);
    expect(explanationLines.every((line) => line.length <= 70)).toBe(true);
  });
});

describe('parseCommandLine', () => {
  test('a slash line resolves to its command with arguments', () => {
    const parsed = parseCommandLine('/run 024-specification-flow');
    expect(parsed).not.toBeNull();
    expect(parsed).not.toBe('unknown-command');
    if (parsed && parsed !== 'unknown-command') {
      expect(parsed.command.name).toBe('run');
      expect(parsed.args).toEqual(['024-specification-flow']);
    }
  });

  test('plain prose is conversation, never a command', () => {
    expect(parseCommandLine('quiero que el doctor me pregunte en vez de generar tareas')).toBeNull();
  });

  test('an unknown slash word is reported as unknown, never guessed at', () => {
    expect(parseCommandLine('/deploy')).toBe('unknown-command');
  });

  test('bare orchestrator keywords still work on their own', () => {
    for (const keyword of ['crear', 'listo', 'terminado']) {
      const parsed = parseCommandLine(keyword);
      expect(parsed).not.toBeNull();
      expect(parsed).not.toBe('unknown-command');
    }
  });

  test('a bare keyword inside a sentence is conversation, not a transition', () => {
    expect(parseCommandLine('crear una pantalla de login')).toBeNull();
    expect(parseCommandLine('listo para empezar')).toBeNull();
  });

  test('commands are case-insensitive', () => {
    const parsed = parseCommandLine('/STATUS');
    expect(parsed).not.toBe('unknown-command');
    expect(parsed && parsed !== 'unknown-command' ? parsed.command.name : null).toBe('status');
  });

  test('an empty line is neither command nor conversation', () => {
    expect(parseCommandLine('   ')).toBeNull();
  });

  test('every registered command has a unique name and no alias collides with another name', () => {
    const names = SESSION_COMMANDS.map((command) => command.name);
    expect(new Set(names).size).toBe(names.length);

    const aliases = SESSION_COMMANDS.flatMap((command) => command.aliases);
    expect(new Set([...names, ...aliases]).size).toBe(names.length + aliases.length);
  });

  test('every registered command documents itself for /help', () => {
    for (const command of SESSION_COMMANDS) {
      expect(command.usage.startsWith('/')).toBe(true);
      expect(command.summary.length).toBeGreaterThan(0);
    }
  });
});
