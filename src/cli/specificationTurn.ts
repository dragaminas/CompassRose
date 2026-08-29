/**
 * The three things a specification conversation owes the project, independent of what is hosting it
 * (024-specification-flow).
 *
 * These lived inside `src/session/`, reachable only from the interactive session. `compassrose
 * brainstorm` is the other documented entry point into the same flow and had none of them: it
 * printed the agent's `reply` and dropped everything else on the floor. A decision the agent
 * surfaced instead of taking was never shown, so the human never answered it and the profile that
 * says who owns which axis changed nothing; a proposed dimension never reached the checklist; and
 * the drafted specification got no provenance section and no audit against its own transcript.
 *
 * Found by running the CLI against a real project: the brainstormer raised a product-axis decision
 * on its first turn -- exactly what it is supposed to do -- and the human would never have seen it.
 *
 * Shared the same way `runValidationLoopForItem` already is: `ask` and `print` are the only
 * transport, so a terminal writer and a plain readline both fit.
 */
import type { CompassRoseOrchestrator } from '../orchestrator/orchestrator.js';
import type {
  BrainstormTurnRecord,
  ProposedDimension,
  RecordedDecision,
  StructuredDecision,
} from '../contracts/brainstormer/brainstormerContracts.js';
import type { SessionCompetencyProfile } from '../contracts/brainstormer/competency.js';
import { renderDecision, renderProposedDimension } from '../session/render/decision.js';

/**
 * What a specification conversation carries, whichever front end is running it.
 *
 * Mutable on purpose, and satisfied structurally by the interactive session's own `SessionState` so
 * that state does not have to be copied in and out at every call site.
 */
export interface SpecificationConversationState {
  transcript: BrainstormTurnRecord[];
  segment: BrainstormTurnRecord[];
  decisions: RecordedDecision[];
  competency: SessionCompetencyProfile;
  /** Who is in this session, for attributing coverage decisions. Never a competency claim. */
  author: string;
}

export type Ask = (question: string) => Promise<string>;
export type Print = (lines: readonly string[]) => void;

/**
 * A decision the agent surfaced instead of taking.
 *
 * The answer becomes a human turn in the transcript, which is how it reaches both the next turn and
 * the drafted specification -- nothing is carried in memory that is not also written down. And it
 * is recorded separately, with who gave it, for the provenance section: declining to choose is a
 * legitimate answer, but a specification built on it is a different artifact from one built on a
 * human's choice, and only one of those is safe to build on without checking.
 */
export async function takeDecision(
  state: SpecificationConversationState,
  decision: StructuredDecision,
  ask: Ask,
  print: Print,
): Promise<void> {
  print(renderDecision(decision));

  const answer = (await ask('  Number, or anything else to let me choose: ')).trim();
  const index = Number.parseInt(answer, 10) - 1;
  const picked = Number.isInteger(index) && index >= 0 && index < decision.options.length ? index : null;
  const fallback = decision.recommended_index ?? 0;
  const chosenIndex = picked ?? fallback;
  const chosen = decision.options[chosenIndex];
  if (!chosen) {
    return;
  }

  state.decisions = [
    ...state.decisions,
    {
      question: decision.question,
      axis: decision.axis,
      chosen: chosen.label,
      decided_by: picked === null ? 'agent' : 'human',
    },
  ];

  const spoken = picked === null
    ? `I have no preference here, so take yours: ${chosen.label}.`
    : `On "${decision.question}" I choose: ${chosen.label}.`;
  const turn: BrainstormTurnRecord = { role: 'human', text: spoken, recorded_at: new Date().toISOString() };
  state.transcript = [...state.transcript, turn];
  state.segment = [...state.segment, turn];

  print([
    picked === null
      ? `  Noted as mine, not yours: ${chosen.label}.`
      : `  Noted: ${chosen.label}.`,
    '',
  ]);
}

/**
 * A dimension the agent noticed the specification has not covered.
 *
 * A proposal, never an addition. The checklist grows only through a keystroke, exactly like every
 * other state transition in this system.
 */
export async function considerDimension(
  orchestrator: CompassRoseOrchestrator,
  state: SpecificationConversationState,
  proposal: ProposedDimension,
  ask: Ask,
  print: Print,
): Promise<void> {
  print(renderProposedDimension(proposal));

  const answer = (await ask('  Add it to the list? (y/N): ')).trim().toLowerCase();
  if (!/^(y|s|si|sí|yes)$/.test(answer)) {
    print(['  Left off the list.', '']);
    return;
  }

  orchestrator.proposeDimension(proposal.name, proposal.why, state.author);
  print(['  Added. /cobertura shows where it stands.', '']);
}

/**
 * The two things a freshly drafted specification owes the project (024-specification-flow).
 *
 * Provenance is written unconditionally: a specification with no recorded decisions is a real and
 * legitimate outcome, and saying so is different from saying nothing.
 *
 * Coverage is asked rather than inferred. A drafted feature obviously addresses *something*, but
 * which dimension it closes is a judgment about scope, and the checklist exists precisely because
 * that judgment was being skipped. Guessing here would put the agent's opinion into a document
 * whose entire value is that a human decided it.
 */
export async function recordProvenanceAndCoverage(
  orchestrator: CompassRoseOrchestrator,
  state: SpecificationConversationState,
  itemId: string,
  ask: Ask,
  print: Print,
): Promise<void> {
  // The audit runs before provenance is written, because what it finds belongs in that section.
  // It is the only thing standing between "the agent surfaced every real decision" as a contract
  // instruction and as a property anyone can check: a turn that quietly decided for the human
  // looks exactly like a turn where nothing forked, but a *document* asserting something nobody
  // ever said does not look like one that was chosen.
  const unsourced = orchestrator.auditSpecificationDecisions(itemId, state.transcript, state.competency);

  orchestrator.recordSpecificationProvenance(itemId, state.competency, state.decisions, unsourced);
  state.decisions = [];

  if (unsourced.length > 0) {
    print([
      '',
      `  ${unsourced.length === 1 ? 'One thing' : `${unsourced.length} things`} in this specification I decided without asking you:`,
      ...unsourced.map((claim) => `    - ${claim.claim} (${claim.axis})`),
      '',
      '  Recorded as mine in the provenance section. Say so now if any of them should have been yours.',
      '',
    ]);
  }

  const uncovered = orchestrator.readDimensions().filter((dimension) => dimension.state === 'uncovered');
  if (uncovered.length === 0) {
    return;
  }

  print([
    '',
    `  Does ${itemId} cover any of these?`,
    ...uncovered.map((dimension, index) => `    ${index + 1}. ${dimension.name}`),
    '',
  ]);

  const answer = (await ask('  Numbers, comma-separated, or anything else for none: ')).trim();
  const chosen = answer
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10) - 1)
    .filter((index) => Number.isInteger(index) && index >= 0 && index < uncovered.length)
    .map((index) => uncovered[index]!.name);

  if (chosen.length === 0) {
    print(['  Nothing marked covered.', '']);
    return;
  }

  for (const name of chosen) {
    orchestrator.markDimensionCovered(name, itemId, state.author);
  }

  print([`  Marked covered by ${itemId}: ${chosen.join(', ')}.`, '']);
}
