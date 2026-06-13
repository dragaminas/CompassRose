import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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
  | 'correct_state'
  | 'unblock_task'
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

type ImplementerTool = 'codex' | 'opencode';

type ReviewerStatus = 'approved' | 'changes_required' | 'blocked' | 'failed';
type DiagnosticClassification =
  | 'context_overflow'
  | 'provider_failure'
  | 'permission_prompt'
  | 'tool_refusal'
  | 'model_passivity'
  | 'ui_cli_behavior'
  | 'unknown';

type BlockerKind =
  | 'state_corruption'
  | 'task_interface_gap'
  | 'cli_mismatch'
  | 'environment'
  | 'implementation_failure'
  | 'review_failure'
  | 'unknown';

type BlockerRecoverability = 'auto' | 'agent' | 'human' | 'terminal';

class ControlledStopError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
    readonly signal: string | null,
  ) {
    super(message);
    this.name = 'ControlledStopError';
  }
}

function stopExitCodeForSignal(signal: string | null): number {
  return signal === 'SIGTERM' ? 143 : 130;
}

interface CommandExecution {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly commandInvoked: string;
}

interface TaskImplementer {
  run(prompt: string, label?: string): CommandExecution;
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

interface ImplementationAttemptHistory {
  readonly task_id: string;
  readonly retried_after_partial_changes: boolean;
  readonly attempts: readonly ImplementationAttempt[];
  readonly final_attempt: ImplementationAttempt;
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

interface StateCorrectionTask {
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
  readonly state_target: {
    readonly feature_state_path: string;
    readonly project_state_path: string | null;
    readonly contract_reference: string;
    readonly detected_issue: string;
    readonly restored_lifecycle_state: string;
    readonly restored_active_task: string;
    readonly restored_active_correction_task: string;
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
  readonly expected_deliverables: readonly ('documentation')[];
}

interface RestorationTarget {
  readonly lifecycle_state: string;
  readonly active_task: string;
  readonly active_correction_task: string;
  readonly active_unblock_task: string;
}

interface BlockerProfile {
  readonly kind: BlockerKind;
  readonly signature: string;
  readonly evidence: readonly string[];
  readonly recoverability: BlockerRecoverability;
  readonly observed_state: string;
}

interface UnblockTaskMetadata {
  readonly blocker: BlockerProfile;
  readonly restoration_target: RestorationTarget;
}

interface StoredTaskArtifact {
  readonly task: PlannedTask;
  readonly state_correction?: StateCorrectionTask;
  readonly unblock?: UnblockTaskMetadata;
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

interface RecoveryLesson {
  readonly run_id: string;
  readonly created_at: string;
  readonly feature_id: string;
  readonly task_id: string;
  readonly correction_task_id: string | null;
  readonly review_status: ReviewerStatus;
  readonly summary: string;
  readonly review_findings: readonly string[];
  readonly quality_gate_failures: readonly string[];
  readonly recommended_action: TaskInterfaceAnalysis['recommended_action'];
  readonly perfectible: boolean;
  readonly scope_isolation_notes: readonly string[];
  readonly implementer_limitations: readonly string[];
  readonly task_interface_adjustments: TaskInterfaceAnalysis['task_interface_adjustments'];
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

interface FeatureStateSnapshot {
  readonly lifecycleState: string;
  readonly activeTask: string;
  readonly activeCorrectionTask: string;
  readonly activeUnblockTask: string;
  readonly blockedBy: readonly string[];
  readonly blockedFrom: RestorationTarget | null;
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
  readonly implementer: ImplementerTool;
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

  ensureCleanWorktree(allowedDirtyPrefixes: readonly string[] = []): void {
    const dirtyPaths = this.dirtyPaths();
    const disallowedPaths = dirtyPaths.filter((path) => !isPathAllowedByPrefix(path, allowedDirtyPrefixes));
    if (disallowedPaths.length > 0) {
      throw new Error(
        `Prototype run requires a clean worktree before mutating steps. Disallowed dirty paths: ${disallowedPaths.join(', ')}.`,
      );
    }
  }

  dirtyPaths(): string[] {
    return parseGitStatusPaths(this.execGit(['status', '--porcelain']));
  }

  diffNameOnly(excludedPaths: readonly string[] = []): string[] {
    const pathspecArgs = this.buildPathspecArgs(excludedPaths);
    return uniqueStrings([
      ...parseGitPathList(this.execGit(['diff', '--name-only', ...pathspecArgs])),
      ...parseGitPathList(this.execGit(['diff', '--cached', '--name-only', ...pathspecArgs])),
      ...parseGitPathList(this.execGit(['ls-files', '--others', '--exclude-standard', ...pathspecArgs])),
    ]);
  }

  diffPatch(excludedPaths: readonly string[] = []): string {
    const pathspecArgs = this.buildPathspecArgs(excludedPaths);
    const patches = [
      this.execGit(['diff', '--patch', '--no-ext-diff', ...pathspecArgs]).trim(),
      this.execGit(['diff', '--cached', '--patch', '--no-ext-diff', ...pathspecArgs]).trim(),
      ...parseGitPathList(this.execGit(['ls-files', '--others', '--exclude-standard', ...pathspecArgs])).map((path) =>
        this.execGitAllowStatus(['diff', '--no-index', '--', '/dev/null', path], [0, 1]).trim(),
      ),
    ].filter((patch) => patch.length > 0);

    return patches.join('\n');
  }

  private buildPathspecArgs(excludedPaths: readonly string[]): string[] {
    if (excludedPaths.length === 0) {
      return [];
    }

    return ['.', ...excludedPaths.map((path) => `:(exclude)${path}`)];
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

    if (result.signal === 'SIGINT' || result.signal === 'SIGTERM') {
      throw new ControlledStopError(
        `Controlled stop requested while running git ${args.join(' ')}.`,
        stopExitCodeForSignal(result.signal),
        result.signal,
      );
    }

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

  listFiles(relativePath: string): readonly { name: string; fullPath: string; mtimeMs: number }[] {
    const targetDir = join(this.root, relativePath);
    try {
      return readdirSync(targetDir)
        .map((name) => {
          const fullPath = join(targetDir, name);
          const stat = statSync(fullPath);
          return {
            name,
            fullPath,
            mtimeMs: stat.mtimeMs,
          };
        })
        .filter((entry) => entry.fullPath.length > 0);
    } catch {
      return [];
    }
  }

  writeText(relativePath: string, value: string): string {
    const targetPath = join(this.root, relativePath);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, normalizeTextForWrite(value), 'utf8');
    return targetPath;
  }
}

class CodexCli implements TaskImplementer {
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

    if (result.signal === 'SIGINT' || result.signal === 'SIGTERM') {
      throw new ControlledStopError(
        `Controlled stop requested while running codex exec for ${label}.`,
        stopExitCodeForSignal(result.signal),
        result.signal,
      );
    }

    if (result.status !== 0) {
      throw new Error(`codex exec failed:\n${result.stderr || result.stdout}`);
    }

    return JSON.parse(readFileSync(outputPath, 'utf8')) as T;
  }

  run(prompt: string, label = 'implementer'): CommandExecution {
    const args = [
      'exec',
      '--ephemeral',
      '--cd',
      this.repositoryRoot,
      '--dangerously-bypass-approvals-and-sandbox',
    ];

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
      maxBuffer: 20 * 1024 * 1024,
    });
    const elapsedMs = Date.now() - startedAt;

    const stdout = result.stdout ?? '';
    const errorText = result.error ? `\n${result.error.message}` : '';
    const stderr = `${result.stderr ?? ''}${errorText}`;
    logAgentStream('codex', label, 'stdout', stdout);
    logAgentStream('codex', label, 'stderr', stderr);
    logAgentEnd('codex', label, elapsedMs, result.status, result.error?.message ?? null);

    if (result.signal === 'SIGINT' || result.signal === 'SIGTERM') {
      throw new ControlledStopError(
        `Controlled stop requested while running codex exec for ${label}.`,
        stopExitCodeForSignal(result.signal),
        result.signal,
      );
    }

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

    if (result.signal === 'SIGINT' || result.signal === 'SIGTERM') {
      throw new ControlledStopError(
        `Controlled stop requested while running opencode for ${label}.`,
        stopExitCodeForSignal(result.signal),
        result.signal,
      );
    }

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
  private readonly implementer: TaskImplementer;
  private readonly skipCleanWorktreeCheck: boolean;
  private readonly configurationPath: string;
  private readonly projectStatePath: string;
  private readonly featuresRoot: string;
  private readonly runId: string;
  private readonly startedAt: string;
  private readonly stepRecords: StepRunRecord[] = [];
  private stopRequested = false;
  private stopReason: string | null = null;
  private stopExitCode = 130;
  private stopSignal: string | null = null;

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
    this.implementer = options.implementer === 'codex' ? this.codex : this.opencode;
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
    const cleanupStopHandlers = this.installControlledStopHandlers();
    let keepRunning = true;
    let lastDecision: StepDecision | null = null;

    try {
      while (keepRunning) {
        this.throwIfControlledStopRequested();
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

        if (this.stopRequested) {
          this.throwIfControlledStopRequested();
        }

        if (result.exitCode !== 0) {
          this.writeRefinementFeedback(result.summary, lastDecision);
          this.writeRunSummary('stopped', result.exitCode, null);
          return result.exitCode;
        }

        if (!this.options.loop || !result.continueLoop) {
          keepRunning = false;
        }
      }

      this.throwIfControlledStopRequested();
      this.writeRunSummary('completed', 0, null);
      return 0;
    } catch (error) {
      if (error instanceof ControlledStopError) {
        if (!this.stopRequested) {
          console.error(error.message);
        }
        this.writeRunSummary('stopped', error.exitCode, null);
        return error.exitCode;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.writeRefinementFeedback(message, lastDecision);
      this.writeRunSummary('failed', 1, message);
      throw error;
    } finally {
      cleanupStopHandlers();
    }
  }

  private installControlledStopHandlers(): () => void {
    const onSignal = (signal: NodeJS.Signals): void => {
      this.requestControlledStop(
        `Controlled stop requested via ${signal}; stopping after the current safe checkpoint.`,
        stopExitCodeForSignal(signal),
        signal,
      );
    };

    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);

    return () => {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
    };
  }

  private requestControlledStop(reason: string, exitCode: number, signal: string | null): void {
    if (this.stopRequested) {
      return;
    }

    this.stopRequested = true;
    this.stopReason = reason;
    this.stopExitCode = exitCode;
    this.stopSignal = signal;
    console.error(reason);
  }

  private throwIfControlledStopRequested(): void {
    if (!this.stopRequested) {
      return;
    }

    throw new ControlledStopError(
      this.stopReason ?? 'Controlled stop requested.',
      this.stopExitCode,
      this.stopSignal,
    );
  }

