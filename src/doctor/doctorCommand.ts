import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadAndValidateProjectState } from '../contracts/state/projectState.js';
import type { DoctorOptions, DoctorCheck, DoctorReport } from '../contracts/doctor/doctorContracts.js';
import { readProjectConfiguration } from '../config/configReader.js';
import type { ConfigurationIssue } from '../config/configTypes.js';
import { findGitRepositoryRoot } from '../git/gitStatus.js';
import { getCurrentSupportedPlatform } from '../platform/platformInfo.js';
import { isDirectory, pathExists, resolveRepositoryRelativePath } from '../filesystem/pathResolver.js';
import { buildDiagnosticReport, createCheckContext } from './doctorDiagnostics.js';
import { buildFeaturesRoot, buildFixesRoot, getBootstrapConfigPath, resolveCompassRoseRoot } from '../config/compassRosePaths.js';
import { renderBlockerCard, scanBlockedWorkItems } from '../orchestrator/blockerCard.js';
import { readRecordString } from '../orchestrator/runtimeHelpers.js';
import type { ProjectConfiguration } from '../config/configTypes.js';

export function runDoctor(options: DoctorOptions = {}): DoctorReport {
  const workingDirectory = options.cwd ?? process.cwd();
  const checks: DoctorCheck[] = [];

  const repositoryRoot = findGitRepositoryRoot(workingDirectory);
  if (!repositoryRoot) {
    checks.push({
      name: 'repository',
      status: 'fail',
      details: [`${workingDirectory} is not inside a Git repository.`],
    });

    return buildDoctorReport({
      checks,
      runtimeFacts: {
        repositoryRoot: null,
        currentPlatform: getCurrentSupportedPlatform(process.platform),
        configPath: null,
      },
    });
  }

  checks.push({
    name: 'repository',
    status: 'pass',
    details: [`Git repository root: ${repositoryRoot}`],
  });

  const configPath = getBootstrapConfigPath(repositoryRoot);
  if (!existsSync(configPath)) {
    // A specific, actionable message for the pre-relocation layout instead of a generic
    // "missing" error -- this repository (or one bootstrapped before the compassrose/ move)
    // may still have its config at the old nested docs/compassrose/CONFIG.md location.
    const legacyConfigPath = join(repositoryRoot, 'docs', 'compassrose', 'CONFIG.md');
    const details = existsSync(legacyConfigPath)
      ? [`Legacy docs/compassrose/ layout detected: found ${legacyConfigPath}. Move CompassRose's own docs into compassrose/ at the repository root (see the ADR recording this relocation) and rerun.`]
      : [`Missing configuration file: ${configPath}`];
    checks.push({
      name: 'configuration',
      status: 'fail',
      details,
    });

    return buildDoctorReport({
      checks,
      runtimeFacts: {
        repositoryRoot,
        currentPlatform: getCurrentSupportedPlatform(process.platform),
        configPath,
      },
    });
  }

  const configurationResult = readProjectConfiguration(configPath);
  if (!configurationResult.ok) {
    checks.push({
      name: 'configuration',
      status: 'fail',
      details: formatConfigurationIssues(configurationResult.error),
    });

    return buildDoctorReport({
      checks,
      runtimeFacts: {
        repositoryRoot,
        currentPlatform: getCurrentSupportedPlatform(process.platform),
        configPath,
      },
    });
  }

  checks.push({
    name: 'configuration',
    status: 'pass',
    details: [`Parsed and validated ${configPath}`],
  });

  const currentPlatform = getCurrentSupportedPlatform(process.platform);

  // Constructed only now, from the successfully normalized configuration value, and given the
  // same `checks` array by reference so every check pushed to it below (platform, paths,
  // project-state) is reflected in context.checks/context.readiness -- not just the two already
  // pushed above.
  const context = createCheckContext(configurationResult.value, checks, {
    repositoryRoot,
    currentPlatform,
    configPath,
  });

  if (!currentPlatform) {
    checks.push({
      name: 'platform',
      status: 'fail',
      details: [`Unsupported runtime platform: ${process.platform}`],
    });
  } else if (!configurationResult.value.project.supported_platforms.includes(currentPlatform)) {
    checks.push({
      name: 'platform',
      status: 'fail',
      details: [
        `Current platform ${currentPlatform} is not listed in project.supported_platforms.`,
      ],
    });
  } else {
    checks.push({
      name: 'platform',
      status: 'pass',
      details: [`Current platform ${currentPlatform} is supported.`],
    });
  }

  const pathChecks = validateRepositoryPaths(repositoryRoot, configurationResult.value);
  checks.push(...pathChecks);

  const projectStatePath = resolveRepositoryRelativePath(
    repositoryRoot,
    configurationResult.value.documentation.project_state,
  );

  if (projectStatePath) {
    const psResult = loadAndValidateProjectState(projectStatePath);
    checks.push({
      name: 'project-state',
      status: psResult.ok ? 'pass' : 'fail',
      details: psResult.ok ? [`Project state validated: ${psResult.value.status}`] : [psResult.error.message],
    });
  }

  checks.push(buildBlockedWorkCheck(repositoryRoot, configurationResult.value));

  return buildDiagnosticReport(context);
}

