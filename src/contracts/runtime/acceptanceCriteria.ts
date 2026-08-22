/**
 * Verifying a feature's own acceptance criteria before the runtime is allowed to close it
 * (025-automated-development-loop).
 *
 * Before this existed there was no code path from "the outline is exhausted and every task was
 * approved" to `completed` at all -- the loop only knew how to say "formalize additional task
 * requests", which is right when a task request was genuinely forgotten and wrong when the work is
 * actually finished. Both features that have ever been completed in this repository were closed by
 * hand.
 */

export type AcceptanceCriterionStatus = 'met' | 'unmet' | 'unverifiable';

export interface AcceptanceCriterionVerdict {
  readonly criterion: string;
  readonly status: AcceptanceCriterionStatus;
  readonly evidence: string;
}

export interface AcceptanceCriteriaVerification {
  readonly feature_id: string;
  readonly summary: string;
  readonly verdicts: readonly AcceptanceCriterionVerdict[];
}

/**
 * A feature may close only when every criterion is `met`.
 *
 * `unverifiable` deliberately counts against closing. The default is to keep a feature open: a
 * criterion the verifier could not check is a criterion nobody has checked, and closing on it would
 * make "completed" mean "nothing contradicted it", which is not the same thing at all.
 */
export function allCriteriaMet(verification: AcceptanceCriteriaVerification): boolean {
  return verification.verdicts.length > 0 && verification.verdicts.every((verdict) => verdict.status === 'met');
}

export function unmetCriteria(
  verification: AcceptanceCriteriaVerification,
): readonly AcceptanceCriterionVerdict[] {
  return verification.verdicts.filter((verdict) => verdict.status !== 'met');
}
