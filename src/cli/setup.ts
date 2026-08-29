import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findGitRepositoryRoot } from '../git/gitStatus.js';
import { GitClient } from '../git/gitClient.js';
import { formatDoctorReport, runDoctor } from '../doctor/doctorCommand.js';
import { DEFAULT_COMPASSROSE_ROOT, getBootstrapConfigPath } from '../config/compassRosePaths.js';
import { renderDimensionsDocument, STARTER_DIMENSIONS } from '../state/dimensions.js';
import { deriveGateCandidates, detectProjectFacts } from '../project/detectProject.js';
import { renderProjectFactsDocument } from '../project/projectFacts.js';
import type { ProjectFacts } from '../project/projectFacts.js';
import { parseWorkspaceArguments } from './runOptions.js';
import type { CliEnvironment } from './main.js';

/**
 * Flow 0 ("npm run setup"): bootstrap-only. Creates CompassRose's own isolated compassrose/
 * root (see ADR-0046) when absent -- deterministic file generation, no AI call, no network. If the
 * root already exists, this only reports readiness via the existing Doctor checks.
 *
 * It does read the repository, though. Detection (028-project-understanding) already ran here to
 * write PROJECT_FACTS.md, and until ADR-0049 the generated CONFIG.md ignored every word of it:
 * `name: my-project` over a repository whose package.json says otherwise, four empty command slots
 * over a project that declares its scripts. What is unambiguous is filled in; what is a judgment is
 * left empty with the candidates named, because which of `test`, `test:unit`, `test:ci` is *the*
 * gate is not something detection can settle.
 */
