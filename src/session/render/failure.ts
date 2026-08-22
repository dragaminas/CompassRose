/**
 * How a failure appears inside the session.
 *
 * The structured blocker card (`src/orchestrator/blockerCard.ts`) is unchanged and still rendered:
 * it is the deterministic, bounded account of what the runtime recorded. What this adds is the
 * sentence a human actually needs -- what it means and what they can do -- and the invitation to
 * ask about it here rather than going to read `state.md`.
 *
 * `state.md` keeps every fact it kept before. It stops being the place you must go to understand.
 */
import { renderBlockerCard, type BlockerCardInput } from '../../orchestrator/blockerCard.js';

export interface FailureViewInput {
  readonly card: BlockerCardInput;
  /**
   * Human-language account of the failure, generated once when the item blocked. Null when it has
   * not been generated yet -- the card alone is still a complete, if terser, answer.
   */
  readonly explanation: string | null;
}

function indent(lines: readonly string[]): string[] {
  return lines.map((line) => `  ${line}`);
}

function wrapParagraph(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) {
    return [];
  }

  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length > width && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  lines.push(current);
  return lines;
}

const EXPLANATION_WIDTH = 68;

export function renderFailureView(input: FailureViewInput): string[] {
  const lines: string[] = ['', ...indent(renderBlockerCard(input.card))];

  if (input.explanation) {
    lines.push('');
    for (const paragraph of input.explanation.split('\n\n')) {
      lines.push(...indent(wrapParagraph(paragraph, EXPLANATION_WIDTH)));
      lines.push('');
    }
  } else {
    lines.push('');
  }

  lines.push(`  Ask me about this, or type /desbloquear ${input.card.itemId} to work through it.`);
  lines.push('');

  return lines;
}
