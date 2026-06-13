import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative as relativePath, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readProjectConfiguration } from '../src/config/configReader.js';
import { resolveRepositoryRelativePath } from '../src/filesystem/pathResolver.js';
import { findGitRepositoryRoot } from '../src/git/gitStatus.js';

type StepKind =
  | 'plan_feature'
  | 'plan_task'
  | 'implement_task'
  | 'review_task'
  | 'correct_task'
  | 'stop'
  | 'blocked';

type DevelopmentPolicyMode =
  | 'test_guided'
  | 'implementation_first'
  | 'documentation_first'
  | 'strict_tdd';

type ReviewerStatus = 'approved' | 'changes_required' | 'blocked' | 'failed';
type DiagnosticClassification =
  | 'context_overflow'
  | 'provider_failure'
  | 'permission_prompt'
  | 'tool_refusal'
  | 'model_passivity'
  | 'ui_cli_behavior'
  | 'unknown';

interface CommandExecution {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly commandInvoked: string;
}

interface ImplementationDiagnostics {
  readonly classification: DiagnosticClassification;
  readonly evidence: readonly string[];
  readonly first_executable_step_status: 'attempted' | 'not_attempted' | 'unknown';
  readonly minimum_progress_evidence_status: 'present' | 'absent' | 'unknown';
  readonly exit_code: number | null;
  readonly signal: string | null;
  readonly timed_out: boolean;
  readonly command_invoked: string | null;
}

interface ImplementationAttempt {
  readonly status: 'success' | 'failed';
  readonly changed_files: readonly string[];
  readonly git_diff: string;
  readonly raw_output: string;
  readonly implementation_notes: string | null;
  readonly diagnostics: ImplementationDiagnostics;
  readonly error: string | null;
}

interface StepDecision {
  readonly kind: StepKind;
  readonly feature_id: string | null;
  readonly task_id: string | null;
  readonly correction_task_id: string | null;
  readonly reason: string;
}

interface PlannedFeatureDocs {
  readonly feature_id: string;
  readonly feature_md: string;
  readonly architecture_md: string;
  readonly state_md: string;
  readonly summary: string;
}

interface PlannedTask {
  readonly task_id: string;
  readonly feature_id: string;
  readonly title: string;
  readonly objective: string;
  readonly first_executable_step: string;
  readonly minimum_progress_evidence: readonly string[];
  readonly trace: {
    readonly roadmap_objective: string;
    readonly feature_goal: string;
    readonly state_gap: string;
  };
  readonly context: {
    readonly summary: string;
    readonly relevant_paths: readonly string[];
    readonly relevant_modules: readonly string[];
  };
  readonly scope: {
    readonly allowed_paths: readonly string[];
    readonly forbidden_paths: readonly string[];
  };
  readonly constraints: readonly string[];
  readonly development_policy: {
    readonly mode: DevelopmentPolicyMode;
  };
  readonly quality_gates: {
    readonly before_review: readonly string[];
  };
  readonly acceptance_criteria: readonly string[];
  readonly expected_deliverables: readonly ('code' | 'tests' | 'documentation')[];
}

interface PlannerOutput {
  readonly task: PlannedTask;
}

interface CorrectionTask {
  readonly parent_task_id: string;
  readonly correction_task_id: string;
  readonly feature_id: string;
  readonly title: string;
  readonly objective: string;
  readonly first_executable_step: string;
  readonly minimum_progress_evidence: readonly string[];
  readonly review_findings: readonly string[];
  readonly scope: {
    readonly allowed_paths: readonly string[];
    readonly forbidden_paths: readonly string[];
  };
  readonly constraints: readonly string[];
  readonly acceptance_criteria: readonly string[];
  readonly quality_gates: {
    readonly before_review: readonly string[];
  };
}

interface ReviewerOutput {
  readonly task_id: string;
  readonly status: ReviewerStatus;
  readonly summary: string;
  readonly acceptance: {
    readonly criteria: readonly {
      readonly criterion: string;
      readonly status: 'passed' | 'failed' | 'not_verified';
      readonly notes: string;
    }[];
  };
  readonly findings: readonly {
    readonly severity: 'info' | 'warning' | 'error' | 'blocker';
    readonly message: string;
    readonly path: string | null;
    readonly related_acceptance_criterion: string | null;
  }[];
  readonly scope_check: {
    readonly status: 'passed' | 'failed';
    readonly unrelated_changes: readonly string[];
  };
  readonly quality_gate_check: {
    readonly status: 'passed' | 'failed' | 'skipped';
    readonly failed_gates: readonly string[];
  };
  readonly correction_task: CorrectionTask | null;
  readonly project_state_update_hint: string | null;
}

interface TaskInterfaceAnalysis {
  readonly task_id: string;
  readonly review_status: ReviewerStatus;
  readonly summary: string;
  readonly recommended_action: 'tighten_task_interface' | 'document_implementer_limitation' | 'both' | 'none';
  readonly perfectible: boolean;
  readonly implementer_limitations: readonly string[];
  readonly task_interface_adjustments: {
    readonly first_executable_step: string | null;
    readonly minimum_progress_evidence: readonly string[];
    readonly context_additions: readonly string[];
    readonly scope_adjustments: readonly string[];
    readonly acceptance_criteria_adjustments: readonly string[];
    readonly quality_gate_adjustments: readonly string[];
  };
  readonly notes_for_documentation: readonly string[];
}

interface ParsedTaskDocument {
  readonly taskId: string;
  readonly featureId: string;
  readonly title: string;
  readonly objective: string;
  readonly firstExecutableStep: string;
  readonly minimumProgressEvidence: readonly string[];
  readonly allowedPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly constraints: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly qualityGates: readonly string[];
  readonly developmentPolicy: DevelopmentPolicyMode;
  readonly likelyAffectedFiles: readonly string[];
  readonly path: string;
}

interface FeatureRecord {
  readonly id: string;
  readonly name: string;
  readonly directory: string;
  readonly requestPath: string;
  readonly featurePath: string;
  readonly architecturePath: string;
  readonly statePath: string;
  readonly tasksDirectory: string;
}

interface QualityGateResult {
  readonly name: string;
  readonly command: string;
  readonly status: 'passed' | 'failed' | 'skipped';
  readonly output_summary: string;
}

interface ProtoOptions {
  readonly loop: boolean;
  readonly commit: boolean;
  readonly cwd: string;
}

interface StepExecutionResult {
  readonly exitCode: number;
  readonly continueLoop: boolean;
  readonly summary: string;
}

interface StepRunRecord {
  readonly decided_at: string;
  readonly decision: StepDecision;
  readonly exit_code: number;
  readonly continue_loop: boolean;
  readonly summary: string;
}

interface RunSummary {
  readonly run_id: string;
  readonly started_at: string;
  readonly finished_at: string;
  readonly status: 'completed' | 'stopped' | 'failed';
  readonly exit_code: number;
  readonly options: ProtoOptions;
  readonly steps: readonly StepRunRecord[];
  readonly error: string | null;
}

interface RefinementFeedback {
  readonly run_id: string;
  readonly created_at: string;
  readonly trigger: string;
  readonly selected_step: StepDecision | null;
  readonly likely_sources: readonly string[];
  readonly observations: readonly string[];
  readonly next_questions: readonly string[];
}

class GitClient {
  constructor(private readonly repositoryRoot: string) {}

  ensureCleanWorktree(): void {
    const status = this.execGit(['status', '--porcelain']);
    if (status.trim().length > 0) {
      throw new Error('Prototype run requires a clean worktree before mutating steps.');
    }
  }

  diffNameOnly(): string[] {
    return uniqueStrings([
      ...parseGitPathList(this.execGit(['diff', '--name-only'])),
      ...parseGitPathList(this.execGit(['diff', '--cached', '--name-only'])),
      ...parseGitPathList(this.execGit(['ls-files', '--others', '--exclude-standard'])),
    ]);
  }

  diffPatch(): string {
    const patches = [
      this.execGit(['diff', '--patch', '--no-ext-diff']).trim(),
      this.execGit(['diff', '--cached', '--patch', '--no-ext-diff']).trim(),
      ...parseGitPathList(this.execGit(['ls-files', '--others', '--exclude-standard'])).map((path) =>
        this.execGitAllowStatus(['diff', '--no-index', '--', '/dev/null', path], [0, 1]).trim(),
      ),
    ].filter((patch) => patch.length > 0);

    return patches.join('\n');
  }

  commit(paths: readonly string[], message: string): void {
    if (paths.length === 0) {
      throw new Error('Refusing to commit with no paths.');
    }

    this.execGit(['add', '--', ...paths]);
    const staged = this.execGit(['diff', '--cached', '--name-only']);
    if (staged.trim().length === 0) {
      throw new Error('No staged changes found for commit.');
    }

    this.execGit(['commit', '-m', message]);
  }

  private execGit(args: string[]): string {
    return this.execGitAllowStatus(args, [0]);
  }