/**
 * Surfaces every currently-blocked feature/fix's own bounded blocker card here too, so a human
 * can see it again later without re-triggering the failure that produced it (the live blocking
 * path already prints the identical card once, at the moment it happens -- see
 * `persistBlockedFeature` in orchestrator.ts). Resolves `features`/`fixes` roots the same way
 * `CompassRoseOrchestrator`'s constructor does, but stays a plain, read-only fs scan
 * (`scanBlockedWorkItems`) instead of constructing a full orchestrator -- doctor has no need for
 * the contract registry, git client, or CLI adapters just to list blocked work.
 */
function buildBlockedWorkCheck(repositoryRoot: string, configuration: ProjectConfiguration): DoctorCheck {
  const documentation = configuration.documentation as Record<string, unknown>;
  const compassRoseRoot = resolveCompassRoseRoot(configuration);
  const featuresRoot = resolveRepositoryRelativePath(
    repositoryRoot,
    readRecordString(documentation, 'features_root') ?? buildFeaturesRoot(compassRoseRoot),
  );
  const fixesRoot = resolveRepositoryRelativePath(
    repositoryRoot,
    readRecordString(documentation, 'fixes_root') ?? buildFixesRoot(compassRoseRoot),
  );

  if (!featuresRoot || !fixesRoot) {
    return {
      name: 'blocked-work',
      status: 'fail',
      details: ['documentation.features_root/fixes_root are not valid repository-relative paths.'],
    };
  }

  const blocked = scanBlockedWorkItems({ repositoryRoot, featuresRoot, fixesRoot });

  if (blocked.length === 0) {
    return {
      name: 'blocked-work',
      status: 'pass',
      details: ['No features or fixes are currently blocked.'],
    };
  }

  return {
    name: 'blocked-work',
    status: 'info',
    details: blocked.flatMap((item) => renderBlockerCard(item)),
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push('CompassRose doctor');
  lines.push(`Repository: ${report.repositoryRoot ?? 'not found'}`);
  lines.push(`Platform: ${report.currentPlatform ?? 'unsupported'}`);
  lines.push(`Configuration: ${report.configPath ?? 'not available'}`);
  lines.push(`Result: ${report.success ? 'PASS' : 'FAIL'}`);
  lines.push('Checks:');

  for (const check of report.checks) {
    lines.push(`- ${check.status.toUpperCase()} ${check.name}`);
    for (const detail of check.details) {
      lines.push(`  - ${detail}`);
    }
  }

  return lines.join('\n');
}

function validateRepositoryPaths(repositoryRoot: string, configuration: { project: { documentation_root: string }; documentation: { roadmap: string; project_state: string; config: string; contracts_root: string } }): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const requiredPaths = [
    {
      name: 'project.documentation_root',
      configuredPath: configuration.project.documentation_root,
      expectedDirectory: true,
    },
    {
      name: 'documentation.roadmap',
      configuredPath: configuration.documentation.roadmap,
      expectedDirectory: false,
    },
    {
      name: 'documentation.project_state',
      configuredPath: configuration.documentation.project_state,
      expectedDirectory: false,
    },
    {
      name: 'documentation.config',
      configuredPath: configuration.documentation.config,
      expectedDirectory: false,
    },
    {
      name: 'documentation.contracts_root',
      configuredPath: configuration.documentation.contracts_root,
      expectedDirectory: true,
    },
  ];

  const issues: string[] = [];
  for (const requiredPath of requiredPaths) {
    const resolvedPath = resolveRepositoryRelativePath(repositoryRoot, requiredPath.configuredPath);
    if (!resolvedPath) {
      issues.push(`${requiredPath.name} must be a repository-relative path inside the repository.`);
      continue;
    }

    if (!pathExists(resolvedPath)) {
      issues.push(`${requiredPath.configuredPath} does not exist.`);
      continue;
    }

    if (requiredPath.expectedDirectory && !isDirectory(resolvedPath)) {
      issues.push(`${requiredPath.configuredPath} must be a directory.`);
      continue;
    }
  }

  if (issues.length > 0) {
    checks.push({
      name: 'paths',
      status: 'fail',
      details: issues,
    });
  } else {
    checks.push({
      name: 'paths',
      status: 'pass',
      details: ['All required repository-local paths exist.'],
    });
  }

  return checks;
}

function formatConfigurationIssues(issues: readonly ConfigurationIssue[]): string[] {
  return issues.map((issue) => {
    if (issue.line) {
      return `${issue.field} (line ${issue.line}): ${issue.message}`;
    }

    return `${issue.field}: ${issue.message}`;
  });
}

// Delegates check aggregation (success/exitCode derivation, check ordering) to the feature-owned
// diagnostic boundary (src/doctor/doctorDiagnostics.ts).
function buildDoctorReport(input: {
  checks: readonly DoctorCheck[];
  runtimeFacts: {
    repositoryRoot: string | null;
    currentPlatform: string | null;
    configPath: string | null;
  };
}): DoctorReport {
  return buildDiagnosticReport(input.checks, input.runtimeFacts);
}
