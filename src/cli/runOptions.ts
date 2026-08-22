import { resolve } from 'node:path';
import type { AgentToolName } from '../contracts/runtime/agentContext.js';
import type { ProtoOptions } from '../contracts/runtime/protoRuntime.js';

export function parseRunArguments(argv: readonly string[], defaultCwd: string): ProtoOptions {
  let loop = false;
  let commit = true;
  let cwd = defaultCwd;
  let implementer: AgentToolName = 'opencode';
  let target: string | null = null;

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

    if (argument === '--target') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('--target requires a feature or fix id.');
      }

      target = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return { loop, commit, cwd, implementer, target };
}