  private execGitAllowStatus(args: string[], allowedStatuses: readonly number[]): string {
    const result = spawnSync('git', args, {
      cwd: this.repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });

    const status = result.status ?? -1;
    if (!allowedStatuses.includes(status)) {
      throw new Error(`git ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
    }

    return result.stdout;
  }
}

class ArtifactStore {
  private readonly root: string;

  constructor(repositoryRoot: string) {
    this.root = join(repositoryRoot, '.git', 'proto-compassrose');
    mkdirSync(this.root, { recursive: true });
  }

  writeJson(relativePath: string, value: unknown): void {
    const targetPath = join(this.root, relativePath);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }

  readJson<T>(relativePath: string): T | null {
    const targetPath = join(this.root, relativePath);
    try {
      return JSON.parse(readFileSync(targetPath, 'utf8')) as T;
    } catch {
      return null;
    }
  }

  writeText(relativePath: string, value: string): string {
    const targetPath = join(this.root, relativePath);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, value, 'utf8');
    return targetPath;
  }
}

class CodexCli {
  constructor(
    private readonly repositoryRoot: string,
    private readonly command: string,
  ) {}

  runStructured<T>(
    prompt: string,
    schema: unknown,
    extraReadableDirs: readonly string[] = [],
    label = 'step-selector',
  ): T {
    const tempDir = mkdtempSync(join(tmpdir(), 'proto-compassrose-codex-'));
    const schemaPath = join(tempDir, 'schema.json');
    const outputPath = join(tempDir, 'output.json');
    writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');

    const args = [
      'exec',
      '--ephemeral',
      '-C',
      this.repositoryRoot,
      '-s',
      'read-only',
      '--dangerously-bypass-approvals-and-sandbox',
      '--output-schema',
      schemaPath,
      '-o',
      outputPath,
    ];

    for (const dir of extraReadableDirs) {
      args.push('--add-dir', dir);
    }

    const model = process.env.PROTO_COMPASSROSE_CODEX_MODEL;
    if (model) {
      args.push('-m', model);
    }

    args.push('-');

    logAgentStart('codex', label, this.command);
    const startedAt = Date.now();
    const result = spawnSync(this.command, args, {
      cwd: this.repositoryRoot,
      input: prompt,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    const elapsedMs = Date.now() - startedAt;

    logAgentStream('codex', label, 'stdout', result.stdout ?? '');
    logAgentStream('codex', label, 'stderr', result.stderr ?? '');
    logAgentEnd('codex', label, elapsedMs, result.status, result.error?.message ?? null);

    if (result.status !== 0) {
      throw new Error(`codex exec failed:\n${result.stderr || result.stdout}`);
    }

    return JSON.parse(readFileSync(outputPath, 'utf8')) as T;
  }
}

class OpenCodeCli {
  constructor(
    private readonly repositoryRoot: string,
    private readonly command: string,
  ) {}

  run(prompt: string, label = 'implementer'): CommandExecution {
    const args = ['run', '--dir', this.repositoryRoot, '--dangerously-skip-permissions'];
    const model = process.env.PROTO_COMPASSROSE_OPENCODE_MODEL;
    if (model) {
      args.push('-m', model);
    }

    args.push(prompt);

    logAgentStart('opencode', label, this.command);
    const startedAt = Date.now();
    const result = spawnSync(this.command, args, {
      cwd: this.repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
    const elapsedMs = Date.now() - startedAt;

    const errorText = result.error ? `\n${result.error.message}` : '';
    const stdout = result.stdout ?? '';
    const stderr = `${result.stderr ?? ''}${errorText}`;
    logAgentStream('opencode', label, 'stdout', stdout);
    logAgentStream('opencode', label, 'stderr', stderr);
    logAgentEnd('opencode', label, elapsedMs, result.status, result.error?.message ?? null);

    return {
      ok: result.status === 0 && !result.error,
      stdout,
      stderr,
      exitCode: result.status,
      signal: result.signal ?? null,
      timedOut: false,
      commandInvoked: [this.command, ...args].join(' '),
    };
  }
}

class PrototypeCompassRose {
  private readonly repositoryRoot: string;
  private readonly git: GitClient;
  private readonly artifacts: ArtifactStore;
  private readonly codex: CodexCli;
  private readonly opencode: OpenCodeCli;
  private readonly skipCleanWorktreeCheck: boolean;
  private readonly configurationPath: string;
  private readonly projectStatePath: string;
  private readonly featuresRoot: string;
  private readonly runId: string;
  private readonly startedAt: string;
  private readonly stepRecords: StepRunRecord[] = [];

  constructor(private readonly options: ProtoOptions) {
    const repositoryRoot = findGitRepositoryRoot(options.cwd);
    if (!repositoryRoot) {
      throw new Error(`No Git repository found from ${options.cwd}.`);
    }

    this.repositoryRoot = repositoryRoot;
    this.git = new GitClient(repositoryRoot);
    this.artifacts = new ArtifactStore(repositoryRoot);
    this.codex = new CodexCli(repositoryRoot, process.env.PROTO_COMPASSROSE_CODEX_COMMAND ?? 'codex');
    this.opencode = new OpenCodeCli(repositoryRoot, process.env.PROTO_COMPASSROSE_OPENCODE_COMMAND ?? 'opencode');
    this.skipCleanWorktreeCheck = process.env.PROTO_COMPASSROSE_SKIP_CLEAN_CHECK === '1';

    const configurationPath = join(repositoryRoot, 'docs', 'compassrose', 'CONFIG.md');
    const configuration = readProjectConfiguration(configurationPath);
    if (!configuration.ok) {
      throw new Error(`Unable to load project configuration from ${configurationPath}.`);
    }

    this.configurationPath = configurationPath;
    const documentation = configuration.value.documentation as Record<string, unknown>;
    const projectStatePath = resolveRepositoryRelativePath(repositoryRoot, configuration.value.documentation.project_state);
    const featuresRoot = resolveRepositoryRelativePath(
      repositoryRoot,
      readRecordString(documentation, 'features_root') ?? 'docs/features',
    );

    if (!projectStatePath || !featuresRoot) {
      throw new Error('Configuration paths for project state or features root are invalid.');
    }

    this.projectStatePath = projectStatePath;
    this.featuresRoot = featuresRoot;
    this.runId = createRunId();
    this.startedAt = new Date().toISOString();
  }

  run(): number {
    let keepRunning = true;
    let lastDecision: StepDecision | null = null;

    try {
      while (keepRunning) {
        const decision = this.determineNextStep();
        lastDecision = decision;
        console.log(`Next step: ${decision.kind}${decision.feature_id ? ` (${decision.feature_id})` : ''}`);
        console.log(decision.reason);

        const result = this.executeStep(decision);
        this.stepRecords.push({
          decided_at: new Date().toISOString(),
          decision,
          exit_code: result.exitCode,
          continue_loop: result.continueLoop,
          summary: result.summary,
        });

        if (result.exitCode !== 0) {
          this.writeRefinementFeedback(result.summary, lastDecision);
          this.writeRunSummary('stopped', result.exitCode, null);
          return result.exitCode;
        }

        if (!this.options.loop || !result.continueLoop) {
          keepRunning = false;
        }
      }

      this.writeRunSummary('completed', 0, null);
      return 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.writeRefinementFeedback(message, lastDecision);
      this.writeRunSummary('failed', 1, message);
      throw error;
    }
  }

  private determineNextStep(): StepDecision {
    const prompt = [
      'Act as the CompassRose deterministic step selector.',
      '',
      'Read only these repository sources:',
      '- `docs/compassrose/PROJECT_STATE.md`',
      '- `docs/compassrose/CONFIG.md`',
      '- `src/contracts/runtime/operation-loop.md`',
      '- `src/contracts/state/feature-state.md`',
      '- `docs/features/README.md`',
      '- the feature folders under `docs/features/` as needed',
      '',
      'Choose the next executable step for one prototype run.',
      '',
      'Rules:',
      '- Return `plan_feature` when the selected feature still has only `request.md` and must be formalized.',
      '- Return `plan_task` when the selected feature is ready for exactly one next task to be planned.',
      '- Return `implement_task` when the selected feature has `task_ready` and no active correction task.',
      '- Return `review_task` when the selected feature is waiting for review.',
      '- Return `correct_task` when the selected feature has an active correction task ready to execute.',
      '- Return `blocked` when the selected feature is blocked or a failed state prevents progress.',
      '- Return `stop` when there is no non-completed feature left to implement.',
      '- Respect numeric feature order and do not skip an earlier non-completed feature.',
      '',
      'Return JSON only.',
    ].join('\n');

    return this.codex.runStructured<StepDecision>(prompt, STEP_SCHEMA, [], 'step-selector');
  }

  private executeStep(decision: StepDecision): StepExecutionResult {
    switch (decision.kind) {
      case 'plan_feature':
        this.ensureCleanWorktreeIfRequired();
        this.planFeature(requireString(decision.feature_id, 'feature_id'));
        return { exitCode: 0, continueLoop: true, summary: `Feature ${requireString(decision.feature_id, 'feature_id')} formalized.` };
      case 'plan_task':
        this.ensureCleanWorktreeIfRequired();
        this.planTask(requireString(decision.feature_id, 'feature_id'));
        return { exitCode: 0, continueLoop: true, summary: `Next task planned for feature ${requireString(decision.feature_id, 'feature_id')}.` };
      case 'implement_task':
        this.ensureCleanWorktreeIfRequired();
        this.implementTask(requireString(decision.task_id, 'task_id'));
        return { exitCode: 0, continueLoop: true, summary: `Implementation completed for ${requireString(decision.task_id, 'task_id')}.` };
      case 'correct_task':
        this.ensureCleanWorktreeIfRequired();
        this.correctTask(requireString(decision.correction_task_id, 'correction_task_id'));
        return { exitCode: 0, continueLoop: true, summary: `Correction implementation completed for ${requireString(decision.correction_task_id, 'correction_task_id')}.` };
      case 'review_task':
        return this.reviewTask(requireString(decision.task_id, 'task_id'));
      case 'blocked':
        console.error(`Blocked: ${decision.reason}`);
        return { exitCode: 2, continueLoop: false, summary: decision.reason };
      case 'stop':
        console.log('No selectable feature remains.');
        return { exitCode: 0, continueLoop: false, summary: 'No selectable feature remains.' };
      default:
        return assertNever(decision.kind);
    }
  }

  private ensureCleanWorktreeIfRequired(): void {
    if (this.skipCleanWorktreeCheck) {
      return;
    }

    this.git.ensureCleanWorktree();
  }

  private planFeature(featureId: string): void {
    const feature = this.loadFeature(featureId);
    const prompt = [
      'Act as the CompassRose Planner.',
      '',
      `Formalize feature \`${featureId}\`.`,
      '',
      'Read only:',
      '- `src/contracts/planner/feature-planning-prompt.md`',
      `- \`${relativePath(this.repositoryRoot, feature.requestPath)}\``,
      '- `docs/compassrose/PROJECT_STATE.md`',
      '- `docs/compassrose/CONFIG.md`',
      '- `docs/features/README.md`',
      '- `docs/templates/feature.md`',
      '- `docs/templates/architecture.md`',
      '- `docs/templates/state.md`',
      '- `src/contracts/state/feature-state.md`',
      '- `docs/ROADMAP.md`',
      '- `docs/SAD.md`',
      '- `docs/ADR.md`',
      '- `docs/DMS.md`',
      '',
      'Return JSON with complete Markdown for `feature.md`, `architecture.md`, and `state.md`.',
      'Do not modify files.',
    ].join('\n');

    const planned = this.codex.runStructured<PlannedFeatureDocs>(prompt, FEATURE_PLAN_SCHEMA, [], `feature-plan:${featureId}`);
    writeText(feature.featurePath, ensureTrailingNewline(planned.feature_md));
    writeText(feature.architecturePath, ensureTrailingNewline(planned.architecture_md));
    writeText(feature.statePath, ensureTrailingNewline(planned.state_md));

    const updatedProjectState = this.updateProjectStateForFeaturePlan(featureId);
    writeText(this.projectStatePath, updatedProjectState);

    if (this.options.commit) {
      this.git.commit(
        [
          relativePath(this.repositoryRoot, feature.featurePath),
          relativePath(this.repositoryRoot, feature.architecturePath),
          relativePath(this.repositoryRoot, feature.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
        ],
        `proto: formalize feature ${featureId}`,
      );
    }
  }

  private planTask(featureId: string): void {
    const feature = this.loadFeature(featureId);
    const prompt = [
      'Act as the CompassRose Planner.',
      '',
      `Plan the next task for feature \`${featureId}\`.`,
      '',
      'Read only:',
      '- `src/contracts/planner/task-planning-prompt.md`',
      '- `src/contracts/planner/input.md`',
      '- `src/contracts/planner/output.md`',
      '- `src/contracts/state/feature-state.md`',
      '- `src/contracts/task/task.md`',
      `- \`${relativePath(this.repositoryRoot, feature.featurePath)}\``,
      `- \`${relativePath(this.repositoryRoot, feature.architecturePath)}\``,
      `- \`${relativePath(this.repositoryRoot, feature.statePath)}\``,
      '- `docs/compassrose/PROJECT_STATE.md`',
      '- `docs/compassrose/CONFIG.md`',
      '- `src/contracts/runtime/operation-loop.md`',
      '- `src/config/`',
      '- `src/doctor/`',
      '- `src/cli/main.ts`',
      '- `tests/`',
      '',
      'Rules:',
      '- Generate exactly one atomic task.',
      '- Keep the task feature-scoped and reviewable.',
      '- Use `test_guided` for implementation tasks that produce code.',
      '- `quality_gates.before_review` must contain runnable shell commands, not prose.',
      '- Return JSON only and do not modify files.',
    ].join('\n');

    const planned = this.codex.runStructured<PlannerOutput>(prompt, PLANNER_OUTPUT_SCHEMA, [], `task-plan:${featureId}`);
    const task = planned.task;
    if (task.expected_deliverables.includes('code') && task.development_policy.mode !== 'test_guided') {
      throw new Error(`Planned task ${task.task_id} must use \`test_guided\` when it delivers code.`);
    }

    const taskPath = join(feature.tasksDirectory, buildTaskFileName(task.task_id, task.title));
    const taskMarkdown = renderTaskMarkdown(task);

    writeText(taskPath, taskMarkdown);
    this.artifacts.writeJson(join('tasks', `${task.task_id}.json`), planned);

    const updatedFeatureState = this.updateFeatureStateForTaskPlan(feature.statePath, task.task_id, task.title);
    const updatedProjectState = this.updateProjectStateForTaskPlan(featureId, task.task_id);

    writeText(feature.statePath, updatedFeatureState);
    writeText(this.projectStatePath, updatedProjectState);

    if (this.options.commit) {
      this.git.commit(
        [
          relativePath(this.repositoryRoot, taskPath),
          relativePath(this.repositoryRoot, feature.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
        ],
        `proto: plan task ${task.task_id}`,
      );
    }
  }

  private implementTask(taskId: string): void {
    const task = this.loadTask(taskId);
    this.executeImplementation(task, false);
  }

  private correctTask(correctionTaskId: string): void {
    const task = this.loadTask(correctionTaskId);
    this.executeImplementation(task, true);
  }

  private reviewTask(taskId: string): StepExecutionResult {
    const diff = this.git.diffPatch();
    if (diff.trim().length === 0) {
      throw new Error(`Review for ${taskId} cannot proceed because git diff is empty.`);
    }

    const task = this.loadTask(taskId);
    const feature = this.loadFeature(task.featureId);
    const qualityResults = this.ensureQualityGateResults(task);
    const implementation = this.ensureImplementationAttempt(task);
    const tempDir = mkdtempSync(join(tmpdir(), 'proto-compassrose-review-'));
    const diffPath = join(tempDir, 'diff.patch');
    const qualityPath = join(tempDir, 'quality-gates.json');
    const implementationPath = join(tempDir, 'implementation.json');
    writeFileSync(diffPath, diff, 'utf8');
    writeFileSync(qualityPath, `${JSON.stringify(qualityResults, null, 2)}\n`, 'utf8');
    writeFileSync(implementationPath, `${JSON.stringify(implementation, null, 2)}\n`, 'utf8');

    const prompt = [
      'Act as the CompassRose Reviewer.',
      '',
      `Review task \`${taskId}\` for feature \`${task.featureId}\`.`,
      '',
      'Read only:',
      '- `src/contracts/reviewer/review-prompt.md`',
      '- `src/contracts/reviewer/input.md`',
      '- `src/contracts/reviewer/output.md`',
      '- `src/contracts/task/correction-task.md`',
      `- \`${relativePath(this.repositoryRoot, task.path)}\``,
      `- \`${relativePath(this.repositoryRoot, feature.featurePath)}\``,
      `- \`${relativePath(this.repositoryRoot, feature.architecturePath)}\``,
      `- \`${relativePath(this.repositoryRoot, feature.statePath)}\``,
      '- `docs/compassrose/CONFIG.md`',
      `- \`${diffPath}\``,
      `- \`${implementationPath}\``,
      `- \`${qualityPath}\``,
      '- if needed, only the files changed in the diff',
      '',
      'Rules:',
      '- Validate objective, acceptance criteria, scope, constraints, and quality gates.',
      '- For `test_guided` tasks, confirm that the diff includes meaningful test changes for the claimed behavior.',
      '- Return JSON only.',
      '- If status is `changes_required`, include a correction task narrower than the original task.',
      '- Do not modify files.',
    ].join('\n');

    const review = this.codex.runStructured<ReviewerOutput>(prompt, REVIEWER_OUTPUT_SCHEMA, [tempDir], `review:${taskId}`);
    this.artifacts.writeJson(join('reviews', `${taskId}.json`), review);
    const taskInterfaceAnalysis = this.shouldAnalyzeTaskInterface(review)
      ? this.analyzeTaskInterface(task, feature, review, implementation, qualityResults, tempDir)
      : null;

    if (review.status === 'approved') {
      const updatedFeatureState = this.updateFeatureStateAfterApprovedReview(feature.statePath, task);
      const updatedProjectState = this.updateProjectStateAfterApprovedReview(task.featureId, task.taskId);
      writeText(feature.statePath, updatedFeatureState);
      writeText(this.projectStatePath, updatedProjectState);

      if (this.options.commit) {
        const changedFiles = this.git.diffNameOnly();
        this.git.commit(changedFiles, `proto: approve task ${task.taskId}`);
      }

      return {
        exitCode: 0,
        continueLoop: true,
        summary: taskInterfaceAnalysis
          ? `Review approved ${task.taskId}; task-interface analysis also captured implementer feedback.`
          : `Review approved ${task.taskId}.`,
      };
    }

    if (review.status === 'changes_required') {
      if (!review.correction_task) {
        throw new Error(`Review for ${taskId} returned changes_required without a correction task.`);
      }

      const correction = review.correction_task;
      const correctionPath = this.writeCorrectionTask(correction);
      this.artifacts.writeJson(join('tasks', `${correction.correction_task_id}.json`), {
        task: correctionTaskToTask(correction),
      });

      const updatedFeatureState = this.updateFeatureStateForCorrection(feature.statePath, task.taskId, correction.correction_task_id);
      const updatedProjectState = this.updateProjectStateForCorrection(task.featureId, correction.correction_task_id);
      writeText(feature.statePath, updatedFeatureState);
      writeText(this.projectStatePath, updatedProjectState);
      console.error(`Review requested correction task ${correction.correction_task_id} at ${relativePath(this.repositoryRoot, correctionPath)}.`);
      return {
        exitCode: 2,
        continueLoop: false,
        summary: taskInterfaceAnalysis
          ? `Review requested correction task ${correction.correction_task_id} for ${task.taskId}; task-interface analysis was recorded.`
          : `Review requested correction task ${correction.correction_task_id} for ${task.taskId}.`,
      };
    }

    if (review.status === 'blocked') {
      console.error(review.summary);
      return {
        exitCode: 2,
        continueLoop: false,
        summary: taskInterfaceAnalysis ? `${review.summary} Task-interface analysis was recorded.` : review.summary,
      };
    }

    console.error(review.summary);
    return {
      exitCode: 1,
      continueLoop: false,
      summary: taskInterfaceAnalysis ? `${review.summary} Task-interface analysis was recorded.` : review.summary,
    };
  }

  private shouldAnalyzeTaskInterface(review: ReviewerOutput): boolean {
    return review.status !== 'approved' || review.findings.length > 0;
  }

  private analyzeTaskInterface(
    task: ParsedTaskDocument,
    feature: FeatureRecord,
    review: ReviewerOutput,
    implementation: ImplementationAttempt,
    qualityResults: readonly QualityGateResult[],
    tempDir: string,
  ): TaskInterfaceAnalysis {
    const reviewPath = join(tempDir, 'review.json');
    writeFileSync(reviewPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');

    const prompt = [
      'Act as the CompassRose task-interface analyst.',
      '',
      `Analyze task \`${task.taskId}\` after a problematic or diagnostic review outcome.`,
      '',
      'Read only:',
      '- `src/contracts/task/task.md`',
      '- `src/contracts/implementer/task-execution-prompt.md`',
      '- `src/contracts/adapters/implementer-adapter.md`',
      '- `src/contracts/reviewer/review-prompt.md`',
      '- `src/contracts/reviewer/output.md`',
      `- \`${relativePath(this.repositoryRoot, task.path)}\``,
      `- \`${relativePath(this.repositoryRoot, feature.featurePath)}\``,
      `- \`${relativePath(this.repositoryRoot, feature.architecturePath)}\``,
      `- \`${relativePath(this.repositoryRoot, feature.statePath)}\``,
      '- `docs/compassrose/CONFIG.md`',
      `- \`${join(tempDir, 'implementation.json')}\``,
      `- \`${join(tempDir, 'quality-gates.json')}\``,
      `- \`${reviewPath}\``,
      '',
      'Goal:',
      '- Decide whether the implementation problems are at least partly perfectible by tightening the task interface.',
      '- If yes, propose concrete adjustments to task fields so future implementers perform better.',
      '- If not fully perfectible, document implementer limitations that should be recognized by future task design.',
      '',
      'Rules:',
      '- Focus on the task interface, not on fixing the code.',
      '- Prefer concrete changes to `first_executable_step`, `minimum_progress_evidence`, context, scope, acceptance criteria, or quality gates.',
      '- When the implementer appears limited rather than under-specified, say so explicitly.',
      '- Return JSON only.',
    ].join('\n');

    const analysis = this.codex.runStructured<TaskInterfaceAnalysis>(
      prompt,
      TASK_INTERFACE_ANALYSIS_SCHEMA,
      [tempDir],
      `task-interface:${task.taskId}`,
    );
    this.artifacts.writeJson(join('task-interface-analysis', `${task.taskId}.json`), analysis);
    this.artifacts.writeText(
      join('task-interface-analysis', `${task.taskId}.md`),
      renderTaskInterfaceAnalysisMarkdown(analysis, task, review, implementation, qualityResults),
    );
    return analysis;
  }

  private executeImplementation(task: ParsedTaskDocument, correction: boolean): void {
    const prompt = buildImplementerPrompt(task, correction);
    const commandResult = this.opencode.run(prompt, correction ? `correction:${task.taskId}` : `implement:${task.taskId}`);
    const attempt = this.captureImplementationAttempt(task, commandResult);
    this.artifacts.writeJson(join('implementations', `${task.taskId}.json`), attempt);
    this.artifacts.writeText(join('raw-output', `${task.taskId}.log`), ensureTrailingNewline(attempt.raw_output || 'No output.\n'));

    const feature = this.loadFeature(task.featureId);

    if (attempt.git_diff.trim().length > 0) {
      this.artifacts.writeText(join('diffs', `${task.taskId}.patch`), attempt.git_diff);
    }

    if (attempt.status !== 'success') {
      writeText(feature.statePath, this.updateFeatureStateAfterImplementationFailure(feature.statePath, task.taskId));
      writeText(this.projectStatePath, this.updateProjectStateAfterImplementationFailure(task.featureId, task.taskId));
      throw new Error(attempt.error ?? `Implementation for ${task.taskId} failed.`);
    }

    const qualityResults = this.runQualityGates(task);
    this.artifacts.writeJson(join('quality-gates', `${task.taskId}.json`), qualityResults);

    const passed = qualityResults.every((result) => result.status !== 'failed');
    const featureState = this.updateFeatureStateAfterImplementation(
      feature.statePath,
      task.taskId,
      passed ? 'review_pending' : 'quality_failed',
      passed ? 'passed' : 'failed',
    );
    const projectState = this.updateProjectStateAfterImplementation(task.featureId, task.taskId, passed);
    writeText(feature.statePath, featureState);
    writeText(this.projectStatePath, projectState);

    if (!passed) {
      throw new Error(`Quality gates failed after implementing ${task.taskId}.`);
    }
  }

  private captureImplementationAttempt(task: ParsedTaskDocument, commandResult: CommandExecution): ImplementationAttempt {
    const changedFiles = this.git.diffNameOnly();
    const diff = this.git.diffPatch();
    const rawOutput = joinOutput(commandResult.stdout, commandResult.stderr);
    const diagnostics = buildImplementationDiagnostics(task, commandResult, changedFiles, diff, rawOutput);
    const hasDiff = diff.trim().length > 0;
    const status = commandResult.ok && hasDiff && diagnostics.minimum_progress_evidence_status !== 'absent'
      ? 'success'
      : 'failed';

    return {
      status,
      changed_files: changedFiles,
      git_diff: diff,
      raw_output: rawOutput,
      implementation_notes: null,
      diagnostics,
      error: status === 'failed'
        ? buildImplementationErrorMessage(task.taskId, commandResult, diagnostics, hasDiff)
        : null,
    };
  }

  private ensureImplementationAttempt(task: ParsedTaskDocument): ImplementationAttempt {
    const stored = this.artifacts.readJson<ImplementationAttempt>(join('implementations', `${task.taskId}.json`));
    if (stored) {
      return stored;
    }

    const diff = this.git.diffPatch();
    return {
      status: diff.trim().length > 0 ? 'success' : 'failed',
      changed_files: this.git.diffNameOnly(),
      git_diff: diff,
      raw_output: 'No stored implementer output.',
      implementation_notes: null,
      diagnostics: {
        classification: 'unknown',
        evidence: ['No stored implementation artifact was found.'],
        first_executable_step_status: diff.trim().length > 0 ? 'attempted' : 'unknown',
        minimum_progress_evidence_status: diff.trim().length > 0 ? 'present' : 'absent',
        exit_code: null,
        signal: null,
        timed_out: false,
        command_invoked: null,
      },
      error: diff.trim().length > 0 ? null : 'No stored implementation artifact was found.',
    };
  }

  private runQualityGates(task: ParsedTaskDocument): QualityGateResult[] {
    return task.qualityGates.map((command) => {
      const result = spawnSync(command, {
        cwd: this.repositoryRoot,
        shell: true,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      });

      return {
        name: command,
        command,
        status: result.status === 0 ? 'passed' : 'failed',
        output_summary: summarizeCommandOutput(result.stdout, result.stderr),
      } satisfies QualityGateResult;
    });
  }

  private ensureQualityGateResults(task: ParsedTaskDocument): QualityGateResult[] {
    const stored = this.artifacts.readJson<QualityGateResult[]>(join('quality-gates', `${task.taskId}.json`));
    if (stored && stored.length > 0) {
      return stored;
    }

    const fresh = this.runQualityGates(task);
    this.artifacts.writeJson(join('quality-gates', `${task.taskId}.json`), fresh);
    return fresh;
  }

  private writeCorrectionTask(correction: CorrectionTask): string {
    const feature = this.loadFeature(correction.feature_id);
    const path = join(
      feature.tasksDirectory,
      buildCorrectionTaskFileName(correction.correction_task_id, correction.title),
    );

    const markdown = renderCorrectionTaskMarkdown(correction);
    writeText(path, markdown);
    return path;
  }

  private loadFeature(featureId: string): FeatureRecord {
    const features = this.listFeatures();
    const feature = features.find((item) => item.id === featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} was not found under ${this.featuresRoot}.`);
    }

    return feature;
  }

  private listFeatures(): FeatureRecord[] {
    return readdirSync(this.featuresRoot)
      .filter((entry) => statSync(join(this.featuresRoot, entry)).isDirectory())
      .map((entry) => ({
        id: entry,
        name: entry.replace(/^\d+-/, ''),
        directory: join(this.featuresRoot, entry),
        requestPath: join(this.featuresRoot, entry, 'request.md'),
        featurePath: join(this.featuresRoot, entry, 'feature.md'),
        architecturePath: join(this.featuresRoot, entry, 'architecture.md'),
        statePath: join(this.featuresRoot, entry, 'state.md'),
        tasksDirectory: join(this.featuresRoot, entry, 'tasks'),
      }))
      .sort((left, right) => compareFeatureIds(left.id, right.id));
  }

  private loadTask(taskId: string): ParsedTaskDocument {
    const stored = this.artifacts.readJson<{ task: PlannedTask }>(join('tasks', `${taskId}.json`));
    if (stored) {
      const feature = this.loadFeature(stored.task.feature_id);
      const taskPath = this.findTaskDocumentPath(taskId, feature.tasksDirectory);
      return {
        taskId: stored.task.task_id,
        featureId: stored.task.feature_id,
        title: stored.task.title,
        objective: stored.task.objective,
        firstExecutableStep: stored.task.first_executable_step,
        minimumProgressEvidence: stored.task.minimum_progress_evidence,
        allowedPaths: stored.task.scope.allowed_paths,
        forbiddenPaths: stored.task.scope.forbidden_paths,
        constraints: stored.task.constraints,
        acceptanceCriteria: stored.task.acceptance_criteria,
        qualityGates: stored.task.quality_gates.before_review,
        developmentPolicy: stored.task.development_policy.mode,
        likelyAffectedFiles: stored.task.context.relevant_paths,
        path: taskPath,
      };
    }

    const taskPath = this.findTaskDocumentPath(taskId);
    return parseTaskDocument(taskPath, readFileSync(taskPath, 'utf8'));
  }

  private findTaskDocumentPath(taskId: string, tasksDirectory?: string): string {
    const searchRoots = tasksDirectory ? [tasksDirectory] : this.listFeatures().map((feature) => feature.tasksDirectory);

    for (const root of searchRoots) {
      if (!statSafeIsDirectory(root)) {
        continue;
      }

      for (const entry of readdirSync(root)) {
        if (!entry.endsWith('.md')) {
          continue;
        }

        const fullPath = join(root, entry);
        const markdown = readFileSync(fullPath, 'utf8');
        if (markdown.includes(`\`${taskId}\``)) {
          return fullPath;
        }
      }
    }

    throw new Error(`Task document for ${taskId} was not found.`);
  }

