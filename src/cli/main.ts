import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { findGitRepositoryRoot } from '../git/gitStatus.js';
import { formatDoctorReport, runDoctor } from '../doctor/doctorCommand.js';
import { readProjectConfiguration, validateRuntimePreconditions } from '../config/configReader.js';
import { getCurrentSupportedPlatform } from '../platform/platformInfo.js';
import { CompassRoseOrchestrator } from '../orchestrator/orchestrator.js';
import { parseRunArguments } from './runOptions.js';

export interface CliEnvironment {
  readonly cwd?: string;
  readonly stdout?: (message: string) => void;
  readonly stderr?: (message: string) => void;
}

export function main(argv: string[] = process.argv.slice(2), environment: CliEnvironment = {}): number {
  const stdout = environment.stdout ?? ((message: string) => process.stdout.write(`${message}\n`));
  const stderr = environment.stderr ?? ((message: string) => process.stderr.write(`${message}\n`));
  const cwd = environment.cwd ?? process.cwd();

  if (argv.length === 1 && argv[0] === 'doctor') {
    const report = runDoctor({ cwd });
    const output = formatDoctorReport(report);
    if (report.success) {
      stdout(output);
    } else {
      stderr(output);
    }

    return report.exitCode;
  }

  let options;
  try {
    options = parseRunArguments(argv, cwd);
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    stderr('Usage: compassrose [--loop] [--implementer codex|opencode] [--no-commit] [--cwd <path>]');
    stderr('Usage: compassrose doctor');
    return 1;
  }

  const gitRoot = findGitRepositoryRoot(options.cwd);
  if (gitRoot === null) {
    stderr('runtime preflight: git repository: current directory is not inside a git repository');
    return 1;
  }
  const configPath = join(gitRoot, 'docs/compassrose/CONFIG.md');
  if (!existsSync(configPath)) {
    stderr('runtime preflight: configuration: docs/compassrose/CONFIG.md is absent');
    return 1;
  }
  const configResult = readProjectConfiguration(configPath);

  if (!configResult.ok) {
    for (const issue of configResult.error) {
      if (issue.line) {
        stderr(`${issue.field} (line ${issue.line}): ${issue.message}`);
      } else {
        stderr(`${issue.field}: ${issue.message}`);
      }
    }
    return 1;
  }

  const preflightIssues = validateRuntimePreconditions(configResult.value);
  if (preflightIssues.length > 0) {
    for (const issue of preflightIssues) {
      stderr(`runtime preflight: ${issue.field}: ${issue.message}`);
    }
    return 1;
  }

  const currentPlatform = getCurrentSupportedPlatform();
  const supportedPlatforms = configResult.value.project?.supported_platforms;
  if (currentPlatform === null || (Array.isArray(supportedPlatforms) && !supportedPlatforms.includes(currentPlatform))) {
    const platformLabel = currentPlatform ?? 'unknown';
    stderr(`runtime preflight: supported_platforms: current platform '${platformLabel}' is not supported. Supported platforms: ${supportedPlatforms?.join(', ') ?? 'none'}`);
    return 1;
  }

  const gitPolicy = configResult.value.git_policy;
  if (!gitPolicy) {
    stderr('runtime preflight: configuration: git_policy section is required');
    return 1;
  }
  const requireClean = gitPolicy.require_clean_worktree_before_task;
  const allowDirty = gitPolicy.allow_dirty_worktree;
  // Same escape hatch CompassRoseOrchestrator already honors internally, so e2e scenarios
  // that deliberately seed pre-existing (uncommitted) fixture state can bypass both checks
  // with one flag instead of needing a second, main.ts-specific one.
  const skipCleanWorktreeCheck = process.env.PROTO_COMPASSROSE_SKIP_CLEAN_CHECK === '1';

  const orchestrator = new CompassRoseOrchestrator({ ...options, cwd: gitRoot });

  if (requireClean && !allowDirty && !skipCleanWorktreeCheck) {
    // require_clean_worktree_BEFORE_TASK only makes sense as a gate on starting new
    // task-level work, not on every invocation: a legitimately interrupted run (killed
    // rather than gracefully stopped) must be able to resume from its own active task's
    // in-progress dirty tree, per the "Recovery After Interruption" contract in
    // src/contracts/runtime/operation-loop.md. findDisallowedDirtyPaths() defers to
    // determineNextStep() to tell "starting new work" (fully clean required) apart from
    // "continuing the active task" (dirty paths allowed within that task's own footprint).
    const disallowedPaths = orchestrator.findDisallowedDirtyPaths();
    if (disallowedPaths.length > 0) {
      stderr('runtime preflight: git_policy: worktree is not clean and require_clean_worktree_before_task is enabled');
      stderr(`runtime preflight: git_policy: disallowed dirty paths: ${disallowedPaths.join(', ')}`);
      return 1;
    }
  }

  return orchestrator.run();
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  const exitCode = main();
  process.exitCode = exitCode;
}
