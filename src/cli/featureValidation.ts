import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { findGitRepositoryRoot } from '../git/gitStatus.js';
import { getBootstrapConfigPath } from '../config/compassRosePaths.js';
import { CompassRoseOrchestrator } from '../orchestrator/orchestrator.js';
import { parseRunArguments } from './runOptions.js';
import type { CliEnvironment } from './main.js';
import type { ValidationRoundRecord } from '../contracts/validator/validatorContracts.js';

// A round cap, not a retry budget (ADR-0033-style: every bounded loop in this codebase declares
// its own ceiling rather than running unbounded) -- reached only if a human keeps answering
// without ever typing the confirmation keyword; the item is simply left `awaiting_validation`
// and picked up again on the next run.
const MAX_ROUNDS_PER_ITEM = 25;
// Hardcoded and case-insensitive by design (ADR-0046): this is the ONLY input that may end the
// loop and call CompassRoseOrchestrator.confirmFeatureValidation -- never the model's own
// `decision_points: []` signal, which only changes what gets displayed next.
const CONFIRM_KEYWORD = 'listo';

/**
 * Flow 1 ("npm run feature-validation", ADR-0046): the human-confirmed gate between a feature/
 * fix's autonomous formalization and Flow 2's autonomous plan/implement/review pipeline. Walks
 * every feature/fix CompassRoseOrchestrator.listFeaturesAwaitingValidation() reports, running a
 * bounded propose/answer loop per item over the process's own stdin/stdout via Node's built-in
 * `readline` (no new runtime dependency), until the human types "listo".
 */
export async function runFeatureValidationCli(
  argv: readonly string[] = [],
  environment: CliEnvironment = {},
): Promise<number> {
  const stdout = environment.stdout ?? ((message: string) => process.stdout.write(`${message}\n`));
  const stderr = environment.stderr ?? ((message: string) => process.stderr.write(`${message}\n`));
  const cwd = environment.cwd ?? process.cwd();

  const gitRoot = findGitRepositoryRoot(cwd);
  if (gitRoot === null) {
    stderr('runtime preflight: git repository: current directory is not inside a git repository');
    return 1;
  }

  const configPath = getBootstrapConfigPath(gitRoot);
  if (!existsSync(configPath)) {
    stderr(`runtime preflight: configuration: ${configPath} is absent. Run "npm run setup" first.`);
    return 1;
  }

  let options;
  try {
    options = parseRunArguments(argv, gitRoot);
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    stderr('Usage: compassrose feature-validation [--no-commit] [--cwd <path>]');
    return 1;
  }

  const orchestrator = new CompassRoseOrchestrator({ ...options, cwd: gitRoot });
  const pending = orchestrator.listFeaturesAwaitingValidation();
  if (pending.length === 0) {
    stdout('No feature or fix is awaiting validation.');
    return 0;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (question: string): Promise<string> =>
    new Promise((resolveAnswer) => rl.question(question, resolveAnswer));

  try {
    for (const item of pending) {
      stdout('');
      stdout(`=== ${item.id} ===`);
      const weight = orchestrator.classifyValidationWeight(item.id);
      stdout(`Validation weight: ${weight}`);

      const transcript: ValidationRoundRecord[] = [];
      let confirmed = false;

      roundLoop:
      for (let round = 1; round <= MAX_ROUNDS_PER_ITEM; round += 1) {
        const proposal = orchestrator.runNextValidationRound(item.id, weight, transcript);

        if (proposal.decision_points.length === 0) {
          stdout('');
          stdout('The validator has nothing further to raise.');
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
          stdout('');
          stdout(decisionPoint.question);
          for (const option of decisionPoint.options) {
            const recommended = option.id === decisionPoint.recommended_option_id ? ' (recommended)' : '';
            stdout(`  [${option.id}] ${option.label}${recommended} -- ${option.detail}`);
          }
          stdout(`Rationale: ${decisionPoint.rationale}`);

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
        stdout('');
        stdout(`Reached the ${MAX_ROUNDS_PER_ITEM}-round limit for ${item.id} without confirmation; leaving it awaiting validation. Rerun "npm run feature-validation" to continue.`);
        continue;
      }

      orchestrator.confirmFeatureValidation(item.id, transcript);
      stdout('');
      stdout(`Confirmed ${item.id}.`);
    }
  } finally {
    rl.close();
  }

  return 0;
}