  private updateProjectStateForFeaturePlan(featureId: string): string {
    let markdown = readFileSync(this.projectStatePath, 'utf8');
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${featureId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList([
      'Plan the next implementation task for the active feature.',
      'Continue updating this file with approved repository facts as feature work lands.',
    ]));
    markdown = replaceSection(markdown, 'Next Planning Hint', `The active feature is \`${featureId}\`, and its next valid action is task planning.`);
    markdown = replaceSection(markdown, 'Last Approved Change', `Feature \`${featureId}\` was formalized by the prototype orchestrator.`);
    markdown = upsertBulletInSection(
      markdown,
      'Current Reality',
      `- The active feature pointer currently targets \`${featureId}\``,
      `- The active feature pointer currently targets \`${featureId}\`; the detailed task and lifecycle state for that feature lives in \`docs/features/${featureId}/state.md\`.`,
    );
    return markdown;
  }

  private updateProjectStateForTaskPlan(featureId: string, taskId: string): string {
    let markdown = readFileSync(this.projectStatePath, 'utf8');
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${featureId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList([
      `Execute \`${taskId}\` for the active feature.`,
      'Continue updating this file with approved repository facts as feature work lands.',
    ]));
    markdown = replaceSection(markdown, 'Next Planning Hint', `The active feature is \`${featureId}\`, and its next valid action is to execute \`${taskId}\`.`);
    markdown = upsertBulletInSection(
      markdown,
      'Current Reality',
      `- Feature \`${featureId}\` now has a planned next task`,
      `- Feature \`${featureId}\` now has a planned next task, \`${taskId}\`, ready to execute.`,
    );
    return markdown;
  }

