import type { ProposedDimension, StructuredDecision } from '../../contracts/brainstormer/brainstormerContracts.js';

/**
 * A decision, drawn as a choice rather than argued in prose (024-specification-flow).
 *
 * The recommendation is marked, never pre-selected. That distinction is the whole point: a
 * recommendation the human has to actively accept leaves a record of a human choosing, and a
 * default they have to actively reject does not.
 */
export function renderDecision(decision: StructuredDecision): string[] {
  return [
    '',
    `  ${decision.question}`,
    `  (${decision.axis} — yours to decide)`,
    '',
    ...decision.options.flatMap((option, index) => [
      `    ${index + 1}. ${option.label}${index === decision.recommended_index ? '   ← my recommendation' : ''}`,
      `       ${option.implies}`,
    ]),
    '',
  ];
}

/**
 * A dimension the agent noticed is missing.
 *
 * Framed as a proposal because it is one: the checklist has the same asymmetry as a context
 * manifest -- the agent may grow a declared floor, never replace one, and never without a keystroke.
 */
export function renderProposedDimension(proposal: ProposedDimension): string[] {
  return [
    '',
    `  Something we have not covered: ${proposal.name}`,
    `    ${proposal.why}`,
    '',
  ];
}
