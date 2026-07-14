import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { findGitRepositoryRoot } from '../git/gitStatus.js';
import { formatDoctorReport, runDoctor } from '../doctor/doctorCommand.js';
import { readProjectConfiguration, validateRuntimePreconditions } from '../config/configReader.js';
import { getCurrentSupportedPlatform } from '../platform/platformInfo.js';

export interface CliEnvironment {
  readonly cwd?: string;
  readonly stdout?: (message: string) => void;
  readonly stderr?: (message: string) => void;
}

function checkDirtyWorktree(gitRoot: string): boolean {
  try {
    const output = execFileSync('git', ['status', '--porcelain'], {
      cwd: gitRoot,
      encoding: 'utf8',
    });
    const lines = output.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    return lines.length > 0;
  } catch {
    return false;
  }
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

  if (argv.length === 0) {
    const gitRoot = findGitRepositoryRoot(cwd);
    if (gitRoot === null) {
      stderr('runtime preflight: git repository: current directory is not inside a git repository');
      return 1;
    }
    const configBase = gitRoot;
    const configPath = join(configBase, 'docs/compassrose/CONFIG.md');
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
    if (requireClean && !allowDirty) {
      if (checkDirtyWorktree(gitRoot)) {
        stderr('runtime preflight: git_policy: worktree is not clean and require_clean_worktree_before_task is enabled');
        return 1;
      }
    }

    stdout('CompassRose preflight passed. No tasks to run.');
    return 0;
  }

  stderr('Usage: compassrose doctor');
  return 1;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  const exitCode = main();
  process.exitCode = exitCode;
}
