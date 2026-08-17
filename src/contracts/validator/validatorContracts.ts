/**
 * Contracts for Flow 1 ("npm run feature-validation", ADR-0046) -- the human-confirmed gate
 * between a feature/fix's autonomous formalization and the autonomous plan/implement/review
 * pipeline (ADR-0034). See src/contracts/validator/feature-validation-prompt.md.
 */

/** How much back-and-forth this feature/fix's definition needs before a human can confirm it. */
export type ValidationWeight = 'bounded' | 'architectural';

export interface ValidationDecisionOption {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
}

export interface ValidationDecisionPoint {
  readonly id: string;
  readonly question: string;
  readonly applies_to: 'feature' | 'architecture';
  /** 0-3 concrete, labeled options -- never an open-ended question. */
  readonly options: readonly ValidationDecisionOption[];
  readonly recommended_option_id: string;
  readonly rationale: string;
}

/**
 * One round's proposal from the validator role. An empty `decision_points` array is the model's
 * "nothing left to raise" signal -- it is never, by itself, sufficient to confirm validation;
 * only the human's own "listo" keystroke in the CLI loop can do that (see
 * CompassRoseOrchestrator.confirmFeatureValidation).
 */
export interface ValidationDecisionPointsOutput {
  readonly decision_points: readonly ValidationDecisionPoint[];
}

/**
 * One round of the interactive loop: the decision point the validator proposed (or null on the
 * first round or once decision_points is empty and the human is just asked to confirm/clarify),
 * and the human's raw answer -- either a chosen option id, or free-text (a clarification/
 * override), timestamped for the full audit transcript.
 */
export interface ValidationRoundRecord {
  readonly decision_point: ValidationDecisionPoint | null;
  readonly chosen_option_id: string | null;
  readonly free_text: string | null;
  readonly answered_at: string;
}
