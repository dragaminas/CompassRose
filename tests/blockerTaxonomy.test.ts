import { describe, expect, test } from 'vitest';
import { buildBlockerSignature, classifyBlockerKind } from '../src/state/blockerClassification.js';
import { normalizeTextForWrite } from '../src/filesystem/textNormalization.js';

describe('blocker taxonomy', () => {
  test('classifies task interface gaps as agent-recoverable blockers', () => {
    const blocker = classifyBlockerKind(
      'The task interface is too weak for the implementer to complete this cleanly.',
      ['The first executable step does not narrow the implementer enough.'],
      'blocked',
    );

    expect(blocker.kind).toBe('task_interface_gap');
    expect(blocker.recoverability).toBe('agent');
    expect(blocker.signature).toContain('task-interface-gap');
  });

  test('classifies terminal blockers as terminal and not recoverable by the loop', () => {
    const blocker = classifyBlockerKind(
      'terminal blocker: no unblock path exists',
      ['The environment cannot recover without human intervention.'],
      'blocked',
    );

    expect(blocker.recoverability).toBe('terminal');
    expect(blocker.signature).toContain('terminal-blocker');
  });

  test('classifies environment blockers as human intervention blockers', () => {
    const blocker = classifyBlockerKind(
      'The environment is unavailable and needs a human to restore it.',
      ['command not found'],
      'blocked',
    );

    expect(blocker.kind).toBe('environment');
    expect(blocker.recoverability).toBe('human');
  });

  test('builds stable blocker signatures', () => {
    const signature = buildBlockerSignature(
      'task_interface_gap',
      'blocked',
      'The task interface is too weak.',
      ['The first executable step is ambiguous.'],
    );

    expect(signature).toMatch(/task-interface-gap/);
    expect(signature.length).toBeGreaterThan(0);
  });

  test('normalizes trailing whitespace to a single newline', () => {
    expect(normalizeTextForWrite('alpha\n\n')).toBe('alpha\n');
    expect(normalizeTextForWrite('beta')).toBe('beta\n');
  });
});
