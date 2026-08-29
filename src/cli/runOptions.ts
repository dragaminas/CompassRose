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

export interface WorkspaceOptions {
  readonly cwd: string;
  readonly commit: boolean;
}

/**
 * The two arguments a command that is not `run` actually has.
 *
 * `parseRunArguments` also accepts `--loop`, `--implementer` and `--target`, which mean nothing to
 * `setup` or `doctor`; accepting them there would document capabilities that do not exist. Splitting
 * the parser is what lets `--cwd` reach every command without that (ADR-0049) -- until then, only
 * `run` took it, so the sole way to point CompassRose at another repository was to `cd` into it,
 * which in turn required CompassRose to already be installed there.
 */
export function parseWorkspaceArguments(argv: readonly string[], defaultCwd: string): WorkspaceOptions {
  let cwd = defaultCwd;
  let commit = true;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
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

    throw new Error(`Unknown argument: ${argument}`);
  }

  return { cwd, commit };
}
