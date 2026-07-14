import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentToolName } from '../src/contracts/runtime/agentContext.js';
import type { ProtoOptions } from '../src/contracts/runtime/protoRuntime.js';
import { parseTaskDocument } from '../src/task/taskDocument.js';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';

export { parseTaskDocument };

function main(argv: readonly string[]): number {
  const options = parseArguments(argv);
  const orchestrator = new CompassRoseOrchestrator(options);
  return orchestrator.run();
}

function parseArguments(argv: readonly string[]): ProtoOptions {
  let loop = false;
  let commit = true;
  let cwd = process.cwd();
  let implementer: AgentToolName = 'opencode';

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--loop') {
      loop = true;
      continue;
    }

    if (argument === '--no-commit') {
      commit = false;
      continue;
    }

    if (argument === '--cwd') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('--cwd requires a value.');
      }
      cwd = resolve(value);
      index += 1;
      continue;
    }

    if (argument === '--implementer') {
      const value = argv[index + 1];
      if (value !== 'codex' && value !== 'opencode') {
        throw new Error('--implementer requires a value of codex or opencode.');
      }

      implementer = value;
      index += 1;
      continue;
    }

    if (argument === 'run' || argument === 'run-once') {
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return { loop, commit, cwd, implementer };
}

const entryFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === entryFile) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
