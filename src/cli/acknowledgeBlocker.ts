import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { findGitRepositoryRoot } from '../git/gitStatus.js';
import { getBootstrapConfigPath } from '../config/compassRosePaths.js';
import { CompassRoseOrchestrator } from '../orchestrator/orchestrator.js';
import { renderBlockerCard } from '../orchestrator/blockerCard.js';
import { parseRunArguments } from './runOptions.js';
import type { CliEnvironment } from './main.js';
import { CONFIRM_KEYWORD } from './validationLoop.js';

/**
 * "npm run acknowledge-blocker": the ONLY human-facing entry point that can clear a
 * `blocked_on_human` exclusion (see CompassRoseOrchestrator.acknowledgeBlocker(), ADR-0007 --
 * only an explicit human action may cross this gate, never AI-response handling). Walks every
 * feature/fix listHumanBlockedWorkItems() reports, prints its bounded blocker card, and calls
 * acknowledgeBlocker() only when the human types "listo"; anything else leaves it blocked and
 * moves to the next item.
 */
export async function runAcknowledgeBlockerCli(
  argv: readonly string[] = [],
  environment: CliEnvironment = {},
): Promise<number> {
  const stdout = environment.stdout ?? ((message: string) => process.stdout.write(`${message}\n`));
  const stderr = environment.stderr ?? ((message: string) => process.stderr.write(`${message}\n`));
  const cwd = environment.cwd ?? process.cwd();

  // Arguments before the git-root lookup, so `--cwd` can actually point somewhere else. It was
  // accepted and then discarded here until ADR-0049: the root was resolved from the process's own
  // directory and passed to the orchestrator as `cwd: gitRoot`, overwriting whatever was parsed.
  let options;
  try {
    options = parseRunArguments(argv, cwd);
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    stderr('Usage: compassrose acknowledge-blocker [--no-commit] [--cwd <path>]');
    return 1;
  }

  const gitRoot = findGitRepositoryRoot(options.cwd);
  if (gitRoot === null) {
    stderr(`runtime preflight: git repository: ${options.cwd} is not inside a git repository`);
    return 1;
  }

  const configPath = getBootstrapConfigPath(gitRoot);
  if (!existsSync(configPath)) {
    stderr(`runtime preflight: configuration: ${configPath} is absent. Run "compassrose setup" first.`);
    return 1;
  }

  const orchestrator = new CompassRoseOrchestrator({ ...options, cwd: gitRoot });
  const pending = orchestrator.listHumanBlockedWorkItems();
  if (pending.length === 0) {
    stdout('No feature or fix needs human acknowledgment.');
    return 0;
  }

  const blockedCards = orchestrator.listBlockedWorkItems();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (question: string): Promise<string> =>
    new Promise((resolveAnswer) => rl.question(question, resolveAnswer));

  try {
    for (const item of pending) {
      stdout('');
      const card = blockedCards.find((candidate) => candidate.itemId === item.id);
      if (card) {
        stdout(renderBlockerCard(card).join('\n'));
      } else {
        stdout(`=== BLOCKED: ${item.id} ===`);
      }

      const answer = await ask(
        `Once you've resolved this outside CompassRose, type "${CONFIRM_KEYWORD}" to resume ${item.id} automatically, or anything else to leave it blocked: `,
      );
      if (answer.trim().toLowerCase() === CONFIRM_KEYWORD) {
        orchestrator.acknowledgeBlocker(item.id);
        stdout(`Acknowledged ${item.id}; it will resume on the next "npm run app" run.`);
      } else {
        stdout(`Left ${item.id} blocked. Rerun "npm run acknowledge-blocker" once it's actually resolved.`);
      }
    }
  } finally {
    rl.close();
  }

  return 0;
}
