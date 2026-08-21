import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { findGitRepositoryRoot } from '../git/gitStatus.js';
import { getBootstrapConfigPath } from '../config/compassRosePaths.js';
import { CompassRoseOrchestrator } from '../orchestrator/orchestrator.js';
import { parseRunArguments } from './runOptions.js';
import type { CliEnvironment } from './main.js';
import { runValidationLoopForItem } from './validationLoop.js';

/**
 * Flow 1 ("npm run feature-validation", ADR-0046): the human-confirmed gate between a feature/
 * fix's autonomous formalization and Flow 2's autonomous plan/implement/review pipeline. Walks
 * every feature/fix CompassRoseOrchestrator.listFeaturesAwaitingValidation() reports, running
 * runValidationLoopForItem() (src/cli/validationLoop.ts) over the process's own stdin/stdout via
 * Node's built-in `readline` (no new runtime dependency), until the human types "listo".
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

      const { confirmed, transcript } = await runValidationLoopForItem(orchestrator, item.id, ask, stdout);
      if (!confirmed) {
        stdout(`Rerun "npm run feature-validation" to continue ${item.id}.`);
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