  private updateProjectStateAfterImplementation(featureId: string, taskId: string, passed: boolean): string {
    let markdown = readFileSync(this.projectStatePath, 'utf8');
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${featureId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList([
      passed ? `Review \`${taskId}\` for the active feature.` : `Investigate failed quality gates for \`${taskId}\`.`,
      'Continue updating this file with approved repository facts as feature work lands.',
    ]));
    markdown = replaceSection(
      markdown,
      'Next Planning Hint',
      passed
        ? `The active feature is \`${featureId}\`, and its next valid action is to review \`${taskId}\`.`
        : `The active feature is \`${featureId}\`, but quality gates for \`${taskId}\` failed and the run should stop.`,
    );
    return markdown;
  }

  private updateProjectStateAfterImplementationFailure(featureId: string, taskId: string): string {
    let markdown = readFileSync(this.projectStatePath, 'utf8');
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${featureId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList([
      `Recover the failed implementation attempt for \`${taskId}\` before continuing.`,
      'Continue updating this file with approved repository facts as feature work lands.',
    ]));
    markdown = replaceSection(
      markdown,
      'Next Planning Hint',
      `The active feature is \`${featureId}\`, but implementation of \`${taskId}\` failed and the run should stop.`,
    );
    return markdown;
  }

  private updateProjectStateAfterApprovedReview(featureId: string, taskId: string): string {
    let markdown = readFileSync(this.projectStatePath, 'utf8');
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${featureId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList([
      'Plan the next implementation task for the active feature.',
      'Continue updating this file with approved repository facts as feature work lands.',
    ]));
    markdown = replaceSection(markdown, 'Last Approved Change', `Task \`${taskId}\` was approved by the prototype orchestrator.`);
    markdown = replaceSection(markdown, 'Next Planning Hint', `The active feature is \`${featureId}\`, and its next valid action is the next task-planning pass.`);
    return markdown;
  }