  private determineNextStep(): StepDecision {
    const deterministicRecovery = this.selectDeterministicRecoveryStep();
    if (deterministicRecovery) {
      return deterministicRecovery;
    }

    const prompt = [
      'Act as the CompassRose deterministic step selector.',
      '',
      'Read only these repository sources:',
      '- `docs/compassrose/PROJECT_STATE.md`',
      '- `docs/compassrose/CONFIG.md`',
      '- `src/contracts/runtime/operation-loop.md`',
      '- `src/contracts/state/feature-state.md`',
      '- `src/contracts/task/state-correction-task.md`',
      '- `docs/features/README.md`',
      '- the feature folders under `docs/features/` as needed',
      '',
      'Choose the next executable step for one prototype run.',
      '',
      'Rules:',
      '- Return `plan_feature` when the selected feature still has only `request.md` and must be formalized.',
      '- Return `plan_task` when the selected feature is ready for exactly one next task to be planned.',
      '- Return `correct_state` when the selected feature state is malformed but repairable by a bounded state correction task.',
      '- Return `unblock_task` when the selected feature is blocked for a recoverable reason and a bounded unblock task can restore progress.',
      '- Return `implement_task` when the selected feature has `task_ready`, `unblock_pending`, or `implementation_running` and the corresponding active task or unblock task is ready to execute.',
      '- Return `review_task` when the selected feature is waiting for review.',
      '- Return `correct_task` when the selected feature has an active correction task ready to execute.',
      '- Return `blocked` when the selected feature is blocked for an unrecoverable reason or a failed state prevents progress.',
      '- Return `stop` when there is no non-completed feature left to implement.',
      '- Respect numeric feature order and do not skip an earlier non-completed feature.',
      '',
      'Return JSON only.',
    ].join('\n');

    return this.codex.runStructured<StepDecision>(prompt, STEP_SCHEMA, [], 'step-selector');
  }

  private selectDeterministicRecoveryStep(): StepDecision | null {
    for (const feature of this.listFeatures()) {
      if (!existsSync(feature.statePath)) {
        return null;
      }

      let snapshot: FeatureStateSnapshot;
      try {
        snapshot = this.readFeatureStateSnapshot(feature);
      } catch {
        return null;
      }

      if (snapshot.lifecycleState === 'completed') {
        continue;
      }

      if (snapshot.lifecycleState !== 'implementation_failed') {
        return null;
      }

      const activeTask = this.resolveImplementationFailureActiveTask(feature, snapshot);
      if (!activeTask) {
        const decision: StepDecision = {
          kind: 'correct_state',
          feature_id: feature.id,
          task_id: null,
          correction_task_id: null,
          reason: `Feature ${feature.id} is in implementation_failed but no active task anchor could be recovered, so the runtime must repair the state before resuming.`,
        };
        this.writeRefinementFeedback(decision.reason, decision);
        return decision;
      }

      const decision: StepDecision = {
        kind: 'unblock_task',
        feature_id: feature.id,
        task_id: null,
        correction_task_id: null,
        reason: `Feature ${feature.id} is in implementation_failed; plan a bounded recovery unblock task that restores task readiness for ${activeTask}.`,
      };
      this.writeRefinementFeedback(decision.reason, decision);
      return decision;
    }

    return null;
  }

  private executeStep(decision: StepDecision): StepExecutionResult {
    switch (decision.kind) {
      case 'plan_feature':
        this.planFeature(requireString(decision.feature_id, 'feature_id'));
        return { exitCode: 0, continueLoop: true, summary: `Feature ${requireString(decision.feature_id, 'feature_id')} formalized.` };
      case 'plan_task':
        this.planTask(requireString(decision.feature_id, 'feature_id'));
        return { exitCode: 0, continueLoop: true, summary: `Next task planned for feature ${requireString(decision.feature_id, 'feature_id')}.` };
      case 'correct_state':
        this.correctState(requireString(decision.feature_id, 'feature_id'), decision.reason);
        return { exitCode: 0, continueLoop: true, summary: `State correction task created for feature ${requireString(decision.feature_id, 'feature_id')}.` };
      case 'unblock_task':
        this.planUnblockTask(requireString(decision.feature_id, 'feature_id'), decision.reason);
        return { exitCode: 0, continueLoop: true, summary: `Unblock task planned for feature ${requireString(decision.feature_id, 'feature_id')}.` };
      case 'implement_task':
        return this.implementTask(requireString(decision.task_id, 'task_id'));
      case 'correct_task':
        return this.correctTask(requireString(decision.correction_task_id, 'correction_task_id'));
      case 'review_task':
        return this.reviewTask(requireString(decision.task_id, 'task_id'));
      case 'blocked':
        console.error(`Blocked: ${decision.reason}`);
        this.recordBlockedFeature(requireString(decision.feature_id, 'feature_id'), decision.reason);
        return { exitCode: 2, continueLoop: false, summary: decision.reason };
      case 'stop':
        console.log('No selectable feature remains.');
        return { exitCode: 0, continueLoop: false, summary: 'No selectable feature remains.' };
      default:
        return assertNever(decision.kind);
    }
  }

  private ensureCleanWorktreeIfRequired(featureId: string): void {
    if (this.skipCleanWorktreeCheck) {
      return;
    }

    this.git.ensureCleanWorktree([
      'docs/compassrose/PROJECT_STATE.md',
      `docs/features/${featureId}/`,
    ]);
  }

