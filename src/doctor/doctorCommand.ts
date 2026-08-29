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
import { describeExecutionTrust, resolveExecutionTrust } from '../config/executionTrust.js';
import { inspectAgentHomeIsolation } from './agentHomeIsolation.js';
import { CONTRACTS_DIRECTORY, getInstallationRoot } from '../config/installationPaths.js';

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
  checks.push(buildExecutionTrustCheck(configurationResult.value));
  checks.push(buildContractsCheck());

  return buildDiagnosticReport(context);
}

/**
 * What this repository permits a run to do to it, and whether the isolation rule is holding
 * (030-execution-trust).
 *
 * `info`, never `fail`. A stale trust grant in an external tool's own configuration is not a defect
 * in *this* repository's setup, and doctor's readiness is about whether this repository is ready.
 * Reporting it is the point; failing on it would make doctor answer for a file it does not own.
 */
function buildExecutionTrustCheck(configuration: ProjectConfiguration): DoctorCheck {
  const policy = resolveExecutionTrust(configuration);
  const details = [
    describeExecutionTrust(policy),
    configuration.execution_trust
      ? 'Declared in CONFIG.md.'
      : 'Not declared in CONFIG.md; the bounded defaults apply.',
  ];

  const isolation = inspectAgentHomeIsolation();
  if (isolation.staleTrustEntries.length === 0) {
    return { name: 'execution-trust', status: 'pass', details };
  }

  // `info`, never `fail`. A stale grant in an external tool's own configuration is not a defect in
  // *this* repository's setup, and doctor's readiness is about whether this repository is ready.
  details.push(
    `${isolation.staleTrustEntries.length} trust grant(s) in ${isolation.configPath} name directories that no longer exist.`,
    'CONFIG.md forbids CompassRose from silently modifying global tool configuration; these are residue from runs against throwaway workspaces.',
  );

  return { name: 'execution-trust', status: 'info', details };
}

/**
 * That the *installation* is intact, which is a different question from whether this repository is.
 *
 * Replaces the `documentation.contracts_root` path check ADR-0049 removed. That check asked the
 * target repository to contain CompassRose's contracts, which is how first contact with any other
 * repository used to fail; this asks the only question that was ever behind it -- can the contracts
 * this run will hand its agents actually be read? A partial install (a published package missing
 * `src/contracts`, a half-finished `npm link`) is a real failure mode, and it is a `fail`, because
 * every structured call in the loop reads a schema from here.
 */
function buildContractsCheck(): DoctorCheck {
  const contractsRoot = join(getInstallationRoot(), CONTRACTS_DIRECTORY);
  if (!pathExists(contractsRoot) || !isDirectory(contractsRoot)) {
    return {
      name: 'contracts',
      status: 'fail',
      details: [
        `${contractsRoot} does not exist.`,
        'CompassRose reads its own contracts from where it is installed, not from this repository. This installation is incomplete.',
      ],
    };
  }

  return {
    name: 'contracts',
    status: 'pass',
    details: [`Read from the installation at ${contractsRoot}.`],
  };
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
  // Header and status wording are fixed by feature 003-doctor-command's acceptance criteria
  // ("CompassRose Doctor" / "Status: OK"), not by preference -- the specification is the authority
  // on the documented success shape.
  lines.push('CompassRose Doctor');
  lines.push(`Repository: ${report.repositoryRoot ?? 'not found'}`);
  lines.push(`Platform: ${report.currentPlatform ?? 'unsupported'}`);
  lines.push(`Configuration: ${report.configPath ?? 'not available'}`);
  lines.push(`Status: ${report.success ? 'OK' : 'FAILED'}`);
  lines.push('Checks:');

  for (const check of report.checks) {
    lines.push(`- ${check.status.toUpperCase()} ${check.name}`);
    for (const detail of check.details) {
      lines.push(`  - ${detail}`);
    }
  }

  return lines.join('\n');
}

function validateRepositoryPaths(repositoryRoot: string, configuration: { project: { documentation_root: string }; documentation: { roadmap: string; project_state: string; config: string } }): DoctorCheck[] {
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