  private updateProjectStateForCorrection(featureId: string, correctionTaskId: string): string {
    let markdown = readFileSync(this.projectStatePath, 'utf8');
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${featureId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList([
      `Execute correction task \`${correctionTaskId}\` for the active feature.`,
      'Continue updating this file with approved repository facts as feature work lands.',
    ]));
    markdown = replaceSection(markdown, 'Next Planning Hint', `The active feature is \`${featureId}\`, and its next valid action is to execute correction task \`${correctionTaskId}\`.`);
    return markdown;
  }

  private updateFeatureStateForTaskPlan(featureStatePath: string, taskId: string, title: string): string {
    let markdown = readFileSync(featureStatePath, 'utf8');
    markdown = replaceSection(markdown, 'Lifecycle State', 'task_ready');
    markdown = replaceOperationalStatus(markdown, {
      active_task: taskId,
      active_correction_task: 'none',
    });
    markdown = upsertParagraphInSection(
      markdown,
      'Current Reality',
      `Task \`${taskId}\``,
      `Task \`${taskId}\` is now planned and ready to execute. ${title}.`,
    );
    markdown = replaceSection(markdown, 'Next Planning Hint', `Execute \`${taskId}\` when the current execution mode allows it.`);
    return markdown;
  }

  private updateFeatureStateAfterImplementation(
    featureStatePath: string,
    taskId: string,
    lifecycleState: 'review_pending' | 'quality_failed',
    qualityResult: 'passed' | 'failed',
  ): string {
    let markdown = readFileSync(featureStatePath, 'utf8');
    markdown = replaceSection(markdown, 'Lifecycle State', lifecycleState);
    markdown = replaceOperationalStatus(markdown, {
      active_task: taskId,
      last_implementation_result: 'passed',
      last_quality_gate_result: qualityResult,
      last_review_result: 'not_run',
    });
    markdown = replaceSection(
      markdown,
      'Next Planning Hint',
      lifecycleState === 'review_pending'
        ? `Review \`${taskId}\` next.`
        : `Quality gates for \`${taskId}\` failed; stop and recover before continuing.`,
    );
    return markdown;
  }

  private updateFeatureStateAfterImplementationFailure(featureStatePath: string, taskId: string): string {
    let markdown = readFileSync(featureStatePath, 'utf8');
    markdown = replaceSection(markdown, 'Lifecycle State', 'implementation_failed');
    markdown = replaceOperationalStatus(markdown, {
      active_task: taskId,
      last_implementation_result: 'failed',
      last_quality_gate_result: 'unknown',
      last_review_result: 'not_run',
    });
    markdown = replaceSection(
      markdown,
      'Next Planning Hint',
      `Recover or rerun \`${taskId}\` before allowing further planning or review.`,
    );
    return markdown;
  }

  private updateFeatureStateAfterApprovedReview(featureStatePath: string, task: ParsedTaskDocument): string {
    let markdown = readFileSync(featureStatePath, 'utf8');
    markdown = replaceSection(markdown, 'Lifecycle State', 'formalized');
    markdown = replaceOperationalStatus(markdown, {
      active_task: 'none',
      active_correction_task: 'none',
      last_implementation_result: 'passed',
      last_quality_gate_result: 'passed',
      last_review_result: 'approved',
    });
    markdown = replaceSection(markdown, 'Last Approved Change', `Task \`${task.taskId}\` was approved by the prototype orchestrator.`);
    markdown = replaceSection(markdown, 'Next Planning Hint', 'Plan the next task that advances this feature from the remaining gap.');
    return markdown;
  }

  private updateFeatureStateForCorrection(
    featureStatePath: string,
    taskId: string,
    correctionTaskId: string,
  ): string {
    let markdown = readFileSync(featureStatePath, 'utf8');
    markdown = replaceSection(markdown, 'Lifecycle State', 'correction_pending');
    markdown = replaceOperationalStatus(markdown, {
      active_task: taskId,
      active_correction_task: correctionTaskId,
      last_review_result: 'changes_required',
    });
    markdown = replaceSection(markdown, 'Next Planning Hint', `Execute correction task \`${correctionTaskId}\` next.`);
    return markdown;
  }

  private writeRunSummary(status: 'completed' | 'stopped' | 'failed', exitCode: number, error: string | null): void {
    const summary: RunSummary = {
      run_id: this.runId,
      started_at: this.startedAt,
      finished_at: new Date().toISOString(),
      status,
      exit_code: exitCode,
      options: this.options,
      steps: this.stepRecords,
      error,
    };

    this.artifacts.writeJson(join('runs', `${this.runId}.json`), summary);
    this.artifacts.writeJson('latest-run.json', summary);
  }

  private writeRefinementFeedback(trigger: string, selectedStep: StepDecision | null): void {
    const feedback: RefinementFeedback = {
      run_id: this.runId,
      created_at: new Date().toISOString(),
      trigger,
      selected_step: selectedStep,
      likely_sources: inferLikelySources(trigger, selectedStep),
      observations: buildObservations(trigger, selectedStep),
      next_questions: buildNextQuestions(trigger, selectedStep),
    };

    const markdown = renderRefinementFeedback(feedback);
    this.artifacts.writeText(join('refinement', `${this.runId}.md`), markdown);
    this.artifacts.writeJson(join('refinement', `${this.runId}.json`), feedback);
    this.artifacts.writeText('latest-refinement.md', markdown);
    this.artifacts.writeJson('latest-refinement.json', feedback);
  }
}

const STEP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'feature_id', 'task_id', 'correction_task_id', 'reason'],
  properties: {
    kind: {
      type: 'string',
      enum: ['plan_feature', 'plan_task', 'implement_task', 'review_task', 'correct_task', 'stop', 'blocked'],
    },
    feature_id: { type: ['string', 'null'] },
    task_id: { type: ['string', 'null'] },
    correction_task_id: { type: ['string', 'null'] },
    reason: { type: 'string' },
  },
} as const;

const FEATURE_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['feature_id', 'feature_md', 'architecture_md', 'state_md', 'summary'],
  properties: {
    feature_id: { type: 'string' },
    feature_md: { type: 'string' },
    architecture_md: { type: 'string' },
    state_md: { type: 'string' },
    summary: { type: 'string' },
  },
} as const;

