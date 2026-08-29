import { describe, expect, test } from 'vitest';
import type { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import type { StructuredDecision } from '../src/contracts/brainstormer/brainstormerContracts.js';
import {
  considerDimension,
  takeDecision,
  type SpecificationConversationState,
} from '../src/cli/specificationTurn.js';

/**
 * The mechanisms 024-specification-flow exists for, now shared by both front ends.
 *
 * They were reachable only from the interactive session until ADR-0049: `compassrose brainstorm`
 * printed the agent's reply and dropped the decision, the proposed dimension, the provenance section
 * and the audit. Testing them here rather than through either transport is what makes "both do the
 * same thing" a property instead of a claim -- `ask` and `print` are the whole interface.
 */
function conversation(): SpecificationConversationState {
  return {
    transcript: [],
    segment: [],
    decisions: [],
    competency: { product: 'human', architecture: 'agent', implementation: 'agent' },
    author: 'human',
  };
}

const decision: StructuredDecision = {
  question: 'What should `list` do when the store does not exist yet?',
  axis: 'product',
  options: [
    { label: 'Print nothing and exit 0', detail: 'An empty list is a valid state.' },
    { label: 'Print a hint and exit 0', detail: 'Tells a first-time user what to do next.' },
  ],
  recommended_index: 1,
  rationale: 'Both are defensible; it commits the tool to a tone.',
};

describe('a decision the agent surfaced instead of taking', () => {
  test('a chosen number is recorded as the human\'s and reaches the transcript', async () => {
    const state = conversation();
    const printed: string[] = [];

    await takeDecision(state, decision, async () => '1', (lines) => printed.push(...lines));

    expect(state.decisions).toHaveLength(1);
    expect(state.decisions[0]).toMatchObject({
      question: decision.question,
      axis: 'product',
      chosen: 'Print nothing and exit 0',
      decided_by: 'human',
    });
    // Nothing is carried in memory that is not also written down: the answer becomes a turn, which
    // is how it reaches the next turn and the drafted specification.
    expect(state.transcript).toHaveLength(1);
    expect(state.segment).toHaveLength(1);
    expect(state.transcript[0]!.text).toContain('Print nothing and exit 0');
    expect(printed.join('\n')).toContain('Noted: Print nothing and exit 0.');
  });

  test('declining to choose falls to the recommendation and is recorded as the agent\'s', async () => {
    const state = conversation();
    const printed: string[] = [];

    await takeDecision(state, decision, async () => 'no preference', (lines) => printed.push(...lines));

    expect(state.decisions[0]).toMatchObject({
      chosen: 'Print a hint and exit 0',
      decided_by: 'agent',
    });
    expect(printed.join('\n')).toContain('Noted as mine, not yours');
  });
});

describe('a dimension the agent noticed', () => {
  test('joins the checklist only on an explicit yes', async () => {
    const added: Array<readonly [string, string, string]> = [];
    const orchestrator = {
      proposeDimension: (name: string, why: string, author: string) => {
        added.push([name, why, author]);
      },
    } as unknown as CompassRoseOrchestrator;

    const proposal = { name: 'concurrent edits', why: 'Two shells can write the store at once.' };

    await considerDimension(orchestrator, conversation(), proposal, async () => 'n', () => {});
    expect(added).toHaveLength(0);

    await considerDimension(orchestrator, conversation(), proposal, async () => 'si', () => {});
    expect(added).toEqual([['concurrent edits', 'Two shells can write the store at once.', 'human']]);
  });
});