  private planFeature(featureId: string): void {
    this.ensureCleanWorktreeIfRequired(featureId);
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
    this.ensureCleanWorktreeIfRequired(featureId);
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
      ...this.buildRecoveryLessonPromptLines(featureId),
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

  private planUnblockTask(featureId: string, reason: string): void {
    const feature = this.loadFeature(featureId);
    const snapshot = this.readFeatureStateSnapshot(feature);
    const recoveryActiveTask = snapshot.lifecycleState === 'implementation_failed'
      ? this.resolveImplementationFailureActiveTask(feature, snapshot)
      : null;
    const blocker = this.buildBlockerProfile(snapshot, reason);
    const restorationTarget = snapshot.lifecycleState === 'implementation_failed'
      ? this.buildImplementationFailureRestorationTarget(feature, snapshot)
      : snapshot.blockedFrom ?? {
          lifecycle_state: snapshot.lifecycleState,
          active_task: snapshot.activeTask,
          active_correction_task: snapshot.activeCorrectionTask,
          active_unblock_task: snapshot.activeUnblockTask,
        };
    const prompt = [
      'Act as the CompassRose Planner.',
      '',
      `Plan the next unblock task for feature \`${featureId}\`.`,
      '',
      'Read only:',
      '- `src/contracts/planner/unblock-task-planning-prompt.md`',
      '- `src/contracts/planner/input.md`',
      '- `src/contracts/planner/output.md`',
      '- `src/contracts/state/feature-state.md`',
      '- `src/contracts/task/unblock-task.md`',
      '- `src/contracts/task/state-correction-task.md`',
      `- \`${relativePath(this.repositoryRoot, feature.featurePath)}\``,
      `- \`${relativePath(this.repositoryRoot, feature.architecturePath)}\``,
      `- \`${relativePath(this.repositoryRoot, feature.statePath)}\``,
      ...(recoveryActiveTask ? [`- \`.git/proto-compassrose/implementation-attempts/${recoveryActiveTask}.json\``] : []),
      '- `docs/compassrose/PROJECT_STATE.md`',
      '- `docs/compassrose/CONFIG.md`',
      '- `src/contracts/runtime/operation-loop.md`',
      ...this.buildRecoveryLessonPromptLines(featureId),
      '',
      'Blocker context:',
      `- kind: ${blocker.kind}`,
      `- signature: ${blocker.signature}`,
      `- recoverability: ${blocker.recoverability}`,
      `- observed_state: ${blocker.observed_state}`,
      ...blocker.evidence.map((item) => `- evidence: ${item}`),
      '',
      'Restoration target:',
      `- lifecycle_state: ${restorationTarget.lifecycle_state}`,
      `- active_task: ${restorationTarget.active_task}`,
      `- active_correction_task: ${restorationTarget.active_correction_task}`,
      `- active_unblock_task: ${restorationTarget.active_unblock_task}`,
      '',
      'Rules:',
      '- Generate exactly one unblock task.',
      '- Keep the task narrowly focused on removing the blocker or tightening the interface that caused it.',
      '- Restore the captured lifecycle state after approval.',
      '- Use `test_guided` for implementation tasks that produce code.',
      '- `quality_gates.before_review` must contain runnable shell commands, not prose.',
      '- Return JSON only and do not modify files.',
    ].join('\n');

    const planned = this.codex.runStructured<PlannerOutput>(prompt, PLANNER_OUTPUT_SCHEMA, [], `unblock-plan:${featureId}`);
    const task = planned.task;
    if (task.expected_deliverables.includes('code') && task.development_policy.mode !== 'test_guided') {
      throw new Error(`Planned unblock task ${task.task_id} must use \`test_guided\` when it delivers code.`);
    }

    const unblockMetadata: UnblockTaskMetadata = {
      blocker,
      restoration_target: {
        lifecycle_state: restorationTarget.lifecycle_state,
        active_task: restorationTarget.active_task,
        active_correction_task: restorationTarget.active_correction_task,
        active_unblock_task: 'none',
      },
    };

    const taskPath = join(feature.tasksDirectory, buildTaskFileName(task.task_id, task.title));
    const taskMarkdown = renderUnblockTaskMarkdown(task, unblockMetadata);

    writeText(taskPath, taskMarkdown);
    this.artifacts.writeJson(join('tasks', `${task.task_id}.json`), {
      ...planned,
      unblock: unblockMetadata,
    });
    this.writeBlockerProfile(featureId, task.task_id, blocker, unblockMetadata.restoration_target, reason);

    const updatedFeatureState = this.updateFeatureStateForUnblock(feature.statePath, task.task_id, restorationTarget);
    const updatedProjectState = this.updateProjectStateForUnblock(featureId, task.task_id, restorationTarget.lifecycle_state);
    writeText(feature.statePath, updatedFeatureState);
    writeText(this.projectStatePath, updatedProjectState);

    if (this.options.commit) {
      this.git.commit(
        [
          relativePath(this.repositoryRoot, taskPath),
          relativePath(this.repositoryRoot, feature.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
        ],
        `proto: unblock feature ${featureId}`,
      );
    }
  }

  private buildImplementationFailureRestorationTarget(feature: FeatureRecord, snapshot: FeatureStateSnapshot): RestorationTarget {
    const activeTask = this.resolveImplementationFailureActiveTask(feature, snapshot);
    if (!activeTask) {
      throw new Error(`Cannot build an implementation-failure recovery target for ${feature.id} because no active task anchor could be recovered.`);
    }

    return {
      lifecycle_state: 'task_ready',
      active_task: activeTask,
      active_correction_task: 'none',
      active_unblock_task: 'none',
    };
  }

  private implementTask(taskId: string): StepExecutionResult {
    const task = this.loadTask(taskId);
    const failed = this.executeImplementation(task, false, null);
    return failed
      ? {
          exitCode: 0,
          continueLoop: true,
          summary: `Implementation for ${taskId} failed; recovery unblock planning will continue.`,
        }
      : {
          exitCode: 0,
          continueLoop: true,
          summary: `Implementation completed for ${taskId}.`,
        };
  }

  private correctTask(correctionTaskId: string): StepExecutionResult {
    const task = this.loadTask(correctionTaskId);
    const artifact = this.loadTaskArtifact(correctionTaskId);
    const failed = this.executeImplementation(task, true, artifact?.state_correction ?? null);
    return failed
      ? {
          exitCode: 0,
          continueLoop: true,
          summary: `Correction implementation for ${correctionTaskId} failed; recovery unblock planning will continue.`,
        }
      : {
          exitCode: 0,
          continueLoop: true,
          summary: `Correction implementation completed for ${correctionTaskId}.`,
        };
  }

  private reviewTask(taskId: string): StepExecutionResult {
    const diff = this.git.diffPatch();
    if (diff.trim().length === 0) {
      throw new Error(`Review for ${taskId} cannot proceed because git diff is empty.`);
    }

    const task = this.loadTask(taskId);
    const artifact = this.loadTaskArtifact(taskId);
    const stateCorrection = artifact?.state_correction ?? null;
    const unblock = artifact?.unblock ?? null;
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
      stateCorrection ? '- `src/contracts/task/state-correction-task.md`' : '- `src/contracts/task/correction-task.md`',
      unblock ? '- `src/contracts/task/unblock-task.md`' : null,
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
      stateCorrection
        ? '- Validate the state target, restored lifecycle state, and active task pointer for the repaired state document.'
        : '- Validate the implementation against the task contract and acceptance criteria.',
      stateCorrection
        ? '- If status is `changes_required`, keep the correction task state-only and preserve the restored task pointer.'
        : '- For `test_guided` tasks, confirm that the diff includes meaningful test changes for the claimed behavior.',
      unblock ? '- If this is an unblock task, verify that the blocker signature is resolved and the feature can resume from the captured lifecycle state.' : null,
      '- Return JSON only.',
      '- If status is `changes_required`, include a correction task narrower than the original task.',
      '- Do not modify files.',
    ].join('\n');

    const review = this.codex.runStructured<ReviewerOutput>(prompt, REVIEWER_OUTPUT_SCHEMA, [tempDir], `review:${taskId}`);
    this.artifacts.writeJson(join('reviews', `${taskId}.json`), review);
    const taskInterfaceAnalysis = this.shouldAnalyzeTaskInterface(review)
      ? this.analyzeTaskInterface(task, feature, review, implementation, qualityResults, tempDir, stateCorrection, unblock)
      : null;

    if (taskInterfaceAnalysis && review.status !== 'approved') {
      this.recordRecoveryLesson(task, review, implementation, qualityResults, taskInterfaceAnalysis, review.correction_task?.correction_task_id ?? null);
    }

    if (review.status === 'approved') {
      const updatedFeatureState = stateCorrection
        ? this.updateFeatureStateAfterStateCorrection(feature.statePath, task, stateCorrection)
        : unblock
          ? this.updateFeatureStateAfterUnblock(feature.statePath, task, unblock)
          : this.updateFeatureStateAfterApprovedReview(feature.statePath, task);
      const updatedProjectState = stateCorrection
        ? this.updateProjectStateAfterStateCorrection(task.featureId, stateCorrection)
        : unblock
          ? this.updateProjectStateAfterUnblock(task.featureId, task.taskId, unblock.restoration_target)
          : this.updateProjectStateAfterApprovedReview(task.featureId, task.taskId);
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

      if (this.options.commit) {
        this.git.commit(
          [
            relativePath(this.repositoryRoot, correctionPath),
            relativePath(this.repositoryRoot, feature.statePath),
            relativePath(this.repositoryRoot, this.projectStatePath),
          ],
          `proto: request correction ${correction.correction_task_id}`,
        );
      }
      console.log(`Review requested correction task ${correction.correction_task_id} at ${relativePath(this.repositoryRoot, correctionPath)}.`);
      return {
        exitCode: 0,
        continueLoop: true,
        summary: taskInterfaceAnalysis
          ? `Review requested correction task ${correction.correction_task_id} for ${task.taskId}; task-interface analysis and a recovery lesson were recorded.`
          : `Review requested correction task ${correction.correction_task_id} for ${task.taskId}; a recovery lesson was recorded.`,
      };
    }

    if (review.status === 'blocked') {
      const blocker = this.recordBlockedReview(task, review, implementation, qualityResults);
      const continueLoop = blocker.recoverability === 'agent' || blocker.recoverability === 'auto';
      const blockedSummary = continueLoop
        ? `Recoverable blocker ${blocker.signature} recorded; the loop can continue to unblock planning.`
        : `Terminal blocker ${blocker.signature} recorded; the run will stop.`;

      if (this.options.commit) {
        this.git.commit(
          [
            relativePath(this.repositoryRoot, feature.statePath),
            relativePath(this.repositoryRoot, this.projectStatePath),
          ],
          `proto: record blocked review for ${task.taskId}`,
        );
      }

      if (continueLoop) {
        console.log(blockedSummary);
      } else {
        console.error(blockedSummary);
      }

      return {
        exitCode: continueLoop ? 0 : 2,
        continueLoop,
        summary: taskInterfaceAnalysis
          ? `${review.summary} ${blockedSummary} Task-interface analysis and a recovery lesson were recorded.`
          : `${review.summary} ${blockedSummary}`,
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
    stateCorrection: StateCorrectionTask | null,
    unblock: UnblockTaskMetadata | null,
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
      ...(stateCorrection ? ['- `src/contracts/task/state-correction-task.md`'] : []),
      ...(unblock ? ['- `src/contracts/task/unblock-task.md`'] : []),
      ...(unblock ? ['- `src/contracts/planner/unblock-task-planning-prompt.md`'] : []),
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
      stateCorrection
        ? '- If this is a state repair task, focus on `state_target`, restored lifecycle fields, and scope around canonicalizing state.'
        : unblock
          ? '- If this is an unblock task, focus on the blocker signature, restoration target, and whether the blocker should become a tighter task interface or a documented limitation.'
        : '- If this is a code task, focus on the minimal fields that improve code implementation behavior.',
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

  private executeImplementation(task: ParsedTaskDocument, correction: boolean, stateCorrection: StateCorrectionTask | null): boolean {
    const recoveryLessonLines = this.buildRecoveryLessonPromptLines(task.featureId);
    const prompt = buildImplementerPrompt(task, correction, stateCorrection, recoveryLessonLines);
    const feature = this.loadFeature(task.featureId);
    const implementationStatePaths = [
      relativePath(this.repositoryRoot, feature.statePath),
      relativePath(this.repositoryRoot, this.projectStatePath),
    ];
    writeText(feature.statePath, this.updateFeatureStateDuringImplementation(feature.statePath, task.taskId));
    writeText(this.projectStatePath, this.updateProjectStateDuringImplementation(task.featureId, task.taskId));

    const attempts: ImplementationAttempt[] = [];
    let retriedAfterPartialChanges = false;
    let finalAttempt: ImplementationAttempt | null = null;
    const baseLabel = correction ? `correction:${task.taskId}` : `implement:${task.taskId}`;

    for (let attemptIndex = 1; attemptIndex <= 2; attemptIndex += 1) {
      if (attemptIndex === 2) {
        console.log(`Implementation for ${task.taskId} left partial repository changes; retrying once from the current worktree.`);
      }

      const commandResult = this.implementer.run(prompt, `${baseLabel}:attempt-${attemptIndex}`);
      this.throwIfControlledStopRequested();
      const attempt = this.captureImplementationAttempt(task, commandResult, implementationStatePaths);
      attempts.push(attempt);
      this.persistImplementationAttemptArtifacts(task.taskId, attemptIndex, attempt);

      if (attempt.status === 'success') {
        finalAttempt = attempt;
        break;
      }

      const hasPartialRepositoryChanges = attempt.git_diff.trim().length > 0;
      if (attemptIndex === 1 && hasPartialRepositoryChanges) {
        retriedAfterPartialChanges = true;
        continue;
      }

      finalAttempt = attempt;
      break;
    }

    if (!finalAttempt) {
      throw new Error(`Implementation for ${task.taskId} did not produce a final attempt.`);
    }

    this.artifacts.writeJson(join('implementations', `${task.taskId}.json`), finalAttempt);
    this.artifacts.writeJson(join('implementation-attempts', `${task.taskId}.json`), {
      task_id: task.taskId,
      retried_after_partial_changes: retriedAfterPartialChanges,
      attempts,
      final_attempt: finalAttempt,
    } satisfies ImplementationAttemptHistory);
    this.artifacts.writeText(join('raw-output', `${task.taskId}.log`), ensureTrailingNewline(finalAttempt.raw_output || 'No output.\n'));

    if (finalAttempt.git_diff.trim().length > 0) {
      this.artifacts.writeText(join('diffs', `${task.taskId}.patch`), finalAttempt.git_diff);
    }

    if (finalAttempt.status !== 'success') {
      const failureReason = finalAttempt.error ?? `Implementation for ${task.taskId} failed (${finalAttempt.diagnostics.classification}).`;
      writeText(feature.statePath, this.updateFeatureStateAfterImplementationFailure(feature.statePath, task.taskId, failureReason));
      writeText(this.projectStatePath, this.updateProjectStateAfterImplementationFailure(task.featureId, task.taskId, failureReason));
      this.writeRefinementFeedback(failureReason, {
        kind: correction ? 'correct_task' : 'implement_task',
        feature_id: task.featureId,
        task_id: task.taskId,
        correction_task_id: correction ? task.taskId : null,
        reason: failureReason,
      });
      console.error(`Implementation for ${task.taskId} failed; recovery will continue through unblock planning.`);
      return true;
    }

    const qualityResults = this.runQualityGates(task);
    this.throwIfControlledStopRequested();
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

    return false;
  }

  private persistImplementationAttemptArtifacts(
    taskId: string,
    attemptIndex: number,
    attempt: ImplementationAttempt,
  ): void {
    this.artifacts.writeJson(join('implementation-attempts', `${taskId}.attempt-${attemptIndex}.json`), attempt);
    this.artifacts.writeText(join('raw-output', `${taskId}.attempt-${attemptIndex}.log`), ensureTrailingNewline(attempt.raw_output || 'No output.\n'));

    if (attempt.git_diff.trim().length > 0) {
      this.artifacts.writeText(join('diffs', `${taskId}.attempt-${attemptIndex}.patch`), attempt.git_diff);
    }
  }

  private captureImplementationAttempt(
    task: ParsedTaskDocument,
    commandResult: CommandExecution,
    excludedPaths: readonly string[] = [],
  ): ImplementationAttempt {
    const changedFiles = this.git.diffNameOnly(excludedPaths);
    const diff = this.git.diffPatch(excludedPaths);
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

    const feature = this.loadFeature(task.featureId);
    const diff = this.git.diffPatch([
      relativePath(this.repositoryRoot, feature.statePath),
      relativePath(this.repositoryRoot, this.projectStatePath),
    ]);
    return {
      status: diff.trim().length > 0 ? 'success' : 'failed',
      changed_files: this.git.diffNameOnly([
        relativePath(this.repositoryRoot, feature.statePath),
        relativePath(this.repositoryRoot, this.projectStatePath),
      ]),
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

      if (result.signal === 'SIGINT' || result.signal === 'SIGTERM') {
        throw new ControlledStopError(
          `Controlled stop requested while running quality gate ${command}.`,
          stopExitCodeForSignal(result.signal),
          result.signal,
        );
      }

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

  private correctState(featureId: string, reason: string): void {
    const feature = this.loadFeature(featureId);
    const markdown = readFileSync(feature.statePath, 'utf8');
    const lifecycleState = stripTicks(requireSection(markdown, 'Lifecycle State').trim());
    const operationalStatusSection = requireSection(markdown, 'Operational Status');
    const activeTask = stripTicks(parsePreferredStatusValue(operationalStatusSection, 'active_task') ?? 'none');
    const restoredActiveTask = activeTask !== 'none'
      ? activeTask
      : this.resolveStateCorrectionActiveTask(feature, markdown);

    if (activeTask === 'none') {
      console.error(
        `State correction fallback for ${featureId}: active_task is missing, so the prototype will use ${restoredActiveTask} as the repair anchor.`,
      );
    }

    const stateCorrection = this.buildStateCorrectionTask(feature, restoredActiveTask, lifecycleState, reason);
    const path = this.writeStateCorrectionTask(stateCorrection);
    this.artifacts.writeJson(join('tasks', `${stateCorrection.task_id}.json`), {
      task: stateCorrectionTaskToTask(stateCorrection),
      state_correction: stateCorrection,
    });

    const updatedFeatureState = this.updateFeatureStateForStateCorrection(
      feature.statePath,
      restoredActiveTask,
      stateCorrection.task_id,
    );
    const updatedProjectState = this.updateProjectStateForCorrection(featureId, stateCorrection.task_id);
    writeText(feature.statePath, updatedFeatureState);
    writeText(this.projectStatePath, updatedProjectState);

    if (this.options.commit) {
      this.git.commit(
        [
          relativePath(this.repositoryRoot, path),
          relativePath(this.repositoryRoot, feature.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
        ],
        `proto: repair state for ${featureId}`,
      );
    }
    console.error(`State correction task ${stateCorrection.task_id} created at ${relativePath(this.repositoryRoot, path)}.`);
  }

  private resolveStateCorrectionActiveTask(feature: FeatureRecord, featureStateMarkdown: string): string {
    const projectStateMarkdown = readFileSync(this.projectStatePath, 'utf8');
    const hintSources = [
      optionalSection(projectStateMarkdown, 'Pending'),
      optionalSection(projectStateMarkdown, 'Next Planning Hint'),
      optionalSection(projectStateMarkdown, 'Current Reality'),
      optionalSection(featureStateMarkdown, 'Current Reality'),
      optionalSection(featureStateMarkdown, 'Next Planning Hint'),
      optionalSection(featureStateMarkdown, 'Last Approved Change'),
    ];

    for (const source of hintSources) {
      const taskId = extractTaskIdHint(source);
      if (taskId) {
        return taskId;
      }
    }

    const artifactTaskId = this.resolveStateCorrectionActiveTaskFromArtifacts(feature.id);
    if (artifactTaskId) {
      return artifactTaskId;
    }

    throw new Error(
      `Cannot create a state correction task for ${feature.id} because no active task is recorded and no recoverable task hint could be derived from project state or recorded task artifacts.`,
    );
  }

  private resolveStateCorrectionActiveTaskFromArtifacts(featureId: string): string | null {
    const taskArtifactTaskId = this.findLatestTaskArtifactTaskId(featureId);
    if (taskArtifactTaskId) {
      return taskArtifactTaskId;
    }

    const implementationAttemptTaskId = this.findLatestImplementationAttemptTaskId(featureId);
    if (implementationAttemptTaskId) {
      return implementationAttemptTaskId;
    }

    return null;
  }

  private resolveImplementationFailureActiveTask(feature: FeatureRecord, snapshot: FeatureStateSnapshot): string | null {
    if (snapshot.activeTask !== 'none') {
      return snapshot.activeTask;
    }

    if (snapshot.blockedFrom?.active_task && snapshot.blockedFrom.active_task !== 'none') {
      return snapshot.blockedFrom.active_task;
    }

    return this.resolveStateCorrectionActiveTaskFromArtifacts(feature.id);
  }

  private findLatestTaskArtifactTaskId(featureId: string): string | null {
    const artifacts = [...this.artifacts.listFiles('tasks')].sort((left, right) => right.mtimeMs - left.mtimeMs);

    for (const artifact of artifacts) {
      if (!artifact.name.endsWith('.json')) {
        continue;
      }

      const stored = this.artifacts.readJson<StoredTaskArtifact>(join('tasks', artifact.name));
      const task = stored?.task;
      if (!task || task.feature_id !== featureId) {
        continue;
      }

      if (typeof task.task_id !== 'string' || task.task_id.trim().length === 0) {
        continue;
      }

      return task.task_id;
    }

    return null;
  }

  private findLatestImplementationAttemptTaskId(featureId: string): string | null {
    const artifacts = [...this.artifacts.listFiles('implementation-attempts')].sort((left, right) => right.mtimeMs - left.mtimeMs);

    for (const artifact of artifacts) {
      if (!artifact.name.endsWith('.json') || artifact.name.includes('.attempt-')) {
        continue;
      }

      const history = this.artifacts.readJson<ImplementationAttemptHistory>(join('implementation-attempts', artifact.name));
      const taskId = history?.task_id;
      if (typeof taskId !== 'string' || taskId.trim().length === 0) {
        continue;
      }

      const stored = this.artifacts.readJson<StoredTaskArtifact>(join('tasks', `${taskId}.json`));
      if (stored?.task?.feature_id !== featureId) {
        continue;
      }

      return taskId;
    }

    return null;
  }

  private buildStateCorrectionTask(
    feature: FeatureRecord,
    activeTaskId: string,
    lifecycleState: string,
    reason: string,
  ): StateCorrectionTask {
    const statePath = relativePath(this.repositoryRoot, feature.statePath);
    const projectStatePath = relativePath(this.repositoryRoot, this.projectStatePath);
    const taskId = buildStateCorrectionTaskId(feature.tasksDirectory, activeTaskId);
    const title = `Repair feature state for ${activeTaskId}`;
    const detectedIssue = reason.trim();

    return {
      task_id: taskId,
      feature_id: feature.id,
      title,
      objective: `Canonicalize ${statePath} so deterministic selection can continue with \`${activeTaskId}\`.`,
      first_executable_step: `Open \`${statePath}\` and remove the conflicting operational-status entries so one canonical block remains.`,
      minimum_progress_evidence: [
        `\`${statePath}\` contains a single canonical \`Operational Status\` block that matches \`${lifecycleState}\`.`,
        `\`${projectStatePath}\` still points at feature \`${feature.id}\` and the repaired active task \`${activeTaskId}\`.`,
      ],
      trace: {
        roadmap_objective: 'Deterministic Orchestration',
        feature_goal: 'Keep feature state canonical so the runtime selector can continue deterministically.',
        state_gap: detectedIssue,
      },
      state_target: {
        feature_state_path: statePath,
        project_state_path: projectStatePath,
        contract_reference: 'src/contracts/state/feature-state.md',
        detected_issue: detectedIssue,
        restored_lifecycle_state: lifecycleState,
        restored_active_task: activeTaskId,
        restored_active_correction_task: 'none',
      },
      context: {
        summary: detectedIssue,
        relevant_paths: [
          statePath,
          projectStatePath,
          'src/contracts/state/feature-state.md',
        ],
        relevant_modules: [
          'src/contracts/state/feature-state.md',
          'docs/compassrose/PROJECT_STATE.md',
        ],
      },
      scope: {
        allowed_paths: [
          statePath,
          projectStatePath,
        ],
        forbidden_paths: [
          'src/',
          'tests/',
          `docs/features/${feature.id}/feature.md`,
          `docs/features/${feature.id}/architecture.md`,
          'docs/compassrose/CONFIG.md',
        ],
      },
      constraints: [
        'Preserve the active task pointer for the repaired feature.',
        'Do not change implementation code or unrelated feature docs.',
        'Keep the correction narrowly focused on canonicalizing state.',
      ],
      development_policy: {
        mode: 'documentation_first',
      },
      quality_gates: {
        before_review: [
          'git diff --check',
          'npm run proto:smoke',
        ],
      },
      acceptance_criteria: [
        `\`${statePath}\` has a single canonical \`Operational Status\` block.`,
        `\`active_task\` remains \`${activeTaskId}\` and \`active_correction_task\` is \`none\`.`,
        `The feature returns to \`${lifecycleState}\` with the repaired state preserved.`,
        'The runtime can continue selecting the active task after the correction is approved.',
      ],
      expected_deliverables: ['documentation'] as const,
    };
  }

  private writeStateCorrectionTask(stateCorrection: StateCorrectionTask): string {
    const feature = this.loadFeature(stateCorrection.feature_id);
    const path = join(
      feature.tasksDirectory,
      buildCorrectionTaskFileName(stateCorrection.task_id, stateCorrection.title),
    );

    const markdown = renderStateCorrectionTaskMarkdown(stateCorrection);
    writeText(path, markdown);
    return path;
  }

  private readFeatureStateSnapshot(feature: FeatureRecord): FeatureStateSnapshot {
    const markdown = readFileSync(feature.statePath, 'utf8');
    const operationalStatus = requireSection(markdown, 'Operational Status');
    const blockedBySection = optionalSection(markdown, 'Blocked By');
    const blockedFromSection = optionalSection(markdown, 'Blocked From');
    const blockedFrom = blockedFromSection
      ? {
          lifecycle_state: stripTicks(parsePreferredStatusValue(blockedFromSection, 'lifecycle_state') ?? 'none'),
          active_task: stripTicks(parsePreferredStatusValue(blockedFromSection, 'active_task') ?? 'none'),
          active_correction_task: stripTicks(parsePreferredStatusValue(blockedFromSection, 'active_correction_task') ?? 'none'),
          active_unblock_task: stripTicks(parsePreferredStatusValue(blockedFromSection, 'active_unblock_task') ?? 'none'),
        }
      : null;

    return {
      lifecycleState: stripTicks(requireSection(markdown, 'Lifecycle State').trim()),
      activeTask: stripTicks(parsePreferredStatusValue(operationalStatus, 'active_task') ?? 'none'),
      activeCorrectionTask: stripTicks(parsePreferredStatusValue(operationalStatus, 'active_correction_task') ?? 'none'),
      activeUnblockTask: stripTicks(parsePreferredStatusValue(operationalStatus, 'active_unblock_task') ?? 'none'),
      blockedBy: parseBulletSection(blockedBySection) ?? [],
      blockedFrom,
    };
  }

  private buildBlockerProfile(snapshot: FeatureStateSnapshot, reason: string): BlockerProfile {
    const blockerKind = classifyBlockerKind(reason, snapshot.blockedBy, snapshot.lifecycleState);
    return {
      kind: blockerKind.kind,
      signature: blockerKind.signature,
      evidence: blockerKind.evidence,
      recoverability: blockerKind.recoverability,
      observed_state: `lifecycle=${snapshot.lifecycleState}; active_task=${snapshot.activeTask}; active_correction_task=${snapshot.activeCorrectionTask}; active_unblock_task=${snapshot.activeUnblockTask}`,
    };
  }

  private writeBlockerProfile(
    featureId: string,
    taskId: string,
    blocker: BlockerProfile,
    restorationTarget: RestorationTarget,
    reason: string,
  ): void {
    const profile = {
      run_id: this.runId,
      feature_id: featureId,
      task_id: taskId,
      reason,
      blocker,
      restoration_target: restorationTarget,
    };

    this.artifacts.writeJson(join('blockers', `${this.runId}-${taskId}.json`), profile);
    this.artifacts.writeText(join('blockers', `${this.runId}-${taskId}.md`), renderBlockerProfileMarkdown(profile));
  }

  private recordBlockedFeature(featureId: string, reason: string, taskId: string | null = null): BlockerProfile {
    const feature = this.loadFeature(featureId);
    const snapshot = this.readFeatureStateSnapshot(feature);
    const blocker = this.buildBlockerProfile(snapshot, reason);
    const restorationTarget = snapshot.blockedFrom ?? {
      lifecycle_state: snapshot.lifecycleState,
      active_task: snapshot.activeTask,
      active_correction_task: snapshot.activeCorrectionTask,
      active_unblock_task: snapshot.activeUnblockTask,
    };
    this.persistBlockedFeature(featureId, taskId ?? (snapshot.activeTask === 'none' ? null : snapshot.activeTask), reason, blocker, restorationTarget, feature);
    return blocker;
  }

  private recordBlockedReview(
    task: ParsedTaskDocument,
    review: ReviewerOutput,
    implementation: ImplementationAttempt,
    qualityResults: readonly QualityGateResult[],
  ): BlockerProfile {
    const feature = this.loadFeature(task.featureId);
    const snapshot = this.readFeatureStateSnapshot(feature);
    const blocker = this.buildReviewBlockerProfile(review, implementation, qualityResults, snapshot);
    const restorationTarget = snapshot.blockedFrom ?? {
      lifecycle_state: snapshot.lifecycleState,
      active_task: snapshot.activeTask,
      active_correction_task: snapshot.activeCorrectionTask,
      active_unblock_task: snapshot.activeUnblockTask,
    };
    const reason = this.buildReviewBlockerReason(review, implementation, qualityResults);

    this.persistBlockedFeature(task.featureId, task.taskId, reason, blocker, restorationTarget, feature);
    return blocker;
  }

  private persistBlockedFeature(
    featureId: string,
    taskId: string | null,
    reason: string,
    blocker: BlockerProfile,
    restorationTarget: RestorationTarget,
    feature: FeatureRecord,
  ): void {
    const blockedByLines = this.buildBlockedByLines(blocker, reason);
    const updatedFeatureState = this.updateFeatureStateForBlocked(
      feature.statePath,
      blocker,
      restorationTarget,
      blockedByLines,
      this.blockedNextPlanningHint(blocker, restorationTarget),
    );
    const updatedProjectState = this.updateProjectStateForBlocked(
      featureId,
      taskId,
      blocker,
      restorationTarget,
      this.blockedProjectPendingLines(blocker, restorationTarget, taskId),
      this.blockedNextPlanningHint(blocker, restorationTarget),
    );

    writeText(feature.statePath, updatedFeatureState);
    writeText(this.projectStatePath, updatedProjectState);

    const profile = {
      run_id: this.runId,
      feature_id: featureId,
      task_id: taskId,
      reason,
      blocker,
      restoration_target: restorationTarget,
    };

    const artifactKey = taskId ?? featureId;
    this.artifacts.writeJson(join('blockers', `${this.runId}-${artifactKey}-blocked.json`), profile);
    this.artifacts.writeText(join('blockers', `${this.runId}-${artifactKey}-blocked.md`), renderBlockerProfileMarkdown(profile));
  }

  private buildBlockedByLines(blocker: BlockerProfile, reason: string): string[] {
    const reasonSummary = reason
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join(' | ');

    return [
      `- kind: ${blocker.kind}`,
      `- signature: ${blocker.signature}`,
      `- recoverability: ${blocker.recoverability}`,
      `- observed_state: ${blocker.observed_state}`,
      ...blocker.evidence.map((item) => `- evidence: ${item}`),
      `- reason: ${reasonSummary || blocker.signature}`,
    ];
  }

  private buildReviewBlockerReason(
    review: ReviewerOutput,
    implementation: ImplementationAttempt,
    qualityResults: readonly QualityGateResult[],
  ): string {
    const findings = review.findings.map((finding) => finding.message);
    const failedGates = qualityResults
      .filter((result) => result.status === 'failed')
      .map((result) => `${result.name}: ${result.output_summary}`);

    return [
      review.summary,
      ...findings,
      implementation.error ? `implementation: ${implementation.error}` : null,
      implementation.diagnostics.classification !== 'unknown' ? `implementation_classification: ${implementation.diagnostics.classification}` : null,
      ...failedGates,
    ]
      .filter((item): item is string => Boolean(item && item.trim().length > 0))
      .join('\n');
  }

  private buildReviewBlockerProfile(
    review: ReviewerOutput,
    implementation: ImplementationAttempt,
    qualityResults: readonly QualityGateResult[],
    snapshot: FeatureStateSnapshot,
  ): BlockerProfile {
    const reason = this.buildReviewBlockerReason(review, implementation, qualityResults);
    return classifyBlockerKind(reason, [
      review.summary,
      ...review.findings.map((finding) => finding.message),
      implementation.error ?? '',
      implementation.diagnostics.classification,
      ...qualityResults.map((result) => `${result.name}: ${result.status}`),
    ].filter((item) => item.trim().length > 0), snapshot.lifecycleState);
  }

  private blockedNextPlanningHint(blocker: BlockerProfile, restorationTarget: RestorationTarget): string {
    if (blocker.recoverability === 'terminal') {
      return `The active feature is blocked by a terminal blocker (${blocker.signature}); stop and document the limitation.`;
    }

    if (blocker.recoverability === 'human') {
      return `The active feature is blocked by a blocker that requires human intervention (${blocker.signature}); stop and document the limitation.`;
    }

    return `Plan an unblock task for blocker \`${blocker.signature}\` and then restore \`${restorationTarget.lifecycle_state}\`.`;
  }

  private blockedProjectPendingLines(
    blocker: BlockerProfile,
    restorationTarget: RestorationTarget,
    taskId: string | null,
  ): string[] {
    if (blocker.recoverability === 'terminal' || blocker.recoverability === 'human') {
      return [
        `The active feature is blocked by \`${blocker.signature}\`.`,
        'Stop and document the limitation before resuming work.',
        'Continue updating this file with approved repository facts as feature work lands.',
      ];
    }

    return [
      'Plan an unblock task for the active feature.',
      `Restore the captured \`${restorationTarget.lifecycle_state}\` state after the blocker is resolved.`,
      'Continue updating this file with approved repository facts as feature work lands.',
    ];
  }

  private updateFeatureStateForBlocked(
    featureStatePath: string,
    blocker: BlockerProfile,
    restorationTarget: RestorationTarget,
    blockedByLines: readonly string[],
    nextPlanningHint: string,
  ): string {
    let markdown = readFileSync(featureStatePath, 'utf8');
    markdown = replaceSection(markdown, 'Lifecycle State', 'blocked');
    markdown = replaceOperationalStatus(markdown, {
      active_task: restorationTarget.active_task,
      active_correction_task: restorationTarget.active_correction_task,
      active_unblock_task: 'none',
      last_review_result: 'blocked',
      last_unblock_result: 'not_run',
    });
    markdown = replaceSection(markdown, 'Blocked By', bulletList(blockedByLines));
    markdown = replaceSection(markdown, 'Blocked From', [
      `- lifecycle_state: \`${restorationTarget.lifecycle_state}\``,
      `- active_task: \`${restorationTarget.active_task}\``,
      `- active_correction_task: \`${restorationTarget.active_correction_task}\``,
      `- active_unblock_task: \`${restorationTarget.active_unblock_task}\``,
      `- recoverability: ${blocker.recoverability}`,
    ].join('\n'));
    markdown = replaceSection(markdown, 'Next Planning Hint', nextPlanningHint);
    return markdown;
  }

  private updateProjectStateForBlocked(
    featureId: string,
    taskId: string | null,
    blocker: BlockerProfile,
    restorationTarget: RestorationTarget,
    pendingLines: readonly string[],
    nextPlanningHint: string,
  ): string {
    let markdown = readFileSync(this.projectStatePath, 'utf8');
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${featureId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList(pendingLines));
    markdown = replaceSection(markdown, 'Current Reality', [
      `- Feature \`${featureId}\` is blocked by \`${blocker.signature}\`.`,
      `- Blocker recoverability: ${blocker.recoverability}.`,
      `- Feature \`${featureId}\` was suspended from \`${restorationTarget.lifecycle_state}\`; the active task pointer remains \`${restorationTarget.active_task}\`.`,
      taskId ? `- Blocking task context: \`${taskId}\`` : '- Blocking task context: none',
    ].join('\n'));
    markdown = replaceSection(markdown, 'Next Planning Hint', nextPlanningHint);
    return markdown;
  }

  private loadTaskArtifact(taskId: string): StoredTaskArtifact | null {
    return this.artifacts.readJson<StoredTaskArtifact>(join('tasks', `${taskId}.json`));
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
    const stored = this.artifacts.readJson<StoredTaskArtifact>(join('tasks', `${taskId}.json`));
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

  private updateProjectStateAfterImplementationFailure(featureId: string, taskId: string, reason: string): string {
    let markdown = readFileSync(this.projectStatePath, 'utf8');
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${featureId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList([
      `Recover the failed implementation attempt for \`${taskId}\` before continuing.`,
      'Continue updating this file with approved repository facts as feature work lands.',
    ]));
    markdown = replaceSection(
      markdown,
      'Next Planning Hint',
      `The active feature is \`${featureId}\`, but implementation of \`${taskId}\` failed; plan a bounded recovery unblock task before continuing.`,
    );
    markdown = upsertBulletInSection(
      markdown,
      'Current Reality',
      `- Feature \`${featureId}\` is in implementation_failed for \`${taskId}\`.`,
      `- Implementation failure evidence: ${reason}`,
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
      active_unblock_task: 'none',
    });
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
      '- active_unblock_task: none',
    ].join('\n'));
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
      active_correction_task: 'none',
      active_unblock_task: 'none',
    });
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
      '- active_unblock_task: none',
    ].join('\n'));
    markdown = replaceSection(
      markdown,
      'Next Planning Hint',
      lifecycleState === 'review_pending'
        ? `Review \`${taskId}\` next.`
        : `Quality gates for \`${taskId}\` failed; stop and recover before continuing.`,
    );
    return markdown;
  }

  private updateFeatureStateDuringImplementation(featureStatePath: string, taskId: string): string {
    let markdown = readFileSync(featureStatePath, 'utf8');
    markdown = replaceSection(markdown, 'Lifecycle State', 'implementation_running');
    markdown = replaceOperationalStatus(markdown, {
      active_task: taskId,
      last_implementation_result: 'not_run',
      last_quality_gate_result: 'unknown',
      last_review_result: 'not_run',
      active_correction_task: 'none',
      active_unblock_task: 'none',
    });
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
      '- active_unblock_task: none',
    ].join('\n'));
    markdown = replaceSection(markdown, 'Next Planning Hint', `Recover or finish implementation of \`${taskId}\` before allowing review or new planning.`);
    return markdown;
  }

