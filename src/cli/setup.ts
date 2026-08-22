import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findGitRepositoryRoot } from '../git/gitStatus.js';
import { formatDoctorReport, runDoctor } from '../doctor/doctorCommand.js';
import { DEFAULT_COMPASSROSE_ROOT, getBootstrapConfigPath } from '../config/compassRosePaths.js';
import { renderDimensionsDocument, STARTER_DIMENSIONS } from '../state/dimensions.js';
import type { CliEnvironment } from './main.js';

/**
 * Flow 0 ("npm run setup"): bootstrap-only. Creates CompassRose's own isolated compassrose/
 * root (see ADR-0046) when absent -- deterministic file generation, no AI call, no
 * interpretation of an existing project's languages/frameworks/docs (that deeper analysis is
 * feature 028-project-understanding). If the root already exists, this only reports readiness via
 * the existing Doctor checks.
 */
export function runSetupCli(environment: CliEnvironment = {}): number {
  const stdout = environment.stdout ?? ((message: string) => process.stdout.write(`${message}\n`));
  const stderr = environment.stderr ?? ((message: string) => process.stderr.write(`${message}\n`));
  const cwd = environment.cwd ?? process.cwd();

  const gitRoot = findGitRepositoryRoot(cwd);
  if (gitRoot === null) {
    stderr('runtime preflight: git repository: current directory is not inside a git repository');
    return 1;
  }

  const bootstrapConfigPath = getBootstrapConfigPath(gitRoot);
  if (existsSync(bootstrapConfigPath)) {
    stdout(`CompassRose is already set up at ${DEFAULT_COMPASSROSE_ROOT}/.`);
    const report = runDoctor({ cwd: gitRoot });
    const output = formatDoctorReport(report);
    if (report.success) {
      stdout(output);
    } else {
      stderr(output);
    }
    return report.exitCode;
  }

  const created = createCompassRoseSkeleton(gitRoot);
  stdout(`Created ${DEFAULT_COMPASSROSE_ROOT}/ with ${created.length} file(s):`);
  for (const path of created) {
    stdout(`  - ${path}`);
  }
  stdout('');
  stdout('Next: run `compassrose` and talk your first feature through. Specification is a');
  stdout('conversation now, so the automated loop will not touch anything you have not settled.');
  return 0;
}

function createCompassRoseSkeleton(gitRoot: string): string[] {
  const root = join(gitRoot, DEFAULT_COMPASSROSE_ROOT);
  const created: string[] = [];

  const write = (relativePath: string, contents: string): void => {
    const absolutePath = join(root, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents, 'utf8');
    created.push(join(DEFAULT_COMPASSROSE_ROOT, relativePath));
  };

  write('CONFIG.md', STARTER_CONFIG_MD);
  write('PROJECT_STATE.md', STARTER_PROJECT_STATE_MD);
  // The coverage floor a specification session walks from day one (024-specification-flow).
  // Deliberately generic: the agent's proposals are how it becomes specific to this project, and
  // every one of those needs a human decision before it lands here.
  write(
    'DIMENSIONS.md',
    renderDimensionsDocument(
      STARTER_DIMENSIONS.map((name) => ({ name, state: 'uncovered' as const, coveredBy: [], decisions: [] })),
    ),
  );
  write('ADR.md', STARTER_ADR_MD);
  write('SAD.md', STARTER_SAD_MD);
  write('ROADMAP.md', STARTER_ROADMAP_MD);
  write('DMS.md', STARTER_DMS_MD);

  mkdirSync(join(root, 'features'), { recursive: true });
  mkdirSync(join(root, 'fixes'), { recursive: true });

  // The starter CONFIG.md declares project.documentation_root: docs -- Doctor validates that
  // path exists, so create it as an (initially empty) placeholder for this project's own
  // documentation, exactly like this installation's own docs/.gitkeep (see ADR-0046).
  const docsRoot = join(gitRoot, 'docs');
  if (!existsSync(docsRoot)) {
    mkdirSync(docsRoot, { recursive: true });
    writeFileSync(join(docsRoot, '.gitkeep'), '', 'utf8');
    created.push(relative(gitRoot, join(docsRoot, '.gitkeep')));
  }

  // Reuse this installation's own templates/README content as the single source of truth
  // instead of duplicating it as string literals here, so the two can never drift apart.
  const ownRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', DEFAULT_COMPASSROSE_ROOT);
  copyIfPresent(join(ownRoot, 'templates'), join(root, 'templates'), gitRoot, created);
  copyFileIfPresent(join(ownRoot, 'features', 'README.md'), join(root, 'features', 'README.md'), gitRoot, created);
  copyFileIfPresent(join(ownRoot, 'fixes', 'README.md'), join(root, 'fixes', 'README.md'), gitRoot, created);

  return created;
}

