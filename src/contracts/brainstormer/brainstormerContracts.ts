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
}
