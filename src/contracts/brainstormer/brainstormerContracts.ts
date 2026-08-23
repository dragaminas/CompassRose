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
/**
 * A claim the drafted specification makes on an axis the human owns, with nothing in the
 * conversation behind it (024-specification-flow).
 *
 * The gap this closes is the one thing in this feature that nothing could enforce: the contract
 * asks the agent to surface a decision when one exists, the schema permits it, and a turn that
 * quietly decides for the human is indistinguishable -- at the time -- from a turn where nothing
 * forked. `decision: null` and a well-written `reply` look identical either way.
 *
 * The way out is to stop asking the question at the turn, where there is no artifact of the
 * omission, and ask it at `/crear`, where there are two: the finished draft and the transcript. An
 * absence between two artifacts is detectable in a way an absence inside a model's reasoning is not.
 */
export interface UnsourcedClaim {
  /** What the specification asserts. */
  readonly claim: string;
  readonly axis: StructuredDecision['axis'];
  /** Why this was the human's to decide rather than a detail that follows from what they said. */
  readonly why_it_needed_a_human: string;
}

export interface SpecificationAudit {
  readonly unsourced_claims: readonly UnsourcedClaim[];
}

export interface RecordedDecision {
  readonly question: string;
  readonly axis: StructuredDecision['axis'];
  readonly chosen: string;
  readonly decided_by: 'human' | 'agent';
}