function copyIfPresent(sourceDir: string, targetDir: string, gitRoot: string, created: string[]): void {
  if (!existsSync(sourceDir)) {
    return;
  }

  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = join(sourceDir, entry);
    const targetPath = join(targetDir, entry);
    if (statSync(sourcePath).isDirectory()) {
      copyIfPresent(sourcePath, targetPath, gitRoot, created);
      continue;
    }

    writeFileSync(targetPath, readFileSync(sourcePath, 'utf8'), 'utf8');
    created.push(relative(gitRoot, targetPath));
  }
}

function copyFileIfPresent(sourcePath: string, targetPath: string, gitRoot: string, created: string[]): void {
  if (!existsSync(sourcePath)) {
    return;
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, readFileSync(sourcePath, 'utf8'), 'utf8');
  created.push(relative(gitRoot, targetPath));
}

const STARTER_CONFIG_MD = `# CompassRose Project Configuration

This file defines the project-local configuration used by CompassRose. Edit the values below to
match this project, then run \`npm run doctor\` to validate.

## Configuration

\`\`\`yaml
project:
  name: my-project
  supported_platforms:
    - linux
    - windows
  documentation_root: docs
  source_root: src

adapters:
  external_cli:
    type: external_cli
    command: ""
    args: []
    stdin: false
    input_file_argument: ""
    output_file: ""

commands:
  typecheck: ""
  tests: ""
  lint: ""
  build: ""

git_policy:
  require_clean_worktree_before_task: true
  review_target: git_diff
  allow_dirty_worktree: false
  branch_per_task: optional
  commit_after_task: manual

development_policy:
  default: implementation_first

review_policy:
  mode: required
  record_skipped_review: true

# smoke declares what "the application runs" means here, checked before a feature can close.
# Either a start command with the condition proving it started:
#   smoke:
#     command: "npm start"
#     expect:
#       http_ok: "http://localhost:3000/health"
#     timeout_seconds: 60
# or an explicit opt-out, which requires a reason:
#   smoke:
#     none: "Library with no entry point; correctness is covered by its test suite."

quality_gates:
  enabled: true
  required:
    - typecheck
    - tests
  optional:
    - lint
    - build

limits:
  max_tasks_per_run: 50
  max_retries_per_task: 1
  max_review_iterations: 1
  max_recovery_iterations: 3
  stop_on_quality_gate_failure: true
  stop_on_review_failure: true

documentation:
  compassrose_root: compassrose
  roadmap: compassrose/ROADMAP.md
  project_state: compassrose/PROJECT_STATE.md
  config: compassrose/CONFIG.md
  features_root: compassrose/features
  fixes_root: compassrose/fixes
  templates_root: compassrose/templates
  contracts_root: src/contracts
\`\`\`
`;

const STARTER_PROJECT_STATE_MD = `# State: Project Identity and Foundation

## Status

Not started

## Active Feature

\`none\`

## Current Reality

- This project was just bootstrapped by \`npm run setup\`. No feature has been formalized yet.

## Pending

- Write a feature request under \`compassrose/features/<id>/request.md\`.
- Run \`npm run feature-validation\` once a request exists, before \`npm run app\`.

## Blocked

- None

## Last Approved Change

None yet.

## Known Gaps

None.

## Next Planning Hint

Write the first feature request.
`;

const STARTER_ADR_MD = `# Architecture Decision Records

This document records the significant, hard-to-reverse decisions made for this project. See
\`compassrose/templates/\` and the CompassRose contracts under \`src/contracts/\` for the process
that produces new entries.
`;

const STARTER_SAD_MD = `# Software Architecture Document

This document describes this project's own architecture as it actually exists -- updated as
features land, not written speculatively ahead of them.
`;

const STARTER_ROADMAP_MD = `# Roadmap

This document lists this project's planned milestones in order. CompassRose's Planner role reads
this to ground new feature requests in the project's own stated direction.
`;

const STARTER_DMS_MD = `# Document Management System

This document describes how this project's own documents relate to each other and where each
kind of fact should be recorded. See \`src/contracts/runtime/work-item-taxonomy.md\` for the
feature/fix/task distinction CompassRose itself relies on.
`;
