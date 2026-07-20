import { describe, expect, test } from 'vitest';
import { classifyRecoveryLessonCategory } from '../src/orchestrator/recoveryLessons.js';

function fields(overrides: Partial<Parameters<typeof classifyRecoveryLessonCategory>[0]> = {}) {
  return {
    scopeIsolationNotes: [] as readonly string[],
    qualityGateFailures: [] as readonly string[],
    implementerLimitations: [] as readonly string[],
    recommendedAction: 'none' as const,
    ...overrides,
  };
}

describe('classifyRecoveryLessonCategory', () => {
  test('classifies scope_violation when scope isolation notes are present', () => {
    expect(classifyRecoveryLessonCategory(fields({ scopeIsolationNotes: ['leaked docs/foo.md'] }))).toBe('scope_violation');
  });

  test('classifies malformed_quality_gate when quality gate failures are present', () => {
    expect(classifyRecoveryLessonCategory(fields({ qualityGateFailures: ['npm test: failed'] }))).toBe('malformed_quality_gate');
  });

  test('classifies weak_evidence when implementer limitations are present', () => {
    expect(classifyRecoveryLessonCategory(fields({ implementerLimitations: ['context too narrow'] }))).toBe('weak_evidence');
  });

  test('classifies weak_evidence when recommended_action is document_implementer_limitation, even with no limitation text', () => {
    expect(classifyRecoveryLessonCategory(fields({ recommendedAction: 'document_implementer_limitation' }))).toBe('weak_evidence');
  });

  test('classifies task_interface_gap when recommended_action is tighten_task_interface', () => {
    expect(classifyRecoveryLessonCategory(fields({ recommendedAction: 'tighten_task_interface' }))).toBe('task_interface_gap');
  });

  test('classifies task_interface_gap when recommended_action is both', () => {
    expect(classifyRecoveryLessonCategory(fields({ recommendedAction: 'both' }))).toBe('task_interface_gap');
  });

  test('classifies other when nothing else matches', () => {
    expect(classifyRecoveryLessonCategory(fields())).toBe('other');
  });

  test('prioritizes scope_violation over other populated fields', () => {
    expect(
      classifyRecoveryLessonCategory(
        fields({
          scopeIsolationNotes: ['leaked path'],
          qualityGateFailures: ['gate failed'],
          implementerLimitations: ['limited'],
          recommendedAction: 'both',
        }),
      ),
    ).toBe('scope_violation');
  });

  test('prioritizes malformed_quality_gate over weak_evidence/task_interface_gap', () => {
    expect(
      classifyRecoveryLessonCategory(
        fields({
          qualityGateFailures: ['gate failed'],
          implementerLimitations: ['limited'],
          recommendedAction: 'both',
        }),
      ),
    ).toBe('malformed_quality_gate');
  });
});
