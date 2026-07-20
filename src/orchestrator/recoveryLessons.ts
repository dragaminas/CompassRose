import type { RecoveryLessonCategory } from '../contracts/runtime/taskInterfaceAnalysis.js';

/**
 * Deterministically classifies a recovery lesson's primary defect category from which of its
 * own already-structured fields are populated -- never free-text keyword matching over prose,
 * which would be fragile. Checked in priority order because a single lesson can legitimately
 * populate more than one of these arrays; the first match is reported as the primary category.
 */
export function classifyRecoveryLessonCategory(fields: {
  readonly scopeIsolationNotes: readonly string[];
  readonly qualityGateFailures: readonly string[];
  readonly implementerLimitations: readonly string[];
  readonly recommendedAction: 'tighten_task_interface' | 'document_implementer_limitation' | 'both' | 'none';
}): RecoveryLessonCategory {
  if (fields.scopeIsolationNotes.length > 0) {
    return 'scope_violation';
  }

  if (fields.qualityGateFailures.length > 0) {
    return 'malformed_quality_gate';
  }

  if (fields.implementerLimitations.length > 0 || fields.recommendedAction === 'document_implementer_limitation') {
    return 'weak_evidence';
  }

  if (fields.recommendedAction === 'tighten_task_interface' || fields.recommendedAction === 'both') {
    return 'task_interface_gap';
  }

  return 'other';
}