const PLANNER_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['task'],
  properties: {
    task: {
      type: 'object',
      additionalProperties: false,
      required: [
        'task_id',
        'feature_id',
        'title',
        'objective',
        'first_executable_step',
        'minimum_progress_evidence',
        'trace',
        'context',
        'scope',
        'constraints',
        'development_policy',
        'quality_gates',
        'acceptance_criteria',
        'expected_deliverables',
      ],
      properties: {
        task_id: { type: 'string' },
        feature_id: { type: 'string' },
        title: { type: 'string' },
        objective: { type: 'string' },
        first_executable_step: { type: 'string' },
        minimum_progress_evidence: {
          type: 'array',
          items: { type: 'string' },
        },
        trace: {
          type: 'object',
          additionalProperties: false,
          required: ['roadmap_objective', 'feature_goal', 'state_gap'],
          properties: {
            roadmap_objective: { type: 'string' },
            feature_goal: { type: 'string' },
            state_gap: { type: 'string' },
          },
        },
        context: {
          type: 'object',
          additionalProperties: false,
          required: ['summary', 'relevant_paths', 'relevant_modules'],
          properties: {
            summary: { type: 'string' },
            relevant_paths: { type: 'array', items: { type: 'string' } },
            relevant_modules: { type: 'array', items: { type: 'string' } },
          },
        },
        scope: {
          type: 'object',
          additionalProperties: false,
          required: ['allowed_paths', 'forbidden_paths'],
          properties: {
            allowed_paths: { type: 'array', items: { type: 'string' } },
            forbidden_paths: { type: 'array', items: { type: 'string' } },
          },
        },
        constraints: { type: 'array', items: { type: 'string' } },
        development_policy: {
          type: 'object',
          additionalProperties: false,
          required: ['mode'],
          properties: {
            mode: {
              type: 'string',
              enum: ['test_guided', 'implementation_first', 'documentation_first', 'strict_tdd'],
            },
          },
        },
        quality_gates: {
          type: 'object',
          additionalProperties: false,
          required: ['before_review'],
          properties: {
            before_review: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
        acceptance_criteria: { type: 'array', items: { type: 'string' } },
        expected_deliverables: {
          type: 'array',
          items: { type: 'string', enum: ['code', 'tests', 'documentation'] },
        },
      },
    },
  },
} as const;

const REVIEWER_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'task_id',
    'status',
    'summary',
    'acceptance',
    'findings',
    'scope_check',
    'quality_gate_check',
    'correction_task',
    'project_state_update_hint',
  ],
  properties: {
    task_id: { type: 'string' },
    status: { type: 'string', enum: ['approved', 'changes_required', 'blocked', 'failed'] },
    summary: { type: 'string' },
    acceptance: {
      type: 'object',
      additionalProperties: false,
      required: ['criteria'],
      properties: {
        criteria: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['criterion', 'status', 'notes'],
            properties: {
              criterion: { type: 'string' },
              status: { type: 'string', enum: ['passed', 'failed', 'not_verified'] },
              notes: { type: 'string' },
            },
          },
        },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'message', 'path', 'related_acceptance_criterion'],
        properties: {
          severity: { type: 'string', enum: ['info', 'warning', 'error', 'blocker'] },
          message: { type: 'string' },
          path: { type: ['string', 'null'] },
          related_acceptance_criterion: { type: ['string', 'null'] },
        },
      },
    },
    scope_check: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'unrelated_changes'],
      properties: {
        status: { type: 'string', enum: ['passed', 'failed'] },
        unrelated_changes: { type: 'array', items: { type: 'string' } },
      },
    },
    quality_gate_check: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'failed_gates'],
      properties: {
        status: { type: 'string', enum: ['passed', 'failed', 'skipped'] },
        failed_gates: { type: 'array', items: { type: 'string' } },
      },
    },
    correction_task: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: [
            'parent_task_id',
            'correction_task_id',
            'feature_id',
            'title',
            'objective',
            'first_executable_step',
            'minimum_progress_evidence',
            'review_findings',
            'scope',
            'constraints',
            'acceptance_criteria',
            'quality_gates',
          ],
          properties: {
            parent_task_id: { type: 'string' },
            correction_task_id: { type: 'string' },
            feature_id: { type: 'string' },
            title: { type: 'string' },
            objective: { type: 'string' },
            first_executable_step: { type: 'string' },
            minimum_progress_evidence: { type: 'array', items: { type: 'string' } },
            review_findings: { type: 'array', items: { type: 'string' } },
            scope: {
              type: 'object',
              additionalProperties: false,
              required: ['allowed_paths', 'forbidden_paths'],
              properties: {
                allowed_paths: { type: 'array', items: { type: 'string' } },
                forbidden_paths: { type: 'array', items: { type: 'string' } },
              },
            },
            constraints: { type: 'array', items: { type: 'string' } },
            acceptance_criteria: { type: 'array', items: { type: 'string' } },
            quality_gates: {
              type: 'object',
              additionalProperties: false,
              required: ['before_review'],
              properties: {
                before_review: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      ],
    },
    project_state_update_hint: { type: ['string', 'null'] },
  },
} as const;

const TASK_INTERFACE_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'task_id',
    'review_status',
    'summary',
    'recommended_action',
    'perfectible',
    'implementer_limitations',
    'task_interface_adjustments',
    'notes_for_documentation',
  ],
  properties: {
    task_id: { type: 'string' },
    review_status: { type: 'string', enum: ['approved', 'changes_required', 'blocked', 'failed'] },
    summary: { type: 'string' },
    recommended_action: {
      type: 'string',
      enum: ['tighten_task_interface', 'document_implementer_limitation', 'both', 'none'],
    },
    perfectible: { type: 'boolean' },
    implementer_limitations: { type: 'array', items: { type: 'string' } },
    task_interface_adjustments: {
      type: 'object',
      additionalProperties: false,
      required: [
        'first_executable_step',
        'minimum_progress_evidence',
        'context_additions',
        'scope_adjustments',
        'acceptance_criteria_adjustments',
        'quality_gate_adjustments',
      ],
      properties: {
        first_executable_step: { type: ['string', 'null'] },
        minimum_progress_evidence: { type: 'array', items: { type: 'string' } },
        context_additions: { type: 'array', items: { type: 'string' } },
        scope_adjustments: { type: 'array', items: { type: 'string' } },
        acceptance_criteria_adjustments: { type: 'array', items: { type: 'string' } },
        quality_gate_adjustments: { type: 'array', items: { type: 'string' } },
      },
    },
    notes_for_documentation: { type: 'array', items: { type: 'string' } },
  },
} as const;

function main(argv: readonly string[]): number {
  const options = parseArguments(argv);
  const orchestrator = new PrototypeCompassRose(options);
  return orchestrator.run();
}

