import { describe, expect, test } from 'vitest';
import { buildBlockerSignature, classifyBlockerKind } from '../src/state/blockerClassification.js';

describe('classifyBlockerKind', () => {
  test('classifies state corruption from lifecycle/section language', () => {
    const blocker = classifyBlockerKind('The Lifecycle State section is malformed.', [], 'blocked');
    expect(blocker.kind).toBe('state_corruption');
    expect(blocker.recoverability).toBe('agent');
  });

  test('classifies review failures from diff/acceptance language', () => {
    const blocker = classifyBlockerKind('The reviewable diff does not satisfy the acceptance criteria.', [], 'blocked');
    expect(blocker.kind).toBe('review_failure');
  });

  test('classifies implementation failures', () => {
    const blocker = classifyBlockerKind('Implementation failed: model passivity, no progress was made.', [], 'implementation_failed');
    expect(blocker.kind).toBe('implementation_failure');
  });

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

  test('classifies permission/approval language as a CLI mismatch', () => {
    const blocker = classifyBlockerKind('The command was denied by the approval policy.', [], 'blocked');
    expect(blocker.kind).toBe('cli_mismatch');
  });

  test('classifies environment blockers as human-recoverable', () => {
    const blocker = classifyBlockerKind(
      'The environment is unavailable and needs a human to restore it.',
      ['command not found'],
      'blocked',
    );

    expect(blocker.kind).toBe('environment');
    expect(blocker.recoverability).toBe('human');
  });

  test('falls back to unknown when nothing matches', () => {
    const blocker = classifyBlockerKind('Something unusual happened.', [], 'blocked');
    expect(blocker.kind).toBe('unknown');
    expect(blocker.recoverability).toBe('agent');
  });

  test('classifies terminal blockers as terminal regardless of kind', () => {
    const blocker = classifyBlockerKind(
      'terminal blocker: no unblock path exists',
      ['The environment cannot recover without human intervention.'],
      'blocked',
    );

    expect(blocker.recoverability).toBe('terminal');
    expect(blocker.signature).toContain('terminal-blocker');
  });

  test('takes only the first three blockedBy entries (before dedup) plus the reason and lifecycle', () => {
    // slice(0, 3) is applied before uniqueStrings(), so a duplicate within the first three
    // entries "uses up" a slot instead of letting a later, distinct entry take its place.
    const blocker = classifyBlockerKind('reason text', ['a', 'a', 'b', 'c', 'd'], 'blocked');
    expect(blocker.evidence).toEqual(['reason text', 'a', 'b', 'lifecycle=blocked']);
  });
});

describe('buildBlockerSignature', () => {
  test('builds a stable, slug-shaped signature from the blocker fields', () => {
    const signature = buildBlockerSignature(
      'task_interface_gap',
      'blocked',
      'The task interface is too weak.',
      ['The first executable step is ambiguous.'],
    );

    expect(signature).toMatch(/task-interface-gap/);
    expect(signature).toBe(signature.toLowerCase());
    expect(signature).not.toMatch(/[^a-z0-9-]/);
  });

  test('falls back to "<kind>-<lifecycleState>" when the seed slugifies to nothing', () => {
    const signature = buildBlockerSignature('unknown', 'blocked', '', []);
    expect(signature).toBe('unknown-blocked');
  });

  test('caps the signature length at 96 characters', () => {
    const longReason = 'x'.repeat(500);
    const signature = buildBlockerSignature('unknown', 'blocked', longReason, []);
    expect(signature.length).toBeLessThanOrEqual(96);
  });
});
