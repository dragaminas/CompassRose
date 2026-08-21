import { describe, expect, test } from 'vitest';
import { parseBlockedByBullets, renderBlockerCard } from '../src/orchestrator/blockerCard.js';

describe('renderBlockerCard', () => {
  test('always includes itemId, kind, recoverability, and the pointer path', () => {
    const lines = renderBlockerCard({
      itemId: '001-widgets',
      itemPathRelative: 'compassrose/features/001-widgets/state.md',
      kind: 'implementation_failure',
      recoverability: 'agent',
      reason: 'The widget renderer crashed.',
      evidence: [],
    });

    expect(lines[0]).toContain('001-widgets');
    expect(lines.join('\n')).toContain('kind: implementation_failure');
    expect(lines.join('\n')).toContain('recoverability: agent');
    expect(lines.join('\n')).toContain('compassrose/features/001-widgets/state.md');
  });

  test('collapses a long multi-line reason to one truncated first line', () => {
    const longFirstLine = 'A'.repeat(400);
    const lines = renderBlockerCard({
      itemId: '002-notes',
      itemPathRelative: 'compassrose/features/002-notes/state.md',
      kind: 'review_failure',
      recoverability: 'human',
      reason: `${longFirstLine}\nsecond finding\nthird finding`,
      evidence: [],
    });

    const whatHappenedLine = lines.find((line) => line.startsWith('what happened:'));
    expect(whatHappenedLine).toBeDefined();
    expect(whatHappenedLine).not.toContain('second finding');
    expect(whatHappenedLine!.length).toBeLessThan(400);
    expect(whatHappenedLine).toContain('...');
  });

  test('shows at most two evidence lines and summarizes the rest', () => {
    const lines = renderBlockerCard({
      itemId: '003-search',
      itemPathRelative: 'compassrose/features/003-search/state.md',
      kind: 'task_interface_gap',
      recoverability: 'agent',
      reason: 'Scope was unclear.',
      evidence: ['first item', 'second item', 'third item', 'fourth item'],
    });

    const evidenceLines = lines.filter((line) => line.startsWith('evidence:'));
    expect(evidenceLines).toHaveLength(2);
    expect(lines).toContain('... and 2 more (see full detail)');
  });

  test('truncates an individually long evidence item', () => {
    const longItem = 'B'.repeat(300);
    const lines = renderBlockerCard({
      itemId: '004-export',
      itemPathRelative: 'compassrose/features/004-export/state.md',
      kind: 'environment',
      recoverability: 'terminal',
      reason: 'Missing binary.',
      evidence: [longItem],
    });

    const evidenceLine = lines.find((line) => line.startsWith('evidence:'));
    expect(evidenceLine!.length).toBeLessThan(300);
    expect(evidenceLine).toContain('...');
  });

  test('stays within a small fixed total line budget regardless of input size', () => {
    const lines = renderBlockerCard({
      itemId: '005-huge',
      itemPathRelative: 'compassrose/features/005-huge/state.md',
      kind: 'unknown',
      recoverability: 'human',
      reason: Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n'),
      evidence: Array.from({ length: 50 }, (_, i) => `evidence ${i}`),
    });

    expect(lines.length).toBeLessThanOrEqual(8);
  });
});

describe('parseBlockedByBullets', () => {
  test('reconstructs a BlockerCardInput from buildBlockedByLines-shaped bullets', () => {
    const bullets = [
      'kind: state_corruption',
      'signature: state-corruption-001',
      'recoverability: human',
      'observed_state: lifecycle=blocked',
      'evidence: stale active_task pointer',
      'evidence: state.md missing Operational Status',
      'reason: State document is internally inconsistent.',
    ];

    const card = parseBlockedByBullets('001-widgets', 'compassrose/features/001-widgets/state.md', bullets);

    expect(card).toEqual({
      itemId: '001-widgets',
      itemPathRelative: 'compassrose/features/001-widgets/state.md',
      kind: 'state_corruption',
      recoverability: 'human',
      reason: 'State document is internally inconsistent.',
      evidence: ['stale active_task pointer', 'state.md missing Operational Status'],
    });
  });

  test('falls back to safe defaults when a field is absent', () => {
    const card = parseBlockedByBullets('002-notes', 'compassrose/features/002-notes/state.md', []);

    expect(card.kind).toBe('unknown');
    expect(card.recoverability).toBe('human');
    expect(card.evidence).toEqual([]);
  });
});