function parseArguments(argv: readonly string[]): ProtoOptions {
  let loop = false;
  let commit = true;
  let cwd = process.cwd();

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

    if (argument === 'run' || argument === 'run-once') {
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return { loop, commit, cwd };
}

function renderTaskMarkdown(task: PlannedTask): string {
  return [
    `# Task ${humanTaskNumber(task.task_id)}: ${task.title}`,
    '',
    '## Task ID',
    `\`${task.task_id}\``,
    '',
    '## Parent Feature',
    `\`${task.feature_id}\``,
    '',
    '## Goal',
    task.objective,
    '',
    '## First Executable Step',
    task.first_executable_step,
    '',
    '## Minimum Progress Evidence',
    ...task.minimum_progress_evidence.map((item) => `- ${item}`),
    '',
    '## Trace',
    `- Roadmap objective: ${task.trace.roadmap_objective}`,
    `- Feature goal: ${task.trace.feature_goal}`,
    `- State gap: ${task.trace.state_gap}`,
    '',
    '## Context',
    `- ${task.context.summary}`,
    '',
    '## Scope',
    'Allowed:',
    ...task.scope.allowed_paths.map((item) => `- \`${item}\``),
    '',
    'Forbidden:',
    ...task.scope.forbidden_paths.map((item) => `- \`${item}\``),
    '',
    '## Constraints',
    ...task.constraints.map((item) => `- ${item}`),
    '',
    '## Development Policy',
    `- \`${task.development_policy.mode}\``,
    '',
    '## Acceptance Criteria',
    ...task.acceptance_criteria.map((item) => `- ${item}`),
    '',
    '## Files Likely Affected',
    ...task.context.relevant_paths.map((item) => `- \`${item}\``),
    '',
    '## Quality Gates to Run',
    '```bash',
    ...task.quality_gates.before_review,
    '```',
    '',
    '## Expected Deliverables',
    ...task.expected_deliverables.map((item) => `- \`${item}\``),
    '',
  ].join('\n');
}

function renderCorrectionTaskMarkdown(correction: CorrectionTask): string {
  return [
    `# Task ${humanCorrectionNumber(correction.correction_task_id)}: ${correction.title}`,
    '',
    '## Task ID',
    `\`${correction.correction_task_id}\``,
    '',
    '## Parent Task',
    `\`${correction.parent_task_id}\``,
    '',
    '## Parent Feature',
    `\`${correction.feature_id}\``,
    '',
    '## Goal',
    correction.objective,
    '',
    '## First Executable Step',
    correction.first_executable_step,
    '',
    '## Minimum Progress Evidence',
    ...correction.minimum_progress_evidence.map((item) => `- ${item}`),
    '',
    '## Review Findings',
    ...correction.review_findings.map((item) => `- ${item}`),
    '',
    '## Scope',
    'Allowed:',
    ...correction.scope.allowed_paths.map((item) => `- \`${item}\``),
    '',
    'Forbidden:',
    ...correction.scope.forbidden_paths.map((item) => `- \`${item}\``),
    '',
    '## Constraints',
    ...correction.constraints.map((item) => `- ${item}`),
    '',
    '## Acceptance Criteria',
    ...correction.acceptance_criteria.map((item) => `- ${item}`),
    '',
    '## Quality Gates to Run',
    '```bash',
    ...correction.quality_gates.before_review,
    '```',
    '',
  ].join('\n');
}

function correctionTaskToTask(correction: CorrectionTask): PlannedTask {
  return {
    task_id: correction.correction_task_id,
    feature_id: correction.feature_id,
    title: correction.title,
    objective: correction.objective,
    first_executable_step: correction.first_executable_step,
    minimum_progress_evidence: correction.minimum_progress_evidence,
    trace: {
      roadmap_objective: 'Correction',
      feature_goal: `Correction for ${correction.parent_task_id}`,
      state_gap: correction.review_findings.join(' '),
    },
    context: {
      summary: correction.review_findings.join(' '),
      relevant_paths: correction.scope.allowed_paths,
      relevant_modules: correction.scope.allowed_paths,
    },
    scope: correction.scope,
    constraints: correction.constraints,
    development_policy: {
      mode: 'test_guided',
    },
    quality_gates: correction.quality_gates,
    acceptance_criteria: correction.acceptance_criteria,
    expected_deliverables: ['code', 'tests'],
  };
}

function buildImplementerPrompt(task: ParsedTaskDocument, correction: boolean): string {
  const role = correction ? 'correction task' : 'task';
  return [
    'Act as the CompassRose Implementer.',
    '',
    `Execute ${role} \`${task.taskId}\` for feature \`${task.featureId}\`.`,
    '',
    'Read only:',
    '- `src/contracts/implementer/task-execution-prompt.md`',
    `- \`${task.path}\``,
    ...task.likelyAffectedFiles.map((item) => `- \`${item}\``),
    '',
    'Instructions:',
    `- Start with: ${task.firstExecutableStep}`,
    '- Follow TDD when the task changes code: add or update the smallest failing test first, then make it pass.',
    '- Stay within the allowed paths listed in the task.',
    '- Do not modify forbidden paths.',
    '- Continue until there is repository evidence beyond read-only exploration.',
    `- Follow \`${task.developmentPolicy}\`.`,
    '- Keep the change minimal and provider-independent.',
    '- Do not claim approval.',
  ].join('\n');
}

function buildImplementationDiagnostics(
  task: ParsedTaskDocument,
  commandResult: CommandExecution,
  changedFiles: readonly string[],
  diff: string,
  rawOutput: string,
): ImplementationDiagnostics {
  const hasDiff = diff.trim().length > 0;
  const evidence = [
    `Task: ${task.taskId}`,
    `Changed files: ${changedFiles.length > 0 ? changedFiles.join(', ') : 'none'}`,
    `Exit code: ${commandResult.exitCode ?? 'null'}`,
    `Signal: ${commandResult.signal ?? 'null'}`,
    `Output tail: ${summarizeText(rawOutput, 400)}`,
  ];

  return {
    classification: classifyImplementation(commandResult, rawOutput, hasDiff),
    evidence,
    first_executable_step_status: hasDiff || rawOutput.trim().length > 0 ? 'attempted' : 'unknown',
    minimum_progress_evidence_status: hasDiff ? 'present' : 'absent',
    exit_code: commandResult.exitCode,
    signal: commandResult.signal,
    timed_out: commandResult.timedOut,
    command_invoked: commandResult.commandInvoked,
  };
}

function classifyImplementation(
  commandResult: CommandExecution,
  rawOutput: string,
  hasDiff: boolean,
): DiagnosticClassification {
  const normalized = rawOutput.toLowerCase();

  if (/context|token|too (large|long)|window/i.test(normalized)) {
    return 'context_overflow';
  }

  if (/permission|approval|allow access|not permitted|denied/i.test(normalized)) {
    return 'permission_prompt';
  }

  if (/refus|cannot comply|policy/i.test(normalized)) {
    return 'tool_refusal';
  }

  if (/provider|endpoint|network|connection|rate limit|429|500|502|503|504|unavailable/i.test(normalized)) {
    return 'provider_failure';
  }

  if (!hasDiff && commandResult.ok) {
    return 'model_passivity';
  }

  if (/tty|interactive|terminal ui|render/i.test(normalized)) {
    return 'ui_cli_behavior';
  }

  return 'unknown';
}

function buildImplementationErrorMessage(
  taskId: string,
  commandResult: CommandExecution,
  diagnostics: ImplementationDiagnostics,
  hasDiff: boolean,
): string {
  if (!commandResult.ok && commandResult.exitCode !== null) {
    return `Implementation for ${taskId} failed with exit code ${commandResult.exitCode} (${diagnostics.classification}).`;
  }

  if (!hasDiff) {
    return `Implementation for ${taskId} produced no git diff (${diagnostics.classification}).`;
  }

  if (diagnostics.minimum_progress_evidence_status === 'absent') {
    return `Implementation for ${taskId} did not produce minimum progress evidence.`;
  }

  return `Implementation for ${taskId} failed (${diagnostics.classification}).`;
}

function inferLikelySources(trigger: string, selectedStep: StepDecision | null): string[] {
  const sources = new Set<string>();
  const normalized = trigger.toLowerCase();

  sources.add('src/contracts/runtime/operation-loop.md');

  if (selectedStep?.kind === 'plan_feature') {
    sources.add('src/contracts/planner/feature-planning-prompt.md');
    sources.add('docs/features/README.md');
  }

  if (selectedStep?.kind === 'plan_task') {
    sources.add('src/contracts/planner/task-planning-prompt.md');
    sources.add('src/contracts/planner/output.md');
    sources.add('src/contracts/task/task.md');
  }

  if (selectedStep?.kind === 'implement_task' || selectedStep?.kind === 'correct_task') {
    sources.add('src/contracts/implementer/task-execution-prompt.md');
    sources.add('src/contracts/adapters/implementer-adapter.md');
    sources.add('src/contracts/task/task.md');
  }

  if (selectedStep?.kind === 'review_task') {
    sources.add('src/contracts/reviewer/review-prompt.md');
    sources.add('src/contracts/reviewer/output.md');
    sources.add('src/contracts/task/correction-task.md');
  }

  if (normalized.includes('project configuration') || normalized.includes('configuration paths')) {
    sources.add('docs/compassrose/CONFIG.md');
    sources.add('src/config/configReader.ts');
  }

  if (normalized.includes('git diff is empty') || normalized.includes('produced no git diff')) {
    sources.add('src/contracts/adapters/implementer-adapter.md');
    sources.add('src/contracts/reviewer/input.md');
  }

  if (normalized.includes('section "##')) {
    sources.add('src/contracts/state/feature-state.md');
    sources.add('docs/features/README.md');
  }

  if (normalized.includes('test_guided')) {
    sources.add('src/contracts/planner/output.md');
    sources.add('src/contracts/implementer/task-execution-prompt.md');
    sources.add('src/contracts/reviewer/review-prompt.md');
  }

  if (normalized.includes('quality gates failed')) {
    sources.add('src/contracts/task/task.md');
    sources.add('src/contracts/reviewer/input.md');
  }

  if (normalized.includes('task document')) {
    sources.add('docs/DMS.md');
    sources.add('src/contracts/task/task.md');
  }

  return [...sources];
}

function buildObservations(trigger: string, selectedStep: StepDecision | null): string[] {
  const observations = [
    `Trigger: ${trigger}`,
    selectedStep
      ? `Selected step: ${selectedStep.kind}${selectedStep.task_id ? ` (${selectedStep.task_id})` : selectedStep.feature_id ? ` (${selectedStep.feature_id})` : ''}`
      : 'Selected step: unknown',
  ];

  if (selectedStep?.reason) {
    observations.push(`Selector reason: ${selectedStep.reason}`);
  }

  if (/git diff is empty|produced no git diff/i.test(trigger)) {
    observations.push('The prototype reached a point where repository evidence was missing or not reviewable.');
  }

  if (/section "##/i.test(trigger)) {
    observations.push('A Markdown contract was not structured the way the prototype expected.');
  }

  if (/test_guided/i.test(trigger)) {
    observations.push('The execution contract and the planned task diverged on TDD policy.');
  }

  return observations;
}

function buildNextQuestions(trigger: string, selectedStep: StepDecision | null): string[] {
  const questions = [
    'Is the failure caused by a weak contract, stale documentation, or an implementation bug in the prototype?',
    'Should this condition be represented more explicitly in project or feature state?',
  ];

  if (/section "##/i.test(trigger)) {
    questions.push('Should this Markdown document gain a stricter canonical template or a machine-readable projection?');
  }

  if (/git diff is empty|produced no git diff/i.test(trigger)) {
    questions.push('Should the implementer adapter preserve stronger minimum-progress evidence before review is attempted?');
  }

  if (/quality gates failed/i.test(trigger)) {
    questions.push('Should quality-gate failure transition rules be documented more explicitly in the runtime contract?');
  }

  if (selectedStep?.kind === 'plan_task') {
    questions.push('Did the planner receive enough repository-local context to produce a bounded task?');
  }

  if (selectedStep?.kind === 'review_task') {
    questions.push('Did the reviewer receive enough structured implementation evidence beyond the raw diff?');
  }

  return questions;
}

function renderRefinementFeedback(feedback: RefinementFeedback): string {
  return [
    `# Refinement Feedback: ${feedback.run_id}`,
    '',
    '## Trigger',
    feedback.trigger,
    '',
    '## Selected Step',
    feedback.selected_step
      ? `- kind: ${feedback.selected_step.kind}
- feature_id: ${feedback.selected_step.feature_id ?? 'null'}
- task_id: ${feedback.selected_step.task_id ?? 'null'}
- correction_task_id: ${feedback.selected_step.correction_task_id ?? 'null'}
- reason: ${feedback.selected_step.reason}`
      : 'No step was selected before the run stopped.',
    '',
    '## Likely Sources To Revisit',
    ...feedback.likely_sources.map((item) => `- \`${item}\``),
    '',
    '## Observations',
    ...feedback.observations.map((item) => `- ${item}`),
    '',
    '## Next Questions',
    ...feedback.next_questions.map((item) => `- ${item}`),
    '',
  ].join('\n');
}

function renderTaskInterfaceAnalysisMarkdown(
  analysis: TaskInterfaceAnalysis,
  task: ParsedTaskDocument,
  review: ReviewerOutput,
  implementation: ImplementationAttempt,
  qualityResults: readonly QualityGateResult[],
): string {
  return [
    `# Task Interface Analysis: ${analysis.task_id}`,
    '',
    '## Review Status',
    review.status,
    '',
    '## Summary',
    analysis.summary,
    '',
    '## Recommended Action',
    `- ${analysis.recommended_action}`,
    `- perfectible: ${analysis.perfectible ? 'yes' : 'no'}`,
    '',
    '## Implementer Limitations',
    ...(analysis.implementer_limitations.length > 0
      ? analysis.implementer_limitations.map((item) => `- ${item}`)
      : ['- None identified.']),
    '',
    '## Task Interface Adjustments',
    `- first_executable_step: ${analysis.task_interface_adjustments.first_executable_step ?? 'no change'}`,
    ...(analysis.task_interface_adjustments.minimum_progress_evidence.length > 0
      ? analysis.task_interface_adjustments.minimum_progress_evidence.map((item) => `- minimum_progress_evidence: ${item}`)
      : ['- minimum_progress_evidence: no change']),
    ...(analysis.task_interface_adjustments.context_additions.length > 0
      ? analysis.task_interface_adjustments.context_additions.map((item) => `- context_addition: ${item}`)
      : ['- context_addition: no change']),
    ...(analysis.task_interface_adjustments.scope_adjustments.length > 0
      ? analysis.task_interface_adjustments.scope_adjustments.map((item) => `- scope_adjustment: ${item}`)
      : ['- scope_adjustment: no change']),
    ...(analysis.task_interface_adjustments.acceptance_criteria_adjustments.length > 0
      ? analysis.task_interface_adjustments.acceptance_criteria_adjustments.map((item) => `- acceptance_criteria_adjustment: ${item}`)
      : ['- acceptance_criteria_adjustment: no change']),
    ...(analysis.task_interface_adjustments.quality_gate_adjustments.length > 0
      ? analysis.task_interface_adjustments.quality_gate_adjustments.map((item) => `- quality_gate_adjustment: ${item}`)
      : ['- quality_gate_adjustment: no change']),
    '',
    '## Documentation Notes',
    ...(analysis.notes_for_documentation.length > 0
      ? analysis.notes_for_documentation.map((item) => `- ${item}`)
      : ['- None.']),
    '',
    '## Review Findings Snapshot',
    ...(review.findings.length > 0
      ? review.findings.map((item) => `- [${item.severity}] ${item.message}`)
      : ['- No structured findings recorded.']),
    '',
    '## Implementation Diagnostics Snapshot',
    `- classification: ${implementation.diagnostics.classification}`,
    `- first_executable_step_status: ${implementation.diagnostics.first_executable_step_status}`,
    `- minimum_progress_evidence_status: ${implementation.diagnostics.minimum_progress_evidence_status}`,
    '',
    '## Quality Gates Snapshot',
    ...(qualityResults.length > 0
      ? qualityResults.map((item) => `- ${item.command}: ${item.status}`)
      : ['- No quality gates recorded.']),
    '',
    '## Current Task Baseline',
    `- first_executable_step: ${task.firstExecutableStep}`,
    ...task.minimumProgressEvidence.map((item) => `- minimum_progress_evidence: ${item}`),
    '',
  ].join('\n');
}

function parseTaskDocument(taskPath: string, markdown: string): ParsedTaskDocument {
  const taskId = stripTicks(requireSection(markdown, 'Task ID').trim());
  const featureId = stripTicks(requireSection(markdown, 'Parent Feature').trim());
  const titleMatch = markdown.match(/^#\s+Task\s+.+?:\s+(.+)$/m);
  const title = titleMatch?.[1]?.trim() ?? taskId;
  const objective = requireSection(markdown, 'Goal').trim();
  const firstExecutableStep = optionalSection(markdown, 'First Executable Step')?.trim()
    ?? firstExpectedChange(markdown)
    ?? `Inspect \`${taskPath}\` and start the smallest change inside the allowed scope.`;
  const minimumProgressEvidence = parseBulletSection(optionalSection(markdown, 'Minimum Progress Evidence'))
    ?? ['At least one allowed file changes in the working tree.'];
  const scope = requireSection(markdown, 'Scope');
  const allowedPaths = parseLabeledBulletList(scope, 'Allowed');
  const forbiddenPaths = parseLabeledBulletList(scope, 'Forbidden');
  const constraints = parseBulletSection(optionalSection(markdown, 'Constraints')) ?? [];
  const acceptanceCriteria = parseBulletSection(optionalSection(markdown, 'Acceptance Criteria')) ?? [];
  const qualityGates = parseCodeBlock(optionalSection(markdown, 'Quality Gates to Run')) ?? [];
  const likelyAffectedFiles = parseBulletSection(optionalSection(markdown, 'Files Likely Affected'))?.map(stripTicks) ?? allowedPaths;
  const developmentPolicy = stripTicks(parseBulletSection(optionalSection(markdown, 'Development Policy'))?.[0] ?? 'implementation_first') as DevelopmentPolicyMode;

  return {
    taskId,
    featureId,
    title,
    objective,
    firstExecutableStep,
    minimumProgressEvidence,
    allowedPaths: allowedPaths.map(stripTicks),
    forbiddenPaths: forbiddenPaths.map(stripTicks),
    constraints,
    acceptanceCriteria,
    qualityGates,
    developmentPolicy,
    likelyAffectedFiles,
    path: taskPath,
  };
}

function replaceOperationalStatus(markdown: string, overrides: Partial<Record<string, string>>): string {
  const section = requireSection(markdown, 'Operational Status');
  const values = parseStatusMap(section);
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      values[key] = value;
    }
  }

  return replaceSection(markdown, 'Operational Status', Object.entries(values).map(([key, value]) => `- ${key}: ${value}`).join('\n'));
}

