/**
 * The diagnosis a human is handed when they sit down to unblock something
 * (026-conversational-doctor-recovery).
 *
 * Recovery used to be a machine talking to itself: a chain of planned and executed repair tasks
 * that wrote lessons, compacted history, and re-entered the pipeline -- nine of them on a single
 * feature, without unblocking it and without ever asking a question. Meanwhile the information that
 * would have resolved most blockages (was that file supposed to change? did the spec anticipate
 * this coupling? is the service down?) existed only in the human's head and was never requested.
 *
 * This contract encodes the division of labor: the agent brings what it can read, and asks for what
 * it cannot.
 */

/**
 * The four places a root cause can be. Together they are exhaustive, which is why the set is
 * closed: drop any one and a class of blockage has no way out.
 *
 * - `retry`                -- the agent did not know something; what the human said becomes context for a fresh attempt
 * - `correct_specification`-- the specification is wrong or incomplete; replan from a corrected one
 * - `open_fix`             -- the root cause is elsewhere in the codebase; file a fix and wait on it
 * - `resolve_by_hand`      -- the root cause is outside the repository; the human fixes it and confirms
 */
export type RecoveryExit = 'retry' | 'correct_specification' | 'open_fix' | 'resolve_by_hand';

export interface RecoveryHypothesis {
  readonly summary: string;
  /** Facts drawn from the repository. Never speculation, never something only the human could know. */
  readonly evidence: readonly string[];
  /** What the human knows and the repository does not say. Never something the agent could have read. */
  readonly discriminating_question: string;
  /** Orders how exits are offered. A suggestion only -- it can never select one. */
  readonly suggested_exit: RecoveryExit;
}

export interface RecoveryDiagnosis {
  readonly item_id: string;
  /** Two or three, ordered by likelihood. */
  readonly hypotheses: readonly RecoveryHypothesis[];
}

/**
 * A diagnosis as stored, so resuming a conversation reloads it rather than re-deriving it.
 *
 * Re-running the diagnosis would spend another call to produce a *different* set of hypotheses, and
 * the human would find themselves answering a different question than the one they left.
 */
export interface StoredRecoveryDiagnosis {
  readonly diagnosis: RecoveryDiagnosis;
  readonly generated_at: string;
  /** The blocker signature this diagnosis was generated for; a different blocker needs a new one. */
  readonly blocker_signature: string;
}

export const RECOVERY_EXIT_LABELS: Readonly<Record<RecoveryExit, string>> = {
  retry: 'retry the failed step with what you just told me',
  correct_specification: 'correct the specification and replan',
  open_fix: 'open a separate fix for the root cause',
  resolve_by_hand: 'you resolve it yourself, then confirm',
};

/**
 * Exits offered in the order the leading hypothesis suggests, then the rest in their fixed order.
 * Ordering is presentation; it never narrows the set, because all four remain reachable regardless
 * of what the agent believes.
 */
export function orderedExitsFor(diagnosis: RecoveryDiagnosis): readonly RecoveryExit[] {
  const fixedOrder: RecoveryExit[] = ['retry', 'correct_specification', 'open_fix', 'resolve_by_hand'];
  const leading = diagnosis.hypotheses[0]?.suggested_exit;
  if (!leading) {
    return fixedOrder;
  }

  return [leading, ...fixedOrder.filter((exit) => exit !== leading)];
}