export function runSetupCli(argv: readonly string[] = [], environment: CliEnvironment = {}): number {
  const stdout = environment.stdout ?? ((message: string) => process.stdout.write(`${message}\n`));
  const stderr = environment.stderr ?? ((message: string) => process.stderr.write(`${message}\n`));

  let options;
  try {
    options = parseWorkspaceArguments(argv, environment.cwd ?? process.cwd());
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    stderr('Usage: compassrose setup [--no-commit] [--cwd <path>]');
    return 1;
  }

  const gitRoot = findGitRepositoryRoot(options.cwd);
  if (gitRoot === null) {
    stderr(`runtime preflight: git repository: ${options.cwd} is not inside a git repository`);
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

  if (!commitSkeleton(gitRoot, created, options.commit, stdout, stderr)) {
    return 1;
  }

  stdout('Next: run `compassrose` and talk your first feature through. Specification is a');
  stdout('conversation now, so the automated loop will not touch anything you have not settled.');
  return 0;
}

/**
 * Commits exactly what this command just created, and nothing else.
 *
 * The step `setup` prints next used to fail immediately: every run of CompassRose refuses to start
 * on a dirty worktree (`git_policy.require_clean_worktree_before_task`), and setup left fifteen
 * untracked files behind. The first instruction the product gave you did not work.
 *
 * Committing the *created paths* specifically, rather than everything staged, is the part that
 * matters -- a repository being set up may well have the user's own work in progress sitting in it,
 * and sweeping that into a commit nobody asked for would be a far worse first impression than the
 * dirty tree was.
 */
function commitSkeleton(
  gitRoot: string,
  created: readonly string[],
  commit: boolean,
  stdout: (message: string) => void,
  stderr: (message: string) => void,
): boolean {
  if (!commit) {
    stdout('Not committed (--no-commit). CompassRose refuses to start on a dirty worktree, so');
    stdout('commit these before the next command.');
    stdout('');
    return true;
  }

  try {
    new GitClient(gitRoot).commit(
      created.map((path) => path.split('\\').join('/')),
      'compassrose: set up project documentation root',
    );
  } catch (error) {
    stderr(`The files were created but could not be committed: ${error instanceof Error ? error.message : String(error)}`);
    stderr('Commit them yourself before running anything else -- CompassRose refuses to start on a dirty worktree.');
    return false;
  }

  stdout('Committed, so the worktree is clean and the next command will run.');
  stdout('');
  return true;
}

/**
 * Reads what the repository says about itself and records it (028-project-understanding).
 *
 * Deterministic: no AI call, no network. This is what stops first contact with the tool from
 * being an exercise in filling out a form about your own repository.
 */
function writeProjectFacts(facts: ProjectFacts, write: (relativePath: string, contents: string) => void): void {
  write('PROJECT_FACTS.md', renderProjectFactsDocument(facts));
}

function createCompassRoseSkeleton(gitRoot: string): string[] {
  const root = join(gitRoot, DEFAULT_COMPASSROSE_ROOT);
  const created: string[] = [];
  const { facts } = detectProjectFacts(gitRoot);

  const write = (relativePath: string, contents: string): void => {
    const absolutePath = join(root, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents, 'utf8');
    created.push(join(DEFAULT_COMPASSROSE_ROOT, relativePath));
  };

  const documentationRoot = facts.documentationRoots?.value[0] ?? 'docs';
  write('CONFIG.md', renderStarterConfig(facts, documentationRoot));
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
  writeProjectFacts(facts, write);
  write('ADR.md', STARTER_ADR_MD);
  write('SAD.md', STARTER_SAD_MD);
  write('ROADMAP.md', STARTER_ROADMAP_MD);
  write('DMS.md', STARTER_DMS_MD);

  mkdirSync(join(root, 'features'), { recursive: true });
  mkdirSync(join(root, 'fixes'), { recursive: true });

  // Doctor validates that project.documentation_root exists. When the repository already has a
  // documentation directory the generated config names that one, and there is nothing to create;
  // only a project with none gets the placeholder (see ADR-0046).
  const docsRoot = join(gitRoot, documentationRoot);
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

/**
 * How this project's package manager spells "run the script called X".
 */
function scriptCommand(packageManager: string | null, script: string): string {
  if (packageManager === 'yarn') {
    return `yarn ${script}`;
  }
  if (packageManager === 'pnpm') {
    return `pnpm run ${script}`;
  }
  return `npm run ${script}`;
}

/**
 * One `commands.*` entry, rendered with the reason it looks the way it does.
 *
 * Exactly one candidate is a fact and gets written. More than one is a judgment: the candidates go
 * in as a comment and the value stays empty, because a machine choosing between `test`, `test:unit`
 * and `test:ci` on the project's behalf is the failure this whole codebase is arranged against. A
 * project with no scripts at all falls back to the build/test system detection already made for
 * PROJECT_FACTS.md, which for Go, Rust, Maven and Gradle is a literal command.
 */
function renderCommand(
  key: string,
  candidates: readonly string[],
  packageManager: string | null,
  fallback: string | null,
): string[] {
  if (candidates.length === 1) {
    return [`  ${key}: "${scriptCommand(packageManager, candidates[0]!)}"`];
  }

  if (candidates.length === 0) {
    return fallback
      ? [`  ${key}: "${fallback}"`]
      : [`  ${key}: ""`];
  }

  return [
    `  # Several scripts could be this gate: ${candidates.join(', ')}. Pick one.`,
    `  ${key}: ""`,
  ];
}

/**
 * A fallback only when the detected system is already a runnable command.
 *
 * `go test` and `cargo build` are commands; `vitest` and `jest` are the names of runners that a
 * Node project invokes through its own scripts, and writing one as a gate would assume a global
 * install this has no evidence for.
 */
function commandLikeFallback(system: string | null): string | null {
  return system !== null && system.includes(' ') ? system : null;
}

function renderStarterConfig(facts: ProjectFacts, documentationRoot: string): string {
  const gates = deriveGateCandidates(facts);
  const packageManager = facts.packageManager?.value ?? null;
  const name = facts.name?.value ?? 'my-project';
  const sourceRoot = facts.sourceRoots?.value[0] ?? 'src';

  const commands = [
    ...renderCommand('typecheck', gates.typecheck ?? [], packageManager, null),
    ...renderCommand('tests', gates.tests ?? [], packageManager, commandLikeFallback(facts.testSystem?.value ?? null)),
    ...renderCommand('lint', gates.lint ?? [], packageManager, null),
    ...renderCommand('build', gates.build ?? [], packageManager, commandLikeFallback(facts.buildSystem?.value ?? null)),
  ];

  return `# CompassRose Project Configuration

This file defines the project-local configuration used by CompassRose. \`npm run setup\` filled in
what this repository states about itself and left the rest empty -- see \`PROJECT_FACTS.md\` for
where each detected value came from. Edit the values below, then run \`compassrose doctor\` to
validate.

## Configuration

\`\`\`yaml
project:
  name: ${name}
  supported_platforms:
    - linux
    - windows
  documentation_root: ${documentationRoot}
  source_root: ${sourceRoot}

adapters:
  external_cli:
    type: external_cli
    command: ""
    args: []
    stdin: false
    input_file_argument: ""
    output_file: ""

commands:
${commands.join('\n')}

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
  stop_on_quality_gate_failure: true
  stop_on_review_failure: true

# execution_trust declares what a run may do to this repository (ADR-0048). Absent, the bounded
# defaults apply: agents get a workspace-write sandbox with no network, and a quality-gate command
# has to match one of the default allowlist prefixes before it will run.

documentation:
  compassrose_root: compassrose
  roadmap: compassrose/ROADMAP.md
  project_state: compassrose/PROJECT_STATE.md
  config: compassrose/CONFIG.md
  features_root: compassrose/features
  fixes_root: compassrose/fixes
  templates_root: compassrose/templates
\`\`\`
`;
}

const STARTER_PROJECT_STATE_MD = `# State: Project Identity and Foundation

## Status

Not started

## Active Feature

\`none\`

## Current Reality

- This project was just bootstrapped by \`compassrose setup\`. No feature has been formalized yet.

## Pending

- Write a feature request under \`compassrose/features/<id>/request.md\`.
- Run \`compassrose feature-validation\` once a request exists, before \`compassrose run\`.

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
\`compassrose/templates/\` for the shape each new entry takes.
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

This document describes how this project's own documents relate to each other and where each kind
of fact should be recorded. CompassRose distinguishes features from fixes from tasks; that
distinction comes from its own contracts, which ship with the tool rather than living here
(ADR-0049).
`;