  private updateFeatureStateAfterImplementationFailure(featureStatePath: string, taskId: string, reason: string): string {
    let markdown = readFileSync(featureStatePath, 'utf8');
    markdown = replaceSection(markdown, 'Lifecycle State', 'implementation_failed');
    markdown = replaceOperationalStatus(markdown, {
      active_task: taskId,
      last_implementation_result: 'failed',
      last_quality_gate_result: 'unknown',
      last_review_result: 'not_run',
      active_correction_task: 'none',
      active_unblock_task: 'none',
    });
    markdown = replaceSection(markdown, 'Blocked By', bulletList([
      '- kind: implementation_failure',
      `- signature: implementation-failure-${taskId}`,
      '- recoverability: agent',
      `- observed_state: lifecycle=implementation_failed; active_task=${taskId}; active_correction_task=none; active_unblock_task=none`,
      `- evidence: ${reason}`,
    ]));
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: `task_ready`',
      `- active_task: \`${taskId}\``,
      '- active_correction_task: `none`',
      '- active_unblock_task: `none`',
      '- recoverability: agent',
    ].join('\n'));
    markdown = replaceSection(
      markdown,
      'Next Planning Hint',
      `Plan a bounded unblock task for the failed implementation of \`${taskId}\` and restore task readiness before continuing.`,
    );
    return markdown;
  }

  private updateProjectStateDuringImplementation(featureId: string, taskId: string): string {
    let markdown = readFileSync(this.projectStatePath, 'utf8');
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${featureId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList([
      `Recover or finish implementation for \`${taskId}\`.`,
      'Continue updating this file with approved repository facts as feature work lands.',
    ]));
    markdown = replaceSection(markdown, 'Next Planning Hint', `The active feature is \`${featureId}\`, and implementation of \`${taskId}\` is in progress.`);
    return markdown;
  }

  private updateFeatureStateAfterApprovedReview(featureStatePath: string, task: ParsedTaskDocument): string {
    let markdown = readFileSync(featureStatePath, 'utf8');
    markdown = replaceSection(markdown, 'Lifecycle State', 'formalized');
    markdown = replaceOperationalStatus(markdown, {
      active_task: 'none',
      active_correction_task: 'none',
      active_unblock_task: 'none',
      last_implementation_result: 'passed',
      last_quality_gate_result: 'passed',
      last_review_result: 'approved',
    });
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
      '- active_unblock_task: none',
    ].join('\n'));
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
      active_unblock_task: 'none',
      last_review_result: 'changes_required',
    });
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
      '- active_unblock_task: none',
    ].join('\n'));
    markdown = replaceSection(markdown, 'Next Planning Hint', `Execute correction task \`${correctionTaskId}\` next.`);
    return markdown;
  }

  private updateFeatureStateForStateCorrection(
    featureStatePath: string,
    taskId: string,
    correctionTaskId: string,
  ): string {
    let markdown = readFileSync(featureStatePath, 'utf8');
    markdown = replaceSection(markdown, 'Lifecycle State', 'correction_pending');
    markdown = replaceOperationalStatus(markdown, {
      active_task: taskId,
      active_correction_task: correctionTaskId,
      active_unblock_task: 'none',
    });
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
      '- active_unblock_task: none',
    ].join('\n'));
    markdown = replaceSection(markdown, 'Next Planning Hint', `Execute correction task \`${correctionTaskId}\` next.`);
    return markdown;
  }

  private updateFeatureStateForUnblock(
    featureStatePath: string,
    taskId: string,
    restorationTarget: RestorationTarget,
  ): string {
    let markdown = readFileSync(featureStatePath, 'utf8');
    markdown = replaceSection(markdown, 'Lifecycle State', 'unblock_pending');
    markdown = replaceOperationalStatus(markdown, {
      active_correction_task: 'none',
      active_unblock_task: taskId,
      last_review_result: 'blocked',
      last_unblock_result: 'not_run',
    });
    markdown = replaceSection(markdown, 'Blocked From', [
      `- lifecycle_state: \`${restorationTarget.lifecycle_state}\``,
      `- active_task: \`${restorationTarget.active_task}\``,
      `- active_correction_task: \`${restorationTarget.active_correction_task}\``,
      `- active_unblock_task: \`${restorationTarget.active_unblock_task}\``,
    ].join('\n'));
    markdown = replaceSection(markdown, 'Next Planning Hint', `Execute unblock task \`${taskId}\` next.`);
    return markdown;
  }

  private updateFeatureStateAfterStateCorrection(
    featureStatePath: string,
    task: ParsedTaskDocument,
    stateCorrection: StateCorrectionTask,
  ): string {
    let markdown = readFileSync(featureStatePath, 'utf8');
    markdown = replaceSection(markdown, 'Lifecycle State', stateCorrection.state_target.restored_lifecycle_state);
    markdown = replaceOperationalStatus(markdown, {
      active_task: stateCorrection.state_target.restored_active_task,
      active_correction_task: stateCorrection.state_target.restored_active_correction_task,
      active_unblock_task: 'none',
      last_implementation_result: 'passed',
      last_quality_gate_result: 'passed',
      last_review_result: 'approved',
    });
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
      '- active_unblock_task: none',
    ].join('\n'));
    markdown = replaceSection(markdown, 'Last Approved Change', `State correction task \`${task.taskId}\` was approved by the prototype orchestrator.`);
    markdown = replaceSection(markdown, 'Next Planning Hint', stateCorrectionNextPlanningHint(stateCorrection));
    return markdown;
  }

  private updateFeatureStateAfterUnblock(
    featureStatePath: string,
    task: ParsedTaskDocument,
    unblock: UnblockTaskMetadata,
  ): string {
    let markdown = readFileSync(featureStatePath, 'utf8');
    markdown = replaceSection(markdown, 'Lifecycle State', unblock.restoration_target.lifecycle_state);
    markdown = replaceOperationalStatus(markdown, {
      active_task: unblock.restoration_target.active_task,
      active_correction_task: unblock.restoration_target.active_correction_task,
      active_unblock_task: unblock.restoration_target.active_unblock_task,
      last_implementation_result: 'passed',
      last_quality_gate_result: 'passed',
      last_review_result: 'approved',
      last_unblock_result: 'passed',
    });
    markdown = replaceSection(markdown, 'Blocked By', '- None');
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
      '- active_unblock_task: none',
    ].join('\n'));
    markdown = replaceSection(markdown, 'Last Approved Change', `Unblock task \`${task.taskId}\` was approved by the prototype orchestrator.`);
    markdown = replaceSection(markdown, 'Next Planning Hint', restorationTargetNextPlanningHint(unblock.restoration_target, unblock.restoration_target.active_task, 'unblock'));
    return markdown;
  }

  private updateProjectStateAfterStateCorrection(featureId: string, stateCorrection: StateCorrectionTask): string {
    let markdown = readFileSync(this.projectStatePath, 'utf8');
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${featureId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList(stateCorrectionProjectPendingLines(stateCorrection)));
    markdown = replaceSection(markdown, 'Last Approved Change', `State correction task \`${stateCorrection.task_id}\` was approved by the prototype orchestrator.`);
    markdown = replaceSection(markdown, 'Next Planning Hint', stateCorrectionNextPlanningHint(stateCorrection));
    markdown = upsertBulletInSection(
      markdown,
      'Current Reality',
      `- Feature \`${featureId}\` now has a planned next task`,
      `- Feature \`${featureId}\` state was canonicalized; the active task pointer remains \`${stateCorrection.state_target.restored_active_task}\`.`,
    );
    return markdown;
  }

  private updateProjectStateForUnblock(featureId: string, taskId: string, lifecycleState: string): string {
    let markdown = readFileSync(this.projectStatePath, 'utf8');
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${featureId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList([
      `Execute unblock task \`${taskId}\` for the active feature.`,
      'Continue updating this file with approved repository facts as feature work lands.',
    ]));
    markdown = replaceSection(markdown, 'Next Planning Hint', `The active feature is \`${featureId}\`, and its next valid action is to execute unblock task \`${taskId}\` from the captured \`${lifecycleState}\` state.`);
    markdown = upsertBulletInSection(
      markdown,
      'Current Reality',
      `- Feature \`${featureId}\` now has a planned unblock task`,
      `- Feature \`${featureId}\` now has a planned unblock task, \`${taskId}\`, to resolve a recoverable blocker and restore \`${lifecycleState}\`.`,
    );
    return markdown;
  }

  private updateProjectStateAfterUnblock(featureId: string, taskId: string, restorationTarget: RestorationTarget): string {
    let markdown = readFileSync(this.projectStatePath, 'utf8');
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${featureId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList(restorationTargetProjectPendingLines(restorationTarget, taskId, 'unblock')));
    markdown = replaceSection(markdown, 'Last Approved Change', `Unblock task \`${taskId}\` was approved by the prototype orchestrator.`);
    markdown = replaceSection(markdown, 'Next Planning Hint', restorationTargetNextPlanningHint(restorationTarget, restorationTarget.active_task, 'unblock'));
    markdown = upsertBulletInSection(
      markdown,
      'Current Reality',
      `- Feature \`${featureId}\` now has a planned unblock task`,
      `- Feature \`${featureId}\` recovered from a blocker through unblock task \`${taskId}\`; the active task pointer was restored to \`${restorationTarget.active_task}\`.`,
    );
    return markdown;
  }

  private recordRecoveryLesson(
    task: ParsedTaskDocument,
    review: ReviewerOutput,
    implementation: ImplementationAttempt,
    qualityResults: readonly QualityGateResult[],
    analysis: TaskInterfaceAnalysis,
    correctionTaskId: string | null,
  ): RecoveryLesson {
    const lesson = this.buildRecoveryLesson(task, review, implementation, qualityResults, analysis, correctionTaskId);
    this.artifacts.writeJson(join('recovery-lessons', `${task.taskId}.json`), lesson);
    this.artifacts.writeJson('latest-recovery-lesson.json', lesson);
    this.artifacts.writeText(join('recovery-lessons', `${task.taskId}.md`), this.renderRecoveryLessonMarkdown(lesson));
    this.artifacts.writeText('latest-recovery-lesson.md', this.renderRecoveryLessonMarkdown(lesson));
    return lesson;
  }

  private buildRecoveryLesson(
    task: ParsedTaskDocument,
    review: ReviewerOutput,
    implementation: ImplementationAttempt,
    qualityResults: readonly QualityGateResult[],
    analysis: TaskInterfaceAnalysis,
    correctionTaskId: string | null,
  ): RecoveryLesson {
    const scopeIsolationNotes = uniqueStrings([
      ...(review.scope_check.status === 'failed' ? review.scope_check.unrelated_changes : []),
      ...(review.scope_check.unrelated_changes.length > 0
        ? [
            `Reviewable diff included out-of-scope paths: ${review.scope_check.unrelated_changes.join(', ')}.`,
            'Future recoveries should keep runtime state transitions separate from the reviewable task diff or explicitly exclude them from the submission.',
          ]
        : []),
    ]);

    const qualityGateFailures = qualityResults
      .filter((result) => result.status === 'failed')
      .map((result) => `${result.name}: ${result.output_summary}`);

    return {
      run_id: this.runId,
      created_at: new Date().toISOString(),
      feature_id: task.featureId,
      task_id: task.taskId,
      correction_task_id: correctionTaskId,
      review_status: review.status,
      summary: review.summary,
      review_findings: review.findings.map((finding) => `[${finding.severity}] ${finding.message}`),
      quality_gate_failures: qualityGateFailures,
      recommended_action: analysis.recommended_action,
      perfectible: analysis.perfectible,
      scope_isolation_notes: scopeIsolationNotes,
      implementer_limitations: analysis.implementer_limitations,
      task_interface_adjustments: analysis.task_interface_adjustments,
      notes_for_documentation: analysis.notes_for_documentation,
    };
  }

  private loadLatestRecoveryLesson(featureId: string): RecoveryLesson | null {
    const lesson = this.artifacts.readJson<RecoveryLesson>('latest-recovery-lesson.json');
    if (!lesson || lesson.feature_id !== featureId) {
      return null;
    }

    return lesson;
  }

  private loadLatestRefinement(featureId: string): RefinementFeedback | null {
    const feedback = this.artifacts.readJson<RefinementFeedback>('latest-refinement.json');
    if (!feedback || feedback.selected_step?.feature_id !== featureId) {
      return null;
    }

    return feedback;
  }

  private buildRecoveryLessonPromptLines(featureId: string): string[] {
    const lesson = this.loadLatestRecoveryLesson(featureId);
    if (!lesson) {
      const refinement = this.loadLatestRefinement(featureId);
      if (!refinement) {
        return [];
      }

      const lines = [
        '',
        'Recent implementation failure refinement:',
        `- trigger: ${refinement.trigger}`,
      ];

      if (refinement.selected_step) {
        lines.push(
          `- selected_step: ${refinement.selected_step.kind}`,
          `- selected_feature: ${refinement.selected_step.feature_id ?? 'null'}`,
          `- selected_task: ${refinement.selected_step.task_id ?? 'null'}`,
          `- selected_reason: ${refinement.selected_step.reason}`,
        );
      }

      lines.push(
        ...refinement.observations.map((item) => `- observation: ${item}`),
        ...refinement.next_questions.map((item) => `- next_question: ${item}`),
      );
      return lines;
    }

    const lines = [
      '',
      'Recent recovery lesson:',
      `- task_id: ${lesson.task_id}`,
      `- review_status: ${lesson.review_status}`,
      `- summary: ${lesson.summary}`,
      ...lesson.scope_isolation_notes.map((item) => `- scope_isolation: ${item}`),
      ...lesson.review_findings.map((item) => `- review_finding: ${item}`),
      ...lesson.quality_gate_failures.map((item) => `- quality_gate_failure: ${item}`),
      `- recommended_action: ${lesson.recommended_action}`,
      `- perfectible: ${lesson.perfectible ? 'yes' : 'no'}`,
      ...lesson.implementer_limitations.map((item) => `- implementer_limitation: ${item}`),
    ];

    if (lesson.task_interface_adjustments.first_executable_step) {
      lines.push(`- first_executable_step: ${lesson.task_interface_adjustments.first_executable_step}`);
    }

    for (const item of lesson.task_interface_adjustments.minimum_progress_evidence) {
      lines.push(`- minimum_progress_evidence: ${item}`);
    }

    for (const item of lesson.task_interface_adjustments.context_additions) {
      lines.push(`- context_addition: ${item}`);
    }

    for (const item of lesson.task_interface_adjustments.scope_adjustments) {
      lines.push(`- scope_adjustment: ${item}`);
    }

    for (const item of lesson.task_interface_adjustments.acceptance_criteria_adjustments) {
      lines.push(`- acceptance_criteria_adjustment: ${item}`);
    }

    for (const item of lesson.task_interface_adjustments.quality_gate_adjustments) {
      lines.push(`- quality_gate_adjustment: ${item}`);
    }

    for (const item of lesson.notes_for_documentation) {
      lines.push(`- documentation_note: ${item}`);
    }

    return lines;
  }

  private renderRecoveryLessonMarkdown(lesson: RecoveryLesson): string {
    return [
      `# Recovery Lesson: ${lesson.feature_id}/${lesson.task_id}`,
      '',
      `- run_id: \`${lesson.run_id}\``,
      `- correction_task_id: \`${lesson.correction_task_id ?? 'none'}\``,
      `- review_status: ${lesson.review_status}`,
      `- summary: ${lesson.summary}`,
      '',
      '## Scope Isolation',
      ...(lesson.scope_isolation_notes.length > 0 ? lesson.scope_isolation_notes.map((item) => `- ${item}`) : ['- None recorded.']),
      '',
      '## Review Findings',
      ...(lesson.review_findings.length > 0 ? lesson.review_findings.map((item) => `- ${item}`) : ['- None recorded.']),
      '',
      '## Quality Gate Failures',
      ...(lesson.quality_gate_failures.length > 0 ? lesson.quality_gate_failures.map((item) => `- ${item}`) : ['- None recorded.']),
      '',
      '## Implementer Limitations',
      ...(lesson.implementer_limitations.length > 0 ? lesson.implementer_limitations.map((item) => `- ${item}`) : ['- None recorded.']),
      '',
      '## Task Interface Adjustments',
      `- first_executable_step: ${lesson.task_interface_adjustments.first_executable_step ?? 'no change'}`,
      ...(lesson.task_interface_adjustments.minimum_progress_evidence.length > 0
        ? lesson.task_interface_adjustments.minimum_progress_evidence.map((item) => `- minimum_progress_evidence: ${item}`)
        : ['- minimum_progress_evidence: no change']),
      ...(lesson.task_interface_adjustments.context_additions.length > 0
        ? lesson.task_interface_adjustments.context_additions.map((item) => `- context_addition: ${item}`)
        : ['- context_addition: no change']),
      ...(lesson.task_interface_adjustments.scope_adjustments.length > 0
        ? lesson.task_interface_adjustments.scope_adjustments.map((item) => `- scope_adjustment: ${item}`)
        : ['- scope_adjustment: no change']),
      ...(lesson.task_interface_adjustments.acceptance_criteria_adjustments.length > 0
        ? lesson.task_interface_adjustments.acceptance_criteria_adjustments.map((item) => `- acceptance_criteria_adjustment: ${item}`)
        : ['- acceptance_criteria_adjustment: no change']),
      ...(lesson.task_interface_adjustments.quality_gate_adjustments.length > 0
        ? lesson.task_interface_adjustments.quality_gate_adjustments.map((item) => `- quality_gate_adjustment: ${item}`)
        : ['- quality_gate_adjustment: no change']),
      '',
      '## Documentation Notes',
      ...(lesson.notes_for_documentation.length > 0 ? lesson.notes_for_documentation.map((item) => `- ${item}`) : ['- None recorded.']),
      '',
    ].join('\n');
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
      enum: ['plan_feature', 'plan_task', 'correct_state', 'unblock_task', 'implement_task', 'review_task', 'correct_task', 'stop', 'blocked'],
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
  let implementer: ImplementerTool = 'opencode';

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

    if (argument === '--implementer') {
      const value = argv[index + 1];
      if (value !== 'codex' && value !== 'opencode') {
        throw new Error('--implementer requires a value of codex or opencode.');
      }

      implementer = value;
      index += 1;
      continue;
    }

    if (argument === 'run' || argument === 'run-once') {
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return { loop, commit, cwd, implementer };
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

function renderStateCorrectionTaskMarkdown(stateCorrection: StateCorrectionTask): string {
  const task = stateCorrectionTaskToTask(stateCorrection);
  return [
    renderTaskMarkdown(task).trimEnd(),
    '',
    '## State Target',
    '',
    `- feature_state_path: \`${stateCorrection.state_target.feature_state_path}\``,
    `- project_state_path: \`${stateCorrection.state_target.project_state_path ?? 'none'}\``,
    `- contract_reference: \`${stateCorrection.state_target.contract_reference}\``,
    `- detected_issue: ${stateCorrection.state_target.detected_issue}`,
    `- restored_lifecycle_state: ${stateCorrection.state_target.restored_lifecycle_state}`,
    `- restored_active_task: \`${stateCorrection.state_target.restored_active_task}\``,
    `- restored_active_correction_task: \`${stateCorrection.state_target.restored_active_correction_task}\``,
    '',
  ].join('\n');
}

function renderUnblockTaskMarkdown(task: PlannedTask, unblock: UnblockTaskMetadata): string {
  return [
    renderTaskMarkdown(task).trimEnd(),
    '',
    '## Blocker Context',
    '',
    `- kind: ${unblock.blocker.kind}`,
    `- signature: ${unblock.blocker.signature}`,
    `- recoverability: ${unblock.blocker.recoverability}`,
    `- observed_state: ${unblock.blocker.observed_state}`,
    ...(unblock.blocker.evidence.length > 0 ? unblock.blocker.evidence.map((item) => `- evidence: ${item}`) : ['- evidence: none']),
    '',
    '## Restoration Target',
    '',
    `- lifecycle_state: ${unblock.restoration_target.lifecycle_state}`,
    `- active_task: \`${unblock.restoration_target.active_task}\``,
    `- active_correction_task: \`${unblock.restoration_target.active_correction_task}\``,
    `- active_unblock_task: \`${unblock.restoration_target.active_unblock_task}\``,
    '',
  ].join('\n');
}

function renderBlockerProfileMarkdown(profile: {
  readonly run_id: string;
  readonly feature_id: string;
  readonly task_id: string | null;
  readonly reason: string;
  readonly blocker: BlockerProfile;
  readonly restoration_target: RestorationTarget;
}): string {
  return [
    `# Blocker Profile: ${profile.feature_id}`,
    '',
    `- run_id: \`${profile.run_id}\``,
    `- task_id: \`${profile.task_id ?? 'none'}\``,
    `- reason: ${profile.reason}`,
    '',
    '## Blocker',
    `- kind: ${profile.blocker.kind}`,
    `- signature: ${profile.blocker.signature}`,
    `- recoverability: ${profile.blocker.recoverability}`,
    `- observed_state: ${profile.blocker.observed_state}`,
    ...(profile.blocker.evidence.length > 0 ? profile.blocker.evidence.map((item) => `- evidence: ${item}`) : ['- evidence: none']),
    '',
    '## Restoration Target',
    `- lifecycle_state: ${profile.restoration_target.lifecycle_state}`,
    `- active_task: \`${profile.restoration_target.active_task}\``,
    `- active_correction_task: \`${profile.restoration_target.active_correction_task}\``,
    `- active_unblock_task: \`${profile.restoration_target.active_unblock_task}\``,
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

function stateCorrectionTaskToTask(stateCorrection: StateCorrectionTask): PlannedTask {
  return {
    task_id: stateCorrection.task_id,
    feature_id: stateCorrection.feature_id,
    title: stateCorrection.title,
    objective: stateCorrection.objective,
    first_executable_step: stateCorrection.first_executable_step,
    minimum_progress_evidence: stateCorrection.minimum_progress_evidence,
    trace: stateCorrection.trace,
    context: stateCorrection.context,
    scope: stateCorrection.scope,
    constraints: stateCorrection.constraints,
    development_policy: {
      mode: stateCorrection.development_policy.mode,
    },
    quality_gates: stateCorrection.quality_gates,
    acceptance_criteria: stateCorrection.acceptance_criteria,
    expected_deliverables: stateCorrection.expected_deliverables,
  };
}

function stateCorrectionNextPlanningHint(stateCorrection: StateCorrectionTask): string {
  return restorationTargetNextPlanningHint({
    lifecycle_state: stateCorrection.state_target.restored_lifecycle_state,
    active_task: stateCorrection.state_target.restored_active_task,
    active_correction_task: stateCorrection.state_target.restored_active_correction_task,
    active_unblock_task: 'none',
  }, stateCorrection.task_id, 'state_correction');
}

function restorationTargetNextPlanningHint(
  restorationTarget: RestorationTarget,
  activeTaskId: string,
  activeTaskLabel: 'state_correction' | 'unblock' | 'task' = 'task',
): string {
  switch (restorationTarget.lifecycle_state) {
    case 'task_ready':
      return `Execute \`${activeTaskId}\` when the current execution mode allows it.`;
    case 'review_pending':
      return `Review \`${activeTaskId}\` next.`;
    case 'implementation_running':
      return `Resume \`${activeTaskId}\` implementation recovery before continuing.`;
    case 'formalized':
      return 'Plan the next task that advances this feature from the remaining gap.';
    case 'correction_pending':
      return activeTaskLabel === 'unblock'
        ? `Execute unblock task \`${activeTaskId}\` next.`
        : `Execute correction task \`${activeTaskId}\` next.`;
    case 'unblock_pending':
      return `Execute unblock task \`${activeTaskId}\` next.`;
    default:
      return `Continue from the repaired \`${restorationTarget.lifecycle_state}\` state for \`${activeTaskId}\`.`;
  }
}

function stateCorrectionProjectPendingLines(stateCorrection: StateCorrectionTask): string[] {
  return restorationTargetProjectPendingLines({
    lifecycle_state: stateCorrection.state_target.restored_lifecycle_state,
    active_task: stateCorrection.state_target.restored_active_task,
    active_correction_task: stateCorrection.state_target.restored_active_correction_task,
    active_unblock_task: 'none',
  }, stateCorrection.task_id, 'state_correction');
}

function restorationTargetProjectPendingLines(
  restorationTarget: RestorationTarget,
  activeTaskId: string,
  activeTaskLabel: 'state_correction' | 'unblock' | 'task' = 'task',
): string[] {
  switch (restorationTarget.lifecycle_state) {
    case 'task_ready':
      return [
        `Execute \`${activeTaskId}\` for the active feature.`,
        'Continue updating this file with approved repository facts as feature work lands.',
      ];
    case 'review_pending':
      return [
        `Review \`${activeTaskId}\` for the active feature.`,
        'Continue updating this file with approved repository facts as feature work lands.',
      ];
    case 'implementation_running':
      return [
        `Recover the implementation of \`${activeTaskId}\` before continuing.`,
        'Continue updating this file with approved repository facts as feature work lands.',
      ];
    case 'formalized':
      return [
        `Plan the next implementation task for the active feature.`,
        'Continue updating this file with approved repository facts as feature work lands.',
      ];
    case 'correction_pending':
      return activeTaskLabel === 'unblock'
        ? [
            `Execute unblock task \`${activeTaskId}\` for the active feature.`,
            'Continue updating this file with approved repository facts as feature work lands.',
          ]
        : [
            `Execute correction task \`${activeTaskId}\` for the active feature.`,
            'Continue updating this file with approved repository facts as feature work lands.',
          ];
    case 'unblock_pending':
      return [
        `Execute unblock task \`${activeTaskId}\` for the active feature.`,
        'Continue updating this file with approved repository facts as feature work lands.',
      ];
    default:
      return [
        `Continue from the repaired \`${restorationTarget.lifecycle_state}\` state for the active feature.`,
        'Continue updating this file with approved repository facts as feature work lands.',
      ];
  }
}

export function classifyBlockerKind(
  reason: string,
  blockedBy: readonly string[],
  lifecycleState: string,
): BlockerProfile {
  const normalized = [reason, ...blockedBy, lifecycleState].join('\n').toLowerCase();
  let kind: BlockerKind = 'unknown';
  let recoverability: BlockerRecoverability = 'agent';

  if (/state|markdown|section|lifecycle|operational status|active_task|active correction/i.test(normalized)) {
    kind = 'state_corruption';
  } else if (/review|diff|acceptance|correction task/i.test(normalized)) {
    kind = 'review_failure';
  } else if (/implementation failed|implementation_failure|failed implementation|model passivity|no git diff|no progress/i.test(normalized)) {
    kind = 'implementation_failure';
  } else if (/task interface|first executable step|minimum progress evidence|scope|prompt/i.test(normalized)) {
    kind = 'task_interface_gap';
  } else if (/permission|approval|allow access|denied|ask-for-approval/i.test(normalized)) {
    kind = 'cli_mismatch';
  } else if (/binary|command|environment|missing|not found|path|install/i.test(normalized)) {
    kind = 'environment';
  }

  if (/terminal|unrecoverable|cannot recover|no unblock|no state correction/i.test(normalized)) {
    recoverability = 'terminal';
  } else if (kind === 'environment') {
    recoverability = 'human';
  }

  const evidence = uniqueStrings([
    reason.trim(),
    ...blockedBy.slice(0, 3),
    `lifecycle=${lifecycleState}`,
  ].filter((item) => item.length > 0));

  return {
    kind,
    signature: buildBlockerSignature(kind, lifecycleState, reason, blockedBy),
    evidence,
    recoverability,
    observed_state: `lifecycle=${lifecycleState}`,
  };
}

export function buildBlockerSignature(
  kind: BlockerKind,
  lifecycleState: string,
  reason: string,
  blockedBy: readonly string[],
): string {
  const seed = [kind, lifecycleState, reason, ...blockedBy].join(' ');
  return seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || `${kind}-${lifecycleState}`.toLowerCase();
}

function buildImplementerPrompt(
  task: ParsedTaskDocument,
  correction: boolean,
  stateCorrection: StateCorrectionTask | null,
  recoveryLessonLines: readonly string[] = [],
): string {
  const role = correction ? 'correction task' : 'task';
  return [
      'Act as the CompassRose Implementer.',
      '',
      `Execute ${role} \`${task.taskId}\` for feature \`${task.featureId}\`.`,
      '',
    'Read only:',
    '- `src/contracts/implementer/task-execution-prompt.md`',
    ...(stateCorrection ? ['- `src/contracts/task/state-correction-task.md`'] : []),
    `- \`${task.path}\``,
    ...task.likelyAffectedFiles.map((item) => `- \`${item}\``),
    '',
    'Instructions:',
    `- Start with: ${task.firstExecutableStep}`,
    '- Follow TDD when the task changes code: add or update the smallest failing test first, then make it pass.',
    stateCorrection
      ? '- This task repairs repository state; keep the change documentation-only unless the task explicitly allows code edits.'
      : '- Use the declared development policy for the task.',
    ...recoveryLessonLines,
    stateCorrection
      ? '- Preserve the restored task pointer and keep the correction narrowly focused on canonical state.'
      : '- Keep the change minimal and avoid unrelated refactors.',
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

  if (selectedStep?.kind === 'unblock_task') {
    sources.add('src/contracts/planner/unblock-task-planning-prompt.md');
    sources.add('src/contracts/task/unblock-task.md');
    sources.add('src/contracts/state/feature-state.md');
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

  if (normalized.includes('blocked') || normalized.includes('blocker')) {
    sources.add('src/contracts/task/unblock-task.md');
    sources.add('src/contracts/runtime/operation-loop.md');
  }

  if (normalized.includes('implementation failed') || normalized.includes('implementation_failure')) {
    sources.add('src/contracts/task/unblock-task.md');
    sources.add('src/contracts/state/feature-state.md');
    sources.add('src/contracts/runtime/operation-loop.md');
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

  if (normalized.includes('unblock task') || normalized.includes('unblock_pending')) {
    sources.add('src/contracts/task/unblock-task.md');
    sources.add('src/contracts/state/feature-state.md');
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

  if (/blocked|blocker/i.test(trigger)) {
    observations.push('The runtime needs a blocker-specific recovery path instead of a generic stop.');
  }

  if (/implementation failed|implementation_failure/i.test(trigger)) {
    observations.push('The runtime should continue into a bounded recovery unblock task instead of stopping on the failed implementation state.');
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

  if (/blocked|blocker/i.test(trigger)) {
    questions.push('Should the blocker be classified into a reusable unblock profile before the run stops?');
  }

  if (/implementation failed|implementation_failure/i.test(trigger)) {
    questions.push('Should implementation failure automatically open a bounded unblock task that restores the active task target?');
  }

  if (selectedStep?.kind === 'plan_task') {
    questions.push('Did the planner receive enough repository-local context to produce a bounded task?');
  }

  if (selectedStep?.kind === 'review_task') {
    questions.push('Did the reviewer receive enough structured implementation evidence beyond the raw diff?');
  }

  if (selectedStep?.kind === 'unblock_task') {
    questions.push('Did the unblock prompt expose enough blocker context and restoration target detail for the planner?');
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

  const defaults: Record<string, string> = {
    formalization: 'complete',
    active_task: 'none',
    active_correction_task: 'none',
    active_unblock_task: 'none',
    last_implementation_result: 'not_run',
    last_quality_gate_result: 'unknown',
    last_review_result: 'not_run',
    last_unblock_result: 'not_run',
  };

  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in values)) {
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

function parsePreferredStatusValue(sectionBody: string, key: string): string | null {
  let fallback: string | null = null;
  let preferred: string | null = null;

  for (const rawLine of sectionBody.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('- ')) {
      continue;
    }

    const separator = line.indexOf(':');
    if (separator === -1) {
      continue;
    }

    const parsedKey = line.slice(2, separator).trim();
    if (parsedKey !== key) {
      continue;
    }

    const value = line.slice(separator + 1).trim();
    fallback = value;
    if (value !== 'none') {
      preferred = value;
    }
  }

  return preferred ?? fallback;
}

function replaceSection(markdown: string, heading: string, newBody: string): string {
  const sectionHeader = `## ${heading}\n\n`;
  const sectionStart = markdown.indexOf(sectionHeader);
  if (sectionStart === -1) {
    throw new Error(`Section "## ${heading}" was not found.`);
  }

  const bodyStart = sectionStart + sectionHeader.length;
  const nextHeadingIndex = markdown.indexOf('\n## ', bodyStart);
  const sectionEnd = nextHeadingIndex === -1 ? markdown.length : nextHeadingIndex;
  const replacement = `${sectionHeader}${ensureTrailingNewline(newBody).trimEnd()}\n`;
  return `${markdown.slice(0, sectionStart)}${replacement}${markdown.slice(sectionEnd)}`;
}

function setOrInsertSection(markdown: string, heading: string, newBody: string): string {
  const sectionHeader = `## ${heading}\n\n`;
  const sectionStart = markdown.indexOf(sectionHeader);
  if (sectionStart !== -1) {
    return replaceSection(markdown, heading, newBody);
  }

  const statusHeader = '## Status\n\n';
  const statusStart = markdown.indexOf(statusHeader);
  if (statusStart === -1) {
    throw new Error(`Unable to insert section "## ${heading}" because "## Status" was not found.`);
  }

  const statusBodyStart = statusStart + statusHeader.length;
  const nextHeadingIndex = markdown.indexOf('\n## ', statusBodyStart);
  const insertAt = nextHeadingIndex === -1 ? markdown.length : nextHeadingIndex;
  const insertion = `\n\n${sectionHeader}${ensureTrailingNewline(newBody).trimEnd()}`;
  return `${markdown.slice(0, insertAt)}${insertion}${markdown.slice(insertAt)}`;
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

function buildStateCorrectionTaskId(tasksDirectory: string, activeTaskId: string): string {
  if (!statSafeIsDirectory(tasksDirectory)) {
    return `${activeTaskId}-C1`;
  }

  const pattern = new RegExp('`' + escapeRegExp(activeTaskId) + '-C(\\d+)`', 'g');
  let highestCorrection = 0;

  for (const entry of readdirSync(tasksDirectory)) {
    if (!entry.endsWith('.md')) {
      continue;
    }

    const markdown = readFileSync(join(tasksDirectory, entry), 'utf8');
    for (const match of markdown.matchAll(pattern)) {
      highestCorrection = Math.max(highestCorrection, Number.parseInt(match[1] ?? '0', 10));
    }
  }

  return `${activeTaskId}-C${highestCorrection + 1}`;
}

function humanTaskNumber(taskId: string): string {
  const unblockMatch = taskId.match(/-T(\d+)-U(\d+)$/);
  const unblockTaskNumber = unblockMatch?.[1];
  const unblockSequence = unblockMatch?.[2];
  if (unblockTaskNumber && unblockSequence) {
    return `${String(Number.parseInt(unblockTaskNumber, 10)).padStart(3, '0')}.U${Number.parseInt(unblockSequence, 10)}`;
  }

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

function extractTaskIdHint(text: string | null): string | null {
  if (!text) {
    return null;
  }

  const match = text.match(/\b(F\d+-T\d+(?:-U\d+)?)\b/);
  return match?.[1] ?? null;
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

function parseGitStatusPaths(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => {
      if (line.startsWith('?? ')) {
        return line.slice(3).trim();
      }

      const pathSpec = line.slice(3).trim();
      const renameSeparator = pathSpec.indexOf(' -> ');
      return renameSeparator === -1 ? pathSpec : pathSpec.slice(renameSeparator + 4).trim();
    })
    .filter((path) => path.length > 0);
}

function isPathAllowedByPrefix(path: string, allowedPrefixes: readonly string[]): boolean {
  return allowedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
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
  writeFileSync(path, normalizeTextForWrite(contents), 'utf8');
}

export function normalizeTextForWrite(text: string): string {
  return `${text.trimEnd()}\n`;
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
