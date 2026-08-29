#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync, realpathSync } from 'node:fs';
import { findGitRepositoryRoot } from '../git/gitStatus.js';
import { formatDoctorReport, runDoctor } from '../doctor/doctorCommand.js';
import { readProjectConfiguration, validateRuntimePreconditions } from '../config/configReader.js';
import { getCurrentSupportedPlatform } from '../platform/platformInfo.js';
import { CompassRoseOrchestrator } from '../orchestrator/orchestrator.js';
import { parseRunArguments, parseWorkspaceArguments } from './runOptions.js';
import { getBootstrapConfigPath } from '../config/compassRosePaths.js';
import { runSetupCli } from './setup.js';
import { runFeatureValidationCli } from './featureValidation.js';
import { runBrainstormCli } from './brainstorm.js';
import { runAcknowledgeBlockerCli } from './acknowledgeBlocker.js';
import { runSessionCli } from '../session/session.js';
import { appendRunEvent } from '../runtime/runChannel.js';

export interface CliEnvironment {
  readonly cwd?: string;
  readonly stdout?: (message: string) => void;
  readonly stderr?: (message: string) => void;
}

export function main(argv: string[] = process.argv.slice(2), environment: CliEnvironment = {}): number | Promise<number> {
  const stdout = environment.stdout ?? ((message: string) => process.stdout.write(`${message}\n`));
  const stderr = environment.stderr ?? ((message: string) => process.stderr.write(`${message}\n`));
  const cwd = environment.cwd ?? process.cwd();

  if (argv.length >= 1 && argv[0] === 'doctor') {
    let options;
    try {
      options = parseWorkspaceArguments(argv.slice(1), cwd);
    } catch (error) {
      stderr(error instanceof Error ? error.message : String(error));
      stderr('Usage: compassrose doctor [--cwd <path>]');
      return 1;
    }

    const report = runDoctor({ cwd: options.cwd });
    const output = formatDoctorReport(report);
    if (report.success) {
      stdout(output);
    } else {
      stderr(output);
    }

    return report.exitCode;
  }

  if (argv.length >= 1 && argv[0] === 'setup') {
    return runSetupCli(argv.slice(1), { cwd, stdout, stderr });
  }

  if (argv.length >= 1 && argv[0] === 'feature-validation') {
    return runFeatureValidationCli(argv.slice(1), { cwd, stdout, stderr });
  }

  if (argv.length >= 1 && argv[0] === 'brainstorm') {
    return runBrainstormCli(argv.slice(1), { cwd, stdout, stderr });
  }

  if (argv.length >= 1 && argv[0] === 'acknowledge-blocker') {
    return runAcknowledgeBlockerCli(argv.slice(1), { cwd, stdout, stderr });
  }

  // The primary entry point (023-terminal-session): no arguments opens the interactive session.
  // The previous no-argument behavior -- run the orchestrator once and exit -- moved to
  // `compassrose run`, which every non-interactive caller (CI, scripts, this repository's own
  // package scripts) uses instead.
  if (argv.length === 0 || argv[0] === '--cwd') {
    let sessionCwd = cwd;
    if (argv.length > 0) {
      try {
        sessionCwd = parseWorkspaceArguments(argv, cwd).cwd;
      } catch (error) {
        stderr(error instanceof Error ? error.message : String(error));
        stderr('Usage: compassrose [--cwd <path>]');
        return 1;
      }
    }

    return runSessionCli({ cwd: sessionCwd, stderr });
  }

  const runArgv = argv[0] === 'run' ? argv.slice(1) : argv;

  let options;
  try {
    options = parseRunArguments(runArgv, cwd);
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    stderr('Usage: compassrose [--cwd <path>]     open the interactive session');
    stderr('Usage: compassrose run [--loop] [--target <id>] [--implementer codex|opencode] [--no-commit] [--cwd <path>]');
    stderr('Usage: compassrose doctor [--cwd <path>]');
    stderr('Usage: compassrose setup [--no-commit] [--cwd <path>]');
    stderr('Usage: compassrose feature-validation [--no-commit] [--cwd <path>]');
    stderr('Usage: compassrose brainstorm [--no-commit]');
    stderr('Usage: compassrose acknowledge-blocker [--no-commit] [--cwd <path>]');
    return 1;
  }

  const gitRoot = findGitRepositoryRoot(options.cwd);
  if (gitRoot === null) {
    stderr('runtime preflight: git repository: current directory is not inside a git repository');
    return 1;
  }
  const configPath = getBootstrapConfigPath(gitRoot);
  if (!existsSync(configPath)) {
    stderr(`runtime preflight: configuration: ${configPath} is absent`);
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

  if (options.target) {
    try {
      orchestrator.setRunTarget(options.target);
    } catch (error) {
      stderr(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  // A supervised run (023-terminal-session): the interactive session launches this exact command
  // as a child process and watches the log, because a synchronous run cannot report itself over
  // IPC. Nothing about what the run *does* changes -- see RunObserver's contract -- so this stays
  // an ordinary `compassrose run` that happens to narrate itself.
  const eventLogPath = process.env.PROTO_COMPASSROSE_RUN_EVENT_LOG;
  if (eventLogPath) {
    orchestrator.setRunObserver({
      onStepStart(decision) {
        appendRunEvent(eventLogPath, {
          type: 'step-start',
          kind: decision.kind,
          itemId: decision.feature_id,
          taskId: decision.correction_task_id ?? decision.task_id,
        });
      },
      onStepEnd(decision, outcome) {
        appendRunEvent(eventLogPath, {
          type: 'step-end',
          kind: decision.kind,
          itemId: decision.feature_id,
          taskId: decision.correction_task_id ?? decision.task_id,
          outcome: outcome.kind,
          summary: outcome.summary,
        });
      },
    });
  }

  return orchestrator.run();
}

/**
 * True when this module is the program being run, not an import.
 *
 * Through `realpathSync`, because `npm link` puts a symlink (POSIX) or a junction (Windows) between
 * the two: Node resolves symlinks when it loads a module, so `import.meta.url` is the real file
 * while `process.argv[1]` is the link the shell followed. Comparing them directly made a linked
 * installation start up and silently exit 0 without running anything.
 */
function invokedDirectly(): boolean {
  const entryPoint = process.argv[1];
  if (!entryPoint) {
    return false;
  }

  const canonical = (path: string): string => {
    try {
      return realpathSync(path);
    } catch {
      return resolve(path);
    }
  };

  return canonical(fileURLToPath(import.meta.url)) === canonical(entryPoint);
}

if (invokedDirectly()) {
  const result = main();
  if (result instanceof Promise) {
    result.then((exitCode) => {
      process.exitCode = exitCode;
    });
  } else {
    process.exitCode = result;
  }
}