function parseStatusMap(sectionBody: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of sectionBody.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('- ')) {
      continue;
    }

    const separator = line.indexOf(':');
    if (separator === -1) {
      continue;
    }

    const key = line.slice(2, separator).trim();
    const value = line.slice(separator + 1).trim();
    values[key] = value;
  }

  return values;
}

function replaceSection(markdown: string, heading: string, newBody: string): string {
  const pattern = new RegExp(`(^## ${escapeRegExp(heading)}\\n\\n)([\\s\\S]*?)(?=\\n## |$)`, 'm');
  if (!pattern.test(markdown)) {
    throw new Error(`Section "## ${heading}" was not found.`);
  }

  return markdown.replace(pattern, `$1${ensureTrailingNewline(newBody).trimEnd()}\n`);
}

function setOrInsertSection(markdown: string, heading: string, newBody: string): string {
  const pattern = new RegExp(`(^## ${escapeRegExp(heading)}\\n\\n)([\\s\\S]*?)(?=\\n## |$)`, 'm');
  if (pattern.test(markdown)) {
    return markdown.replace(pattern, `$1${ensureTrailingNewline(newBody).trimEnd()}\n`);
  }

  const statusPattern = /(^## Status\n\n[\s\S]*?)(?=\n## |$)/m;
  if (!statusPattern.test(markdown)) {
    throw new Error(`Unable to insert section "## ${heading}" because "## Status" was not found.`);
  }

  return markdown.replace(statusPattern, `$1\n\n## ${heading}\n\n${ensureTrailingNewline(newBody).trimEnd()}`);
}

function upsertBulletInSection(markdown: string, heading: string, startsWith: string, bullet: string): string {
  const existingBody = requireSection(markdown, heading);
  const lines = existingBody
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  const index = lines.findIndex((line) => line.startsWith(startsWith));
  if (index === -1) {
    lines.push(bullet);
  } else {
    lines[index] = bullet;
  }

  return replaceSection(markdown, heading, lines.join('\n'));
}

function upsertParagraphInSection(markdown: string, heading: string, contains: string, paragraph: string): string {
  const existingBody = requireSection(markdown, heading);
  const blocks = existingBody
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
  const index = blocks.findIndex((block) => block.includes(contains));
  if (index === -1) {
    blocks.push(paragraph);
  } else {
    blocks[index] = paragraph;
  }

  return replaceSection(markdown, heading, blocks.join('\n\n'));
}

function requireSection(markdown: string, heading: string): string {
  const body = optionalSection(markdown, heading);
  if (body === null) {
    throw new Error(`Section "## ${heading}" was not found.`);
  }

  return body;
}

function optionalSection(markdown: string, heading: string): string | null {
  const pattern = new RegExp(`^## ${escapeRegExp(heading)}\\n\\n([\\s\\S]*?)(?=\\n## |$)`, 'm');
  const match = markdown.match(pattern);
  return match?.[1]?.trimEnd() ?? null;
}

function parseBulletSection(section: string | null): string[] | null {
  if (!section) {
    return null;
  }

  const items = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());

  return items.length > 0 ? items : null;
}

function parseLabeledBulletList(section: string, label: string): string[] {
  const pattern = new RegExp(`${escapeRegExp(label)}:\\n([\\s\\S]*?)(?=\\n[A-Z][^\\n]*:|$)`, 'm');
  const match = section.match(pattern);
  if (!match) {
    return [];
  }

  const listBody = match[1] ?? '';
  return listBody
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());
}

function parseCodeBlock(section: string | null): string[] | null {
  if (!section) {
    return null;
  }

  const match = section.match(/```[a-z]*\n([\s\S]*?)```/);
  if (!match) {
    return null;
  }

  const block = match[1] ?? '';
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function firstExpectedChange(markdown: string): string | null {
  const section = optionalSection(markdown, 'Expected Changes');
  return parseBulletSection(section)?.[0] ?? null;
}

function buildTaskFileName(taskId: string, title: string): string {
  const number = humanTaskNumber(taskId).replace(/^Task\s+/i, '').trim();
  return `${number}-${slugify(title)}.md`;
}

function buildCorrectionTaskFileName(correctionTaskId: string, title: string): string {
  return `${humanCorrectionNumber(correctionTaskId).replace(/^Task\s+/i, '').trim()}-${slugify(title)}.md`;
}

function humanTaskNumber(taskId: string): string {
  const match = taskId.match(/-T(\d+)$/);
  const taskNumber = match?.[1];
  return taskNumber ? String(Number.parseInt(taskNumber, 10)).padStart(3, '0') : taskId;
}

function humanCorrectionNumber(correctionTaskId: string): string {
  const match = correctionTaskId.match(/-T(\d+)-C(\d+)$/);
  const taskNumber = match?.[1];
  const correctionNumber = match?.[2];
  if (!taskNumber || !correctionNumber) {
    return correctionTaskId;
  }

  return `${String(Number.parseInt(taskNumber, 10)).padStart(3, '0')}.${Number.parseInt(correctionNumber, 10)}`;
}

function bulletList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}

function stripTicks(text: string): string {
  return text.replace(/^`+|`+$/g, '');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compareFeatureIds(left: string, right: string): number {
  const leftNumber = Number.parseInt(left.split('-')[0] ?? '0', 10);
  const rightNumber = Number.parseInt(right.split('-')[0] ?? '0', 10);
  return leftNumber - rightNumber;
}

function logAgentStart(agent: 'codex' | 'opencode', label: string, command: string): void {
  console.log(`[${agent}:${label}] start ${command}`);
}

function logAgentStream(agent: 'codex' | 'opencode', label: string, stream: 'stdout' | 'stderr', text: string): void {
  const trimmed = text.trimEnd();
  if (trimmed.length === 0) {
    return;
  }

  const prefix = `[${agent}:${label}] ${stream} | `;
  const rendered = trimmed
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');

  if (stream === 'stderr') {
    process.stderr.write(`${rendered}\n`);
    return;
  }

  process.stdout.write(`${rendered}\n`);
}

function logAgentEnd(
  agent: 'codex' | 'opencode',
  label: string,
  elapsedMs: number,
  exitCode: number | null,
  errorMessage: string | null,
): void {
  const status = exitCode === 0 ? 'ok' : `exit ${exitCode ?? 'null'}`;
  const errorSuffix = errorMessage ? `, error: ${errorMessage}` : '';
  console.log(`[${agent}:${label}] done (${status}${errorSuffix}) in ${elapsedMs}ms`);
}

function summarizeCommandOutput(stdout: string, stderr: string): string {
  const combined = joinOutput(stdout, stderr).trim();
  if (combined.length === 0) {
    return 'No output.';
  }

  const lines = combined.split('\n');
  const clipped = lines.slice(-12).join('\n');
  return clipped.length > 1200 ? `${clipped.slice(0, 1200)}...` : clipped;
}

function joinOutput(stdout: string, stderr: string): string {
  return [stdout.trim(), stderr.trim()].filter((value) => value.length > 0).join('\n\n');
}

function summarizeText(text: string, limit: number): string {
  if (text.trim().length === 0) {
    return 'No output.';
  }

  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function parseGitPathList(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function readRecordString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function createRunId(): string {
  return `run-${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '--').replace('Z', '')}`;
}

function statSafeIsDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function writeText(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, ensureTrailingNewline(contents), 'utf8');
}

function requireString(value: string | null, field: string): string {
  if (!value) {
    throw new Error(`Missing required field ${field}.`);
  }

  return value;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}

const entryFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === entryFile) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
