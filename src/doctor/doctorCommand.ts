import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadAndValidateProjectState } from '../contracts/state/projectState.js';
import type { DoctorOptions, DoctorCheck, DoctorReport } from '../contracts/doctor/doctorContracts.js';
import { readProjectConfiguration } from '../config/configReader.js';
import type { ConfigurationIssue } from '../config/configTypes.js';
import { findGitRepositoryRoot } from '../git/gitStatus.js';
import { getCurrentSupportedPlatform } from '../platform/platformInfo.js';
import { isDirectory, pathExists, resolveRepositoryRelativePath } from '../filesystem/pathResolver.js';

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
      repositoryRoot: null,
      currentPlatform: getCurrentSupportedPlatform(process.platform),
      configPath: null,
      checks,
    });
  }

  checks.push({
    name: 'repository',
    status: 'pass',
    details: [`Git repository root: ${repositoryRoot}`],
  });

  const configPath = join(repositoryRoot, 'docs/compassrose/CONFIG.md');
  if (!existsSync(configPath)) {
    checks.push({
      name: 'configuration',
      status: 'fail',
      details: [`Missing configuration file: docs/compassrose/CONFIG.md`],
    });

    return buildDoctorReport({
      repositoryRoot,
      currentPlatform: getCurrentSupportedPlatform(process.platform),
      configPath,
      checks,
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
      repositoryRoot,
      currentPlatform: getCurrentSupportedPlatform(process.platform),
      configPath,
      checks,
    });
  }

  checks.push({
    name: 'configuration',
    status: 'pass',
    details: [`Parsed and validated docs/compassrose/CONFIG.md`],
  });

  const currentPlatform = getCurrentSupportedPlatform(process.platform);
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

  return buildDoctorReport({
    repositoryRoot,
    currentPlatform,
    configPath,
    checks,
  });
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

function buildDoctorReport(input: {
  repositoryRoot: string | null;
  currentPlatform: string | null;
  configPath: string | null;
  checks: readonly DoctorCheck[];
}): DoctorReport {
  return {
    repositoryRoot: input.repositoryRoot,
    currentPlatform: input.currentPlatform,
    configPath: input.configPath,
    checks: input.checks,
    success: input.checks.every((check) => check.status === 'pass'),
    exitCode: input.checks.every((check) => check.status === 'pass') ? 0 : 1,
  };
}
