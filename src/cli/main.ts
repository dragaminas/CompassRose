import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
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

const ALLOWED_LIFECYCLE_STATES = [
  'formalization_pending',
  'formalized',
  'task_planning_pending',
  'task_ready',
  'implementation_running',
  'implementation_failed',
  'quality_gates_pending',
  'quality_failed',
  'review_pending',
  'review_failed',
  'correction_pending',
  'unblock_pending',
  'blocked',
  'completed',
  'request_pending',
];

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

    const featuresRoot = join(gitRoot, 'docs/features');
    const gitPolicy = configResult.value.git_policy;
    const requireClean = gitPolicy.require_clean_worktree_before_task;
    const allowDirty = gitPolicy.allow_dirty_worktree;
    if (requireClean && !allowDirty) {
      if (checkDirtyWorktree(gitRoot)) {
        stderr('runtime preflight: git_policy: worktree is not clean and require_clean_worktree_before_task is enabled');
        return 1;
      }
    }

    if (existsSync(featuresRoot)) {
      const featureDirs = readdirSync(featuresRoot)
        .filter((name) => {
          const dirPath = join(featuresRoot, name);
          return existsSync(dirPath) && /^\d{3}-/.test(name);
        })
        .sort();

      let selectedFeature: string | null = null;
      let selectedLifecycle: string | null = null;

      for (const featureDir of featureDirs) {
        const statePath = join(featuresRoot, featureDir, 'state.md');
        const requestPath = join(featuresRoot, featureDir, 'request.md');
        const featurePath = join(featuresRoot, featureDir, 'feature.md');
        const architecturePath = join(featuresRoot, featureDir, 'architecture.md');

        if (!existsSync(statePath)) {
          if (existsSync(requestPath)) {
            const missingFormalized =
              !existsSync(featurePath) || !existsSync(architecturePath) || !existsSync(statePath);
            if (missingFormalized) {
              selectedFeature = featureDir;
              selectedLifecycle = 'request_pending';
              break;
            }
          }
          stderr(`runtime feature-selection: ${featureDir}: malformed lifecycle data in state.md`);
          return 1;
        }

        const stateContent = readFileSync(statePath, 'utf8');
        const lifecycleMatch = stateContent.match(/^## Lifecycle State\s*\n\s*(.+)/m);

        if (!lifecycleMatch) {
          if (existsSync(requestPath)) {
            const missingFormalized =
              !existsSync(featurePath) || !existsSync(architecturePath) || !existsSync(statePath);
            if (missingFormalized) {
              selectedFeature = featureDir;
              selectedLifecycle = 'request_pending';
              break;
            }
          }
          stderr(`runtime feature-selection: ${featureDir}: malformed lifecycle data in state.md`);
          return 1;
        }

        let lifecycleState = lifecycleMatch[1]!.trim();

        if (existsSync(requestPath)) {
          const missingFormalized =
            !existsSync(featurePath) || !existsSync(architecturePath) || !existsSync(statePath);
          if (missingFormalized) {
            lifecycleState = 'request_pending';
          }
        }

        if (!ALLOWED_LIFECYCLE_STATES.includes(lifecycleState)) {
          stderr(`runtime feature-selection: ${featureDir}: malformed lifecycle data in state.md`);
          return 1;
        }

        if (lifecycleState === 'completed') {
          continue;
        }

        selectedFeature = featureDir;
        selectedLifecycle = lifecycleState;

        if (lifecycleState === 'formalized') {
          const updatedContent = stateContent.replace(
            /(^## Lifecycle State\s*\n\s*)formalized\s*$/m,
            `$1task_planning_pending\n`,
          );
          writeFileSync(statePath, updatedContent, 'utf8');
          stdout(
            `CompassRose: transitioning feature ${selectedFeature} from formalized to task_planning_pending`,
          );
          selectedLifecycle = 'task_planning_pending';
        }

        if (lifecycleState === 'task_planning_pending') {
          stdout(
            `CompassRose: dispatching task planning for feature ${selectedFeature} (lifecycle state: task_planning_pending)`,
          );
        }

        break;
      }

      if (selectedFeature) {
        stdout(`CompassRose: selecting feature ${selectedFeature} (lifecycle state: ${selectedLifecycle})`);
        return 0;
      }
    }

    stdout('CompassRose: no selectable feature remaining');
    return 0;
  }

  stderr('Usage: compassrose doctor');
  return 1;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  const exitCode = main();
  process.exitCode = exitCode;
}
