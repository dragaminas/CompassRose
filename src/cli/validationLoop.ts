import type { CompassRoseOrchestrator } from '../orchestrator/orchestrator.js';
import type { ValidationRoundRecord } from '../contracts/validator/validatorContracts.js';

// A round cap, not a retry budget (ADR-0033-style: every bounded loop in this codebase declares
// its own ceiling rather than running unbounded) -- reached only if a human keeps answering
// without ever typing the confirmation keyword; the item is simply left `awaiting_validation`
// and picked up again on the next run.
const MAX_ROUNDS_PER_ITEM = 25;
// Hardcoded and case-insensitive by design (ADR-0046): this is the ONLY input that may end the
// loop and call CompassRoseOrchestrator.confirmFeatureValidation -- never the model's own
// `decision_points: []` signal, which only changes what gets displayed next.
export const CONFIRM_KEYWORD = 'listo';

export interface ValidationLoopResult {
  readonly confirmed: boolean;
  readonly transcript: ValidationRoundRecord[];
}

/**
 * The bounded propose/answer loop shared by Flow 1 ("npm run feature-validation") and Flow B
 * ("npm run brainstorm", which runs this inline right after drafting a new feature): classify
 * how much back-and-forth `itemId` needs, then repeatedly propose decision points until the
 * human types "listo" or the round cap is reached. Does not itself call
 * CompassRoseOrchestrator.confirmFeatureValidation() -- the caller owns that, matching the
 * existing split of responsibility (see ADR-0046).
 */
export async function runValidationLoopForItem(
  orchestrator: CompassRoseOrchestrator,
  itemId: string,
  ask: (question: string) => Promise<string>,
  print: (line: string) => void,
): Promise<ValidationLoopResult> {
  const weight = orchestrator.classifyValidationWeight(itemId);
  print(`Validation weight: ${weight}`);

  const transcript: ValidationRoundRecord[] = [];
  let confirmed = false;

  roundLoop:
  for (let round = 1; round <= MAX_ROUNDS_PER_ITEM; round += 1) {
    const proposal = orchestrator.runNextValidationRound(itemId, weight, transcript);

    if (proposal.decision_points.length === 0) {
      print('');
      print('The validator has nothing further to raise.');
      const answer = await ask(`Type "${CONFIRM_KEYWORD}" to confirm, or provide a clarification to continue: `);
      const trimmed = answer.trim();
      if (trimmed.toLowerCase() === CONFIRM_KEYWORD) {
        confirmed = true;
        break roundLoop;
      }

      transcript.push({
        decision_point: null,
        chosen_option_id: null,
        free_text: trimmed,
        answered_at: new Date().toISOString(),
      });
      continue roundLoop;
    }

    for (const decisionPoint of proposal.decision_points) {
      print('');
      print(decisionPoint.question);
      for (const option of decisionPoint.options) {
        const recommended = option.id === decisionPoint.recommended_option_id ? ' (recommended)' : '';
        print(`  [${option.id}] ${option.label}${recommended} -- ${option.detail}`);
      }
      print(`Rationale: ${decisionPoint.rationale}`);

      const answer = await ask(
        `Choose an option id, type free text, or type "${CONFIRM_KEYWORD}" to confirm: `,
      );
      const trimmed = answer.trim();
      if (trimmed.toLowerCase() === CONFIRM_KEYWORD) {
        confirmed = true;
        break roundLoop;
      }

      const chosenOption = decisionPoint.options.find((option) => option.id === trimmed);
      transcript.push({
        decision_point: decisionPoint,
        chosen_option_id: chosenOption ? chosenOption.id : null,
        free_text: chosenOption ? null : trimmed,
        answered_at: new Date().toISOString(),
      });
    }
  }

  if (!confirmed) {
    print('');
    print(`Reached the ${MAX_ROUNDS_PER_ITEM}-round limit for ${itemId} without confirmation; leaving it awaiting validation.`);
  }

  return { confirmed, transcript };
}
