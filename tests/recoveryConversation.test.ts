import { describe, expect, test } from 'vitest';
import { orderedExitsFor, RECOVERY_EXIT_LABELS } from '../src/contracts/runtime/recoveryDiagnosis.js';
import { renderDiagnosis, renderExitMenu, renderInvalidationWarning } from '../src/session/render/diagnosis.js';
import type { RecoveryDiagnosis, RecoveryExit } from '../src/contracts/runtime/recoveryDiagnosis.js';

// 026-conversational-doctor-recovery: recovery used to be a machine talking to itself -- nine
// planned repair tasks on one feature, none of which unblocked it, and not one question asked of
// the human. These tests pin the replacement's two load-bearing properties: the exits are a closed,
// exhaustive set that stays fully reachable, and the diagnosis separates what the agent read from
// what it is asking.

const diagnosis: RecoveryDiagnosis = {
  item_id: '003-doctor-command',
  hypotheses: [
    {
      summary: 'The reviewer is right and the implementer touched files outside the task.',
      evidence: ['the diff includes src/git/gitClient.ts, which the task does not cite'],
      discriminating_question: 'Was that file supposed to change?',
      suggested_exit: 'retry',
    },
    {
      summary: 'The task is badly bounded and the change is impossible without touching that file.',
      evidence: ['feature.md scopes this to src/doctor only'],
      discriminating_question: 'Does the spec account for that coupling?',
      suggested_exit: 'correct_specification',
    },
  ],
};

describe('the exits are a closed, exhaustive set', () => {
  test('all four exits are offered regardless of what the agent believes', () => {
    expect([...orderedExitsFor(diagnosis)].sort()).toEqual(
      (['correct_specification', 'open_fix', 'resolve_by_hand', 'retry'] satisfies RecoveryExit[]).sort(),
    );
  });

  test('the leading hypothesis only reorders them; it never narrows the set', () => {
    const leadingRetry = orderedExitsFor(diagnosis);
    const leadingSpec = orderedExitsFor({
      ...diagnosis,
      hypotheses: [diagnosis.hypotheses[1]!, diagnosis.hypotheses[0]!],
    });

    expect(leadingRetry[0]).toBe('retry');
    expect(leadingSpec[0]).toBe('correct_specification');
    expect(leadingRetry).toHaveLength(4);
    expect(leadingSpec).toHaveLength(4);
  });

  test('a diagnosis with no hypotheses still offers every exit', () => {
    expect(orderedExitsFor({ item_id: 'x', hypotheses: [] })).toHaveLength(4);
  });

  test('every exit has a human-readable label', () => {
    for (const exit of ['retry', 'correct_specification', 'open_fix', 'resolve_by_hand'] satisfies RecoveryExit[]) {
      expect(RECOVERY_EXIT_LABELS[exit].length).toBeGreaterThan(0);
    }
  });
});

describe('renderDiagnosis', () => {
  test('separates what was read from what is being asked', () => {
    const lines = renderDiagnosis(diagnosis);

    expect(lines).toContain('  1. The reviewer is right and the implementer touched files outside the task.');
    // Evidence is marked differently from the question, so a reader can see at a glance which part
    // the machine worked out and which part is being asked of them.
    expect(lines).toContain('     · the diff includes src/git/gitClient.ts, which the task does not cite');
    expect(lines).toContain('     → Was that file supposed to change?');
  });

  test('states how many hypotheses there are, so a reader knows the list is short and bounded', () => {
    expect(renderDiagnosis(diagnosis)[1]).toBe('  2 things could be going on:');
  });

  test('renders every hypothesis, not just the leading one', () => {
    const lines = renderDiagnosis(diagnosis).join('\n');
    expect(lines).toContain('Does the spec account for that coupling?');
  });
});

describe('renderExitMenu', () => {
  test('numbers the exits in the order given', () => {
    const lines = renderExitMenu(['retry', 'resolve_by_hand']);
    expect(lines[2]).toContain('1. ');
    expect(lines[2]).toContain(RECOVERY_EXIT_LABELS.retry);
    expect(lines[3]).toContain('2. ');
    expect(lines[3]).toContain(RECOVERY_EXIT_LABELS.resolve_by_hand);
  });
});

describe('renderInvalidationWarning', () => {
  test('names exactly what will be superseded before anything is destroyed', () => {
    const lines = renderInvalidationWarning('003-doctor-command', [
      'task request 2: Repository readiness checks',
      'active task F003-T01-C02',
    ]).join('\n');

    expect(lines).toContain('task request 2: Repository readiness checks');
    expect(lines).toContain('active task F003-T01-C02');
    // The reassurance matters as much as the warning: a human refusing this exit out of fear of
    // losing history would be refusing it for the wrong reason.
    expect(lines).toContain('Nothing is deleted from git');
  });

  test('says so plainly when there is nothing to supersede', () => {
    const lines = renderInvalidationWarning('024-specification-flow', []).join('\n');
    expect(lines).toContain('nothing is superseded');
  });
});
