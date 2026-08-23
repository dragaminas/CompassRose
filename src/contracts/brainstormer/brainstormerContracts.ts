/**
 * Contracts for Flow B ("npm run brainstorm") -- the conversational discovery session that
 * turns a vague or precise idea into one or more candidate features, each formalized and
 * validated inline. See src/contracts/brainstormer/brainstorm-turn-prompt.md, ADR-0007/0046.
 */

/**
 * One turn of the brainstorming conversation, kept for the brainstormer's own context and,
 * filtered to `role: 'human'`, as the deterministic source for a freshly-minted feature's
 * `request.md` (the orchestrator renders that file itself; the AI never authors it).
 */
export interface BrainstormTurnRecord {
  readonly role: 'human' | 'assistant';
  readonly text: string;
  readonly recorded_at: string;
}

/**
 * One round's proposal from the brainstormer role. `ready_to_draft` is advisory only -- per
 * ADR-0007, only the human's own "crear" keystroke in the CLI loop may turn a candidate idea
 * into an actual feature; this flag never triggers that transition by itself.
 */
export interface BrainstormTurnOutput {
  readonly reply: string;
  readonly ready_to_draft: boolean;
  readonly proposed_title: string | null;
  readonly proposed_summary: string | null;
  /**
   * A real choice, surfaced instead of taken (024-specification-flow).
   *
   * This is what the competency profile is *for*. Declaring who owns which axis did nothing until
   * something changed shape because of it: on an axis the human owns, the agent must put the
   * decision here rather than quietly picking and writing prose about it. On an axis the agent
   * owns, this stays null and the reasoning goes in `reply`.
   *
   * Null is the common case. A turn that raises a decision every time is a turn that has stopped
   * distinguishing decisions from details.
   */
  readonly decision: StructuredDecision | null;
  /**
   * A dimension of the application the conversation has not covered, noticed by the agent.
   *
   * Proposals only. The checklist has the same asymmetry as a context manifest: the agent may grow
   * a declared floor, it can never replace one, and the growth never happens without a human
   * keystroke. See `src/state/dimensions.ts`.
   */
  readonly proposed_dimension: ProposedDimension | null;
}

export interface DecisionOption {
  readonly label: string;
  /** What choosing this actually commits the project to. Not a restatement of the label. */
  readonly implies: string;
}

export interface StructuredDecision {
  readonly question: string;
  /** Which competency axis this decision sits on. Only ever one the human owns. */
  readonly axis: 'product' | 'architecture' | 'implementation';
  /** Two to four. One option is not a decision; five is a survey. */
  readonly options: readonly DecisionOption[];
  /** Index into `options`, or null when the agent genuinely has no preference. */
  readonly recommended_index: number | null;
}

export interface ProposedDimension {
  readonly name: string;
  /** Why this project in particular needs it covered. Never a generic checklist item. */
  readonly why: string;
}

/**
 * A decision as taken, kept for the drafted specification's provenance section.
 *
 * Records the answer *and* who gave it, because "the human chose the second option" and "nobody
 * was asked and the agent chose the second option" produce the same specification text and are not
 * the same fact about it.
 */
export interface RecordedDecision {
  readonly question: string;
  readonly axis: StructuredDecision['axis'];
  readonly chosen: string;
  readonly decided_by: 'human' | 'agent';
}
