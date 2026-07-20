import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative as relativePath, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type {
  BlockerKind,
  BlockerProfile,
  BlockerRecoverability,
  CorrectionTask,
  DevelopmentPolicyMode,
  DoctorRecoveryTaskMetadata,
  DiagnosticAutocorrectionDecision,
  DiagnosticClassification,
  FeatureStateSnapshot,
  FixSeverity,
  ImplementationAttempt,
  ImplementationAttemptHistory,
  ImplementationDiagnostics,
  ParsedTaskDocument,
  PlannedFeatureDocs,
  PlannedFixDocs,
  PlannedTask,
  PlannerOutput,
  QualityGateResult,
  RecoveryLesson,
  RefinementFeedback,
  RestorationTarget,
  ReviewerOutput,
  ReviewerStatus,
  StateCorrectionTask,
  StepDecision,
  StepKind,
  StoredTaskArtifact,
  TaskInterfaceAnalysis,
  TaskRequest,
  TaskRequestBackfillOutput,
  TaskRequestStatus,
  ReviewableDiffHandoff,
  ExpectedDeliverable,
  UnblockTaskMetadata,
} from '../contracts/types.js';
import { selectImplementationContextArtifactNames } from '../contracts/runtime/agentContext.js';
import type { AgentInvocationContext, AgentToolName } from '../contracts/runtime/agentContext.js';
import type {
  ContractRefreshResult,
  FeatureInspection,
  FeatureRecord,
  FixInspection,
  FixRecord,
  ProtoOptions,
  RunSummary,
  StepExecutionResult,
  StepRunRecord,
  WorkItemContext,
  WorkItemInspectionKind,
} from '../contracts/runtime/protoRuntime.js';
import type { ProjectConfiguration } from '../config/configTypes.js';
import { readProjectConfiguration } from '../config/configReader.js';
import { resolveRepositoryRelativePath } from '../filesystem/pathResolver.js';
import { findGitRepositoryRoot } from '../git/gitStatus.js';
import { normalizeTextForWrite, readUtf8 } from '../filesystem/textNormalization.js';
import { parseTaskDocument, storedTaskArtifactFromDocument } from '../task/taskDocument.js';
import {
  buildCorrectionTaskFileName,
  buildStateCorrectionTaskId,
  buildTaskFileName,
  capTaskFileNameLength,
  humanCorrectionNumber,
  humanTaskNumber,
  limitStateCorrectionTaskId,
} from '../task/taskId.js';
import {
  assertTaskIdIsUnused,
  findLatestImplementationAttemptTaskId,
  findLatestTaskArtifactTaskId,
  findTaskDocumentPath,
  tryFindTaskDocumentPath,
} from '../task/taskStore.js';
import { extractImplementationNotes, implementationNotesIndicatesAlreadyComplete } from '../implementer/implementationNotes.js';
import {
  preferredRestorationTarget,
  resolveImplementationFailureActiveTask,
  restorationTargetNextPlanningHint,
  restorationTargetProjectPendingLines,
  stateCorrectionNextPlanningHint,
  stateCorrectionProjectPendingLines,
} from '../state/restorationTarget.js';
import { buildBlockerSignature, classifyBlockerKind } from '../state/blockerClassification.js';
import { uniqueStrings } from '../shared/arrays.js';
import { isPathAllowedByPrefix, pathsExceedingPrefixes } from '../shared/pathPrefix.js';
import { ControlledStopError, stopExitCodeForSignal } from '../runtime/controlledStop.js';
import { GitClient } from '../git/gitClient.js';
import { ArtifactStore } from '../artifacts/artifactStore.js';
import { DEFAULT_AGENT_HEARTBEAT_MS, runCommandWithHeartbeat } from '../agents/heartbeatRunner.js';
import type { HeartbeatRunConfig } from '../agents/heartbeatRunner.js';
import { normalizeModelName, resolveCodexImplementerModel, resolveCodexPlannerModel, resolveOpenCodeModel } from '../agents/modelResolution.js';
import { logAgentEnd, logAgentStart, logAgentStream } from '../agents/agentLogging.js';
import { CodexCli } from '../agents/codexCli.js';
import { OpenCodeCli } from '../agents/openCodeCli.js';
import type { CommandExecution, TaskImplementer } from '../agents/taskImplementer.js';
import { ContractRegistry } from './contractRegistry.js';
import type { StructuredSchemaId } from './contractRegistry.js';
import {
  bulletList,
  correctionTaskToTask,
  renderCorrectionTaskMarkdown,
  renderDoctorRecoveryTaskMarkdown,
  renderImplementationOutlineMarkdown,
  renderOutlineProgressMarkdown,
  renderStateCorrectionTaskMarkdown,
  renderTaskMarkdown,
  renderUnblockTaskMarkdown,
  stateCorrectionTaskToTask,
} from './taskRendering.js';
import {
  isBlockerKind,
  isBlockerRecoverability,
  readValueFromStructuredLines,
  renderBlockerProfileMarkdown,
} from './blockerRendering.js';
import { buildDoctorRecoveryPrompt, buildImplementerPrompt } from './promptBuilding.js';
import {
  buildImplementationDiagnostics,
  buildImplementationErrorMessage,
  classifyImplementation,
  joinOutput,
  outputShowsCommittedReviewableDiff,
  selectReviewableDiffForReview,
  summarizeCommandOutput,
  summarizeText,
  validateTaskDeliverables,
} from './implementationDiagnostics.js';
import {
  buildNextQuestions,
  buildObservations,
  inferLikelySources,
  renderRefinementFeedback,
} from './refinementFeedback.js';
import { renderTaskInterfaceAnalysisMarkdown } from './taskInterfaceRendering.js';
import { replaceOperationalStatus } from './stateMarkdown.js';
import {
  assertNever,
  compareFeatureIds,
  createRunId,
  errorMessage,
  extractReferencedPaths,
  isRecord,
  primaryTaskAnchorFromId,
  readPositiveInteger,
  readRecordString,
  requireNonNoneValue,
  requireString,
  statSafeIsFile,
  writeText,
} from './runtimeHelpers.js';
import { buildSiblingFeatureIndex } from '../planner/siblingFeatureIndex.js';
import {
  checkTaskRequestContainment,
  listExistingTaskIds,
  reconcileBackfilledTaskRequests,
  selectNextTaskRequest,
  stripBackfillMetadata,
  withUpdatedStatus,
  withWidenedScope,
} from './taskRequests.js';
export { parseTaskDocument };
import {
  escapeRegExp,
  ensureTrailingNewline,
  extractTaskIdHint,
  firstExpectedChange,
  optionalSection,
  parseBulletSection,
  parseCodeBlock,
  parseLabeledBulletList,
  parsePreferredStatusValue,
  parseStatusMap,
  replaceSection,
  requireSection,
  setOrInsertSection,
  slugify,
  stripTicks,
  upsertBulletInSection,
  upsertParagraphInSection,
} from '../markdown/sections.js';

// Watched by ContractRegistry so a long-running `--loop` invocation restarts instead of
// continuing to execute stale in-memory logic if any of these files change underneath it
// (e.g. this orchestrator building/correcting its own runtime, per the project's
// self-application goal). Keep in sync with the actual module set under src/orchestrator/
// and src/agents/ that this class depends on.
const ORCHESTRATOR_RUNTIME_CRITICAL_PATHS: readonly string[] = [
  'src/orchestrator/orchestrator.ts',
  'src/orchestrator/contractRegistry.ts',
  'src/orchestrator/taskRendering.ts',
  'src/orchestrator/blockerRendering.ts',
  'src/orchestrator/promptBuilding.ts',
  'src/orchestrator/implementationDiagnostics.ts',
  'src/orchestrator/refinementFeedback.ts',
  'src/orchestrator/taskInterfaceRendering.ts',
  'src/orchestrator/stateMarkdown.ts',
  'src/orchestrator/runtimeHelpers.ts',
  'src/agents/heartbeatRunner.ts',
  'src/agents/modelResolution.ts',
  'src/agents/agentLogging.ts',
  'src/agents/codexCli.ts',
  'src/agents/openCodeCli.ts',
  'src/agents/taskImplementer.ts',
  'src/git/gitClient.ts',
  'src/artifacts/artifactStore.ts',
  'src/runtime/controlledStop.ts',
];

export class StateCorrectionLimitReachedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateCorrectionLimitReachedError';
  }
}

export class DoctorRecoveryLimitReachedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DoctorRecoveryLimitReachedError';
  }
}

export class CompassRoseOrchestrator {
  private readonly repositoryRoot: string;
  private readonly git: GitClient;
  private readonly artifacts: ArtifactStore;
  private readonly contracts: ContractRegistry;
  private readonly codex: CodexCli;
  private readonly opencode: OpenCodeCli;
  private readonly implementer: TaskImplementer;
  private readonly skipCleanWorktreeCheck: boolean;
  private readonly projectConfiguration: ProjectConfiguration;
  private readonly configurationPath: string;
  private readonly projectStatePath: string;
  private readonly featuresRoot: string;
  private readonly fixesRoot: string;
  private readonly maxTasksPerRun: number;
  private readonly maxReviewIterations: number;
  private readonly maxRecoveryIterations: number;
  private readonly runId: string;
  private readonly codexCommand: string;
  private readonly opencodeCommand: string;
  private readonly startedAt: string;
  private readonly stepRecords: StepRunRecord[] = [];
  private readonly completedPrimaryTaskAnchors = new Set<string>();
  // Every task-document path this process itself has authored (plan_task/plan_fix_task/
  // doctor-recovery/correction/state-correction writers below), so the review-time scope check
  // (reviewTask()) can tell "the runtime's own bookkeeping from an earlier step in this run" apart
  // from "an implementer wrote to a task document outside its declared scope" -- the latter is
  // exactly the class of bug causa A exists to catch, so this must stay narrow: only paths this
  // process itself is known to have written, never a blanket directory exclusion.
  private readonly runtimeAuthoredTaskPaths = new Set<string>();
  private agentInvocationCount = 0;
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
    this.contracts = new ContractRegistry(repositoryRoot, ORCHESTRATOR_RUNTIME_CRITICAL_PATHS);
    this.codexCommand = process.env.PROTO_COMPASSROSE_CODEX_COMMAND ?? 'codex';
    this.opencodeCommand = process.env.PROTO_COMPASSROSE_OPENCODE_COMMAND ?? 'opencode';
    this.codex = new CodexCli(repositoryRoot, this.codexCommand);
    this.opencode = new OpenCodeCli(repositoryRoot, this.opencodeCommand);
    this.implementer = options.implementer === 'codex' ? this.codex : this.opencode;
    this.skipCleanWorktreeCheck = process.env.PROTO_COMPASSROSE_SKIP_CLEAN_CHECK === '1';

    const configurationPath = join(repositoryRoot, 'docs', 'compassrose', 'CONFIG.md');
    const configuration = readProjectConfiguration(configurationPath);
    if (!configuration.ok) {
      throw new Error(`Unable to load project configuration from ${configurationPath}.`);
    }

    this.projectConfiguration = configuration.value;
    this.configurationPath = configurationPath;
    const projectConfiguration = this.projectConfiguration;
    const documentation = projectConfiguration.documentation as Record<string, unknown>;
    const limitsCandidate = projectConfiguration.limits;
    const limits = isRecord(limitsCandidate) ? limitsCandidate : {};
    const projectStatePath = resolveRepositoryRelativePath(repositoryRoot, projectConfiguration.documentation.project_state);
    const featuresRoot = resolveRepositoryRelativePath(
      repositoryRoot,
      readRecordString(documentation, 'features_root') ?? 'docs/features',
    );
    const fixesRoot = resolveRepositoryRelativePath(
      repositoryRoot,
      readRecordString(documentation, 'fixes_root') ?? 'docs/fixes',
    );

    if (!projectStatePath || !featuresRoot || !fixesRoot) {
      throw new Error('Configuration paths for project state, features root, or fixes root are invalid.');
    }

    this.projectStatePath = projectStatePath;
    this.featuresRoot = featuresRoot;
    this.fixesRoot = fixesRoot;
    this.maxTasksPerRun = readPositiveInteger(limits, 'max_tasks_per_run') ?? Number.POSITIVE_INFINITY;
    this.maxReviewIterations = readPositiveInteger(limits, 'max_review_iterations') ?? 1;
    this.maxRecoveryIterations = readPositiveInteger(limits, 'max_recovery_iterations') ?? 3;
    this.runId = createRunId();
    this.startedAt = new Date().toISOString();
  }

  private buildAgentConfigurationSnapshot(): AgentInvocationContext['configuration'] {
    return {
      configuration_path: this.configurationPath,
      project_state_path: this.projectStatePath,
      features_root: this.featuresRoot,
      project_configuration: this.projectConfiguration,
      runtime_options: {
        loop: this.options.loop,
        commit: this.options.commit,
        implementer: this.options.implementer,
      },
      model_overrides: {
        codex_model: normalizeModelName(process.env.PROTO_COMPASSROSE_CODEX_MODEL),
        codex_planner_model: normalizeModelName(process.env.PROTO_COMPASSROSE_CODEX_PLANNER_MODEL),
        codex_implementer_model: normalizeModelName(process.env.PROTO_COMPASSROSE_CODEX_IMPLEMENTER_MODEL),
        opencode_model: resolveOpenCodeModel(),
      },
    };
  }

  private buildAgentWorkspaceSnapshot(): AgentInvocationContext['workspace'] {
    return {
      repository_root: this.repositoryRoot,
      head_commit: this.git.headCommit(),
      dirty_paths: this.git.dirtyPaths(),
    };
  }

  private buildAgentInvocationContext(
    context: Omit<AgentInvocationContext, 'run_id' | 'recorded_at' | 'configuration' | 'workspace'>,
  ): AgentInvocationContext {
    return {
      ...context,
      run_id: this.runId,
      recorded_at: new Date().toISOString(),
      configuration: this.buildAgentConfigurationSnapshot(),
      workspace: this.buildAgentWorkspaceSnapshot(),
    };
  }

  private recordAgentInvocationContext(context: AgentInvocationContext): void {
    const baseName = [
      String(++this.agentInvocationCount).padStart(3, '0'),
      slugify(context.kind) || 'agent',
      slugify(context.label) || 'invocation',
    ].join('-');
    const root = join('logs', 'agent-contexts', this.runId);
    this.artifacts.writeJson(join(root, `${baseName}.json`), context);
    this.artifacts.writeRawText(join(root, `${baseName}.prompt.txt`), context.prompt);
    console.log(
      `[${context.role}:${context.kind}] agent context saved at ${relativePath(this.repositoryRoot, join(root, `${baseName}.json`))}`,
    );
  }

  run(): number {
    const cleanupStopHandlers = this.installControlledStopHandlers();
    let keepRunning = true;
    let lastDecision: StepDecision | null = null;

    try {
      while (keepRunning) {
        this.throwIfControlledStopRequested();
        const restartExitCode = this.refreshContractsAtCheckpoint('loop-start');
        if (restartExitCode !== null) {
          return restartExitCode;
        }

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

  private refreshContractsAtCheckpoint(checkpoint: string): number | null {
    const refresh = this.contracts.refresh();

    if (refresh.reloadedSchemas.length > 0) {
      console.log(`Reloaded contract schemas at ${checkpoint}: ${refresh.reloadedSchemas.join(', ')}`);
    }

    if (!refresh.restartRequired) {
      return null;
    }

    const reason = `Runtime restart required at ${checkpoint} because runtime-critical files changed: ${refresh.restartReasons.join(', ')}.`;
    console.log(reason);
    this.writeRunSummary('stopped', 0, null);
    return this.restartProcess(reason);
  }

  private restartProcess(reason: string): number {
    const restartDepth = Number.parseInt(process.env.PROTO_COMPASSROSE_RESTART_DEPTH ?? '0', 10) || 0;
    if (restartDepth >= 3) {
      throw new Error(`Refusing to restart the prototype more than 3 times in one run. Last reason: ${reason}`);
    }

    const args = [
      ...process.execArgv,
      ...process.argv.slice(1),
    ];
    const result = spawnSync(process.execPath, args, {
      cwd: this.repositoryRoot,
      env: {
        ...process.env,
        PROTO_COMPASSROSE_RESTART_DEPTH: String(restartDepth + 1),
      },
      stdio: 'inherit',
    });

    if (result.signal === 'SIGINT' || result.signal === 'SIGTERM') {
      return stopExitCodeForSignal(result.signal);
    }

    if (result.error) {
      throw result.error;
    }

    return result.status ?? 1;
  }

  private isStartableInspectionKind(kind: WorkItemInspectionKind): boolean {
    return kind === 'request_pending' || kind === 'formalization_pending' || kind === 'formalized' || kind === 'task_planning_pending';
  }

  private isContinuingInspectionKind(kind: WorkItemInspectionKind): boolean {
    // 'blocked_on_fix' is deliberately neither startable nor continuing: it must be invisible to
    // both scheduler passes while the blocking fix is unresolved, so other features/fixes keep
    // making progress instead of this one being retried (and re-diagnosed) every run.
    return kind !== 'completed' && kind !== 'blocked_on_fix' && !this.isStartableInspectionKind(kind);
  }

  private static readonly FIX_SEVERITY_RANK: Record<FixSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  /**
   * Two-pass scheduler so severity can affect what starts next without ever aborting
   * something already in flight (confirmed policy -- see docs/fixes/README.md):
   *
   * Pass 1 scans for anything already mid-execution -- features first in today's exact
   * numeric order, then fixes -- and resumes the first one found, regardless of severity.
   * Pass 2 only runs when nothing is in flight, and decides what to START next in strict
   * tier order: critical/high fixes, then features (today's exact numeric-order scan,
   * unchanged), then medium/low fixes as ordinary backlog.
   *
   * Note: this intentionally changes ordering versus the old single-pass scan even when zero
   * fixes exist -- today, a lower-numbered *startable* feature wins over a higher-numbered
   * *continuing* one, because the old scan never distinguished the two. This two-pass split
   * makes the continuing one win instead, which is the deliberate, tested behavior change this
   * phase bundles in (see tests/schedulerPriority.test.ts).
   */
  private determineNextStep(): StepDecision {
    const featureInspections = this.listFeatures().map((feature) => ({ feature, inspection: this.inspectFeature(feature) }));
    const fixInspections = this.listFixes().map((fix) => ({ fix, inspection: this.inspectFix(fix) }));

    for (const { feature, inspection } of featureInspections) {
      if (this.isContinuingInspectionKind(inspection.kind)) {
        const decision = this.selectStepForFeature(feature);
        if (decision) {
          return decision;
        }
      }
    }

    for (const { fix, inspection } of fixInspections) {
      if (this.isContinuingInspectionKind(inspection.kind)) {
        const decision = this.selectStepForFix(fix);
        if (decision) {
          return decision;
        }
      }
    }

    const [mostSevereFix] = fixInspections
      .filter(({ inspection }) => this.isStartableInspectionKind(inspection.kind) && (inspection.severity === 'critical' || inspection.severity === 'high'))
      .sort((left, right) => CompassRoseOrchestrator.FIX_SEVERITY_RANK[left.inspection.severity] - CompassRoseOrchestrator.FIX_SEVERITY_RANK[right.inspection.severity]);
    if (mostSevereFix) {
      const decision = this.selectStepForFix(mostSevereFix.fix);
      if (decision) {
        return decision;
      }
    }

    for (const { feature, inspection } of featureInspections) {
      if (this.isStartableInspectionKind(inspection.kind)) {
        const decision = this.selectStepForFeature(feature);
        if (decision) {
          return decision;
        }
      }
    }

    const [firstMinorFix] = fixInspections.filter(
      ({ inspection }) => this.isStartableInspectionKind(inspection.kind) && (inspection.severity === 'medium' || inspection.severity === 'low'),
    );
    if (firstMinorFix) {
      const decision = this.selectStepForFix(firstMinorFix.fix);
      if (decision) {
        return decision;
      }
    }

    return {
      kind: 'stop',
      feature_id: null,
      task_id: null,
      correction_task_id: null,
      reason: 'No non-completed feature or fix remains.',
    };
  }

  private selectStepForFeature(feature: FeatureRecord): StepDecision | null {
    const inspection = this.inspectFeature(feature);

    switch (inspection.kind) {
      case 'completed':
        return null;
      case 'request_pending':
      case 'formalization_pending':
        return {
          kind: 'plan_feature',
          feature_id: feature.id,
          task_id: null,
          correction_task_id: null,
          reason: inspection.reason,
        };
      case 'formalized':
      case 'task_planning_pending':
        if (this.primaryTaskLimitReached()) {
          return {
            kind: 'stop',
            feature_id: feature.id,
            task_id: null,
            correction_task_id: null,
            reason: `Primary task limit reached for this run (${this.maxTasksPerRun}); stop before planning another normal task for feature ${feature.id}.`,
          };
        }

        return {
          kind: 'plan_task',
          feature_id: feature.id,
          task_id: null,
          correction_task_id: null,
          reason: inspection.reason,
        };
      case 'task_ready':
        return {
          kind: 'plan_subtask',
          feature_id: feature.id,
          task_id: requireNonNoneValue(inspection.snapshot?.activeTask, `Feature ${feature.id} requires active_task for task_ready.`),
          correction_task_id: null,
          reason: inspection.reason,
        };
      case 'unblock_pending':
        return {
          kind: 'doctor_recovery_task',
          feature_id: feature.id,
          task_id: requireNonNoneValue(inspection.snapshot?.activeUnblockTask, `Feature ${feature.id} requires active_unblock_task for unblock_pending.`),
          correction_task_id: null,
          reason: inspection.reason,
        };
      case 'implementation_running':
        return {
          kind: 'implement_subtask',
          feature_id: feature.id,
          task_id: requireNonNoneValue(inspection.snapshot?.activeTask, `Feature ${feature.id} requires active_task for implementation_running.`),
          correction_task_id: null,
          reason: inspection.reason,
        };
      case 'quality_gates_pending':
      case 'review_pending':
        return {
          kind: 'review_subtask',
          feature_id: feature.id,
          task_id: requireNonNoneValue(inspection.snapshot?.activeTask, `Feature ${feature.id} requires active_task for review.`),
          correction_task_id: null,
          reason: inspection.reason,
        };
      case 'correction_pending':
        return {
          kind: 'plan_subtask',
          feature_id: feature.id,
          task_id: requireNonNoneValue(
            inspection.snapshot?.activeCorrectionTask,
            `Feature ${feature.id} requires active_correction_task for correction_pending.`,
          ),
          correction_task_id: null,
          reason: inspection.reason,
        };
      case 'implementation_failed':
      case 'quality_failed':
      case 'review_failed':
      case 'blocked':
      case 'malformed':
        return {
          kind: 'diagnose_autocorrect',
          feature_id: feature.id,
          task_id: inspection.snapshot?.activeTask ?? null,
          correction_task_id: inspection.snapshot?.activeCorrectionTask ?? null,
          reason: inspection.reason,
        };
      case 'blocked_on_fix':
        throw new Error(
          `Feature ${feature.id} reached selectStepForFeature with kind 'blocked_on_fix', which determineNextStep's continuing/startable filters should never allow through.`,
        );
      default:
        return assertNever(inspection.kind);
    }
  }

  private inspectFeature(feature: FeatureRecord): FeatureInspection {
    const hasRequest = statSafeIsFile(feature.requestPath);
    const hasFeatureDoc = statSafeIsFile(feature.featurePath);
    const hasArchitectureDoc = statSafeIsFile(feature.architecturePath);
    const hasStateDoc = statSafeIsFile(feature.statePath);

    if (hasRequest && (!hasFeatureDoc || !hasArchitectureDoc || !hasStateDoc)) {
      return {
        kind: 'request_pending',
        reason: `Feature ${feature.id} is missing one or more formalized documents, so the runtime must formalize the request first.`,
        snapshot: null,
      };
    }

    if (!hasStateDoc) {
      return {
        kind: 'malformed',
        reason: `Feature ${feature.id} has no readable state.md outside a clean request_pending start, so diagnosis/autocorrection must decide the recovery path.`,
        snapshot: null,
      };
    }

    let snapshot: FeatureStateSnapshot;
    try {
      snapshot = this.readFeatureStateSnapshot(feature);
    } catch (error) {
      return {
        kind: 'malformed',
        reason: `Feature ${feature.id} state.md is malformed: ${errorMessage(error)}.`,
        snapshot: null,
      };
    }

    if ((!hasFeatureDoc || !hasArchitectureDoc) && snapshot.lifecycleState !== 'formalization_pending') {
      return {
        kind: 'malformed',
        reason: `Feature ${feature.id} is missing formalized feature documents while lifecycle state is ${snapshot.lifecycleState}; diagnosis/autocorrection must repair the inconsistency.`,
        snapshot,
      };
    }

    switch (snapshot.lifecycleState) {
      case 'request_pending':
        return {
          kind: 'request_pending',
          reason: `Feature ${feature.id} is waiting for formalization from request.md.`,
          snapshot,
        };
      case 'formalization_pending':
        return {
          kind: 'formalization_pending',
          reason: `Feature ${feature.id} is in formalization_pending and should resume formalization deterministically.`,
          snapshot,
        };
      case 'formalized':
        return {
          kind: 'formalized',
          reason: `Feature ${feature.id} is formalized and its next deterministic action is task planning.`,
          snapshot,
        };
      case 'task_planning_pending':
        return {
          kind: 'task_planning_pending',
          reason: `Feature ${feature.id} is waiting for exactly one next task to be planned.`,
          snapshot,
        };
      case 'task_ready':
        return snapshot.activeTask !== 'none'
          ? {
              kind: 'task_ready',
              reason: `Feature ${feature.id} is task_ready with active task ${snapshot.activeTask}.`,
              snapshot,
            }
          : {
              kind: 'malformed',
              reason: `Feature ${feature.id} is task_ready but active_task is missing, so diagnosis/autocorrection must restore the execution anchor.`,
              snapshot,
            };
      case 'unblock_pending':
        return snapshot.activeUnblockTask !== 'none'
          ? {
              kind: 'unblock_pending',
              reason: `Feature ${feature.id} is unblock_pending with active doctor recovery task ${snapshot.activeUnblockTask}.`,
              snapshot,
            }
          : {
              kind: 'malformed',
              reason: `Feature ${feature.id} is unblock_pending but active_unblock_task is missing, so diagnosis/autocorrection must restore the doctor recovery anchor.`,
              snapshot,
            };
      case 'implementation_running':
        return snapshot.activeTask !== 'none'
          ? {
              kind: 'implementation_running',
              reason: `Feature ${feature.id} is implementation_running for ${snapshot.activeTask} and should resume deterministically.`,
              snapshot,
            }
          : {
              kind: 'malformed',
              reason: `Feature ${feature.id} is implementation_running but active_task is missing, so diagnosis/autocorrection must decide whether to repair state or plan doctor recovery.`,
              snapshot,
            };
      case 'quality_gates_pending':
        return snapshot.activeTask !== 'none'
          ? {
              kind: 'quality_gates_pending',
              reason: `Feature ${feature.id} is quality_gates_pending for ${snapshot.activeTask}; the runtime should resume review-side validation deterministically.`,
              snapshot,
            }
          : {
              kind: 'malformed',
              reason: `Feature ${feature.id} is quality_gates_pending but active_task is missing, so diagnosis/autocorrection must restore the review anchor.`,
              snapshot,
            };
      case 'review_pending':
        return snapshot.activeTask !== 'none'
          ? {
              kind: 'review_pending',
              reason: `Feature ${feature.id} is review_pending for ${snapshot.activeTask}.`,
              snapshot,
            }
          : {
              kind: 'malformed',
              reason: `Feature ${feature.id} is review_pending but active_task is missing, so diagnosis/autocorrection must restore the review anchor.`,
              snapshot,
            };
      case 'correction_pending':
        return snapshot.activeCorrectionTask !== 'none'
          ? {
              kind: 'correction_pending',
              reason: `Feature ${feature.id} is correction_pending with correction task ${snapshot.activeCorrectionTask}.`,
              snapshot,
            }
          : {
              kind: 'malformed',
              reason: `Feature ${feature.id} is correction_pending but active_correction_task is missing, so diagnosis/autocorrection must restore the correction anchor.`,
              snapshot,
            };
      case 'implementation_failed':
        return {
          kind: 'implementation_failed',
          reason: `Feature ${feature.id} is in implementation_failed and needs diagnosis/autocorrection before normal execution can resume.`,
          snapshot,
        };
      case 'quality_failed':
        return {
          kind: 'quality_failed',
          reason: `Feature ${feature.id} is in quality_failed and needs diagnosis/autocorrection before normal execution can resume.`,
          snapshot,
        };
      case 'review_failed':
        return {
          kind: 'review_failed',
          reason: `Feature ${feature.id} is in review_failed and needs diagnosis/autocorrection before normal execution can resume.`,
          snapshot,
        };
      case 'blocked': {
        const blockingFixId = this.readBlockedOnFix(feature.statePath);
        if (blockingFixId) {
          if (this.isFixResolved(blockingFixId)) {
            this.resumeWorkItemBlockedOnFix(feature, snapshot, blockingFixId);
            return this.inspectFeature(feature);
          }

          return {
            kind: 'blocked_on_fix',
            reason: `Feature ${feature.id} is blocked pending fix ${blockingFixId}; skipping until it resolves instead of re-diagnosing every run.`,
            snapshot,
          };
        }

        return {
          kind: 'blocked',
          reason: `Feature ${feature.id} is blocked and needs diagnosis/autocorrection to choose bounded recovery or an explicit stop.`,
          snapshot,
        };
      }
      case 'completed':
        return {
          kind: 'completed',
          reason: `Feature ${feature.id} is completed.`,
          snapshot,
        };
      default:
        return {
          kind: 'malformed',
          reason: `Feature ${feature.id} has unknown lifecycle state ${snapshot.lifecycleState}, so diagnosis/autocorrection must repair or stop.`,
          snapshot,
        };
    }
  }

  private readFixSeverityAndOwnership(fix: Pick<WorkItemContext, 'statePath'>): { severity: FixSeverity; owningFeature: string | null } {
    try {
      const markdown = readUtf8(fix.statePath);
      const operationalStatus = requireSection(markdown, 'Operational Status');
      const rawSeverity = stripTicks(parsePreferredStatusValue(operationalStatus, 'severity') ?? '').toLowerCase();
      const severity: FixSeverity = rawSeverity === 'critical' || rawSeverity === 'high' || rawSeverity === 'medium' || rawSeverity === 'low'
        ? rawSeverity
        : 'medium';
      const rawOwningFeature = stripTicks(parsePreferredStatusValue(operationalStatus, 'owning_feature') ?? 'none');
      const owningFeature = rawOwningFeature === 'none' || rawOwningFeature === '' ? null : rawOwningFeature;
      return { severity, owningFeature };
    } catch {
      return { severity: 'medium', owningFeature: null };
    }
  }

  /**
   * Mirrors inspectFeature() exactly -- the lifecycle graph is container-agnostic (see
   * src/contracts/state/feature-state.md) -- minus the architecture.md presence check a fix
   * doesn't have, plus reading severity/owning_feature so the scheduler doesn't need to
   * re-parse fix.md prose on every tick.
   */
  private inspectFix(fix: FixRecord): FixInspection {
    const { severity, owningFeature } = this.readFixSeverityAndOwnership(fix);
    const hasRequest = statSafeIsFile(fix.requestPath);
    const hasFixDoc = statSafeIsFile(fix.fixPath);
    const hasStateDoc = statSafeIsFile(fix.statePath);

    if (hasRequest && (!hasFixDoc || !hasStateDoc)) {
      return {
        kind: 'request_pending',
        reason: `Fix ${fix.id} is missing one or more formalized documents, so the runtime must formalize the request first.`,
        snapshot: null,
        severity,
        owningFeature,
      };
    }

    if (!hasStateDoc) {
      return {
        kind: 'malformed',
        reason: `Fix ${fix.id} has no readable state.md outside a clean request_pending start, so diagnosis/autocorrection must decide the recovery path.`,
        snapshot: null,
        severity,
        owningFeature,
      };
    }

    let snapshot: FeatureStateSnapshot;
    try {
      snapshot = this.readFeatureStateSnapshot(fix);
    } catch (error) {
      return {
        kind: 'malformed',
        reason: `Fix ${fix.id} state.md is malformed: ${errorMessage(error)}.`,
        snapshot: null,
        severity,
        owningFeature,
      };
    }

    if (!hasFixDoc && snapshot.lifecycleState !== 'formalization_pending') {
      return {
        kind: 'malformed',
        reason: `Fix ${fix.id} is missing its formalized fix.md while lifecycle state is ${snapshot.lifecycleState}; diagnosis/autocorrection must repair the inconsistency.`,
        snapshot,
        severity,
        owningFeature,
      };
    }

    switch (snapshot.lifecycleState) {
      case 'request_pending':
        return { kind: 'request_pending', reason: `Fix ${fix.id} is waiting for formalization from request.md.`, snapshot, severity, owningFeature };
      case 'formalization_pending':
        return { kind: 'formalization_pending', reason: `Fix ${fix.id} is in formalization_pending and should resume formalization deterministically.`, snapshot, severity, owningFeature };
      case 'formalized':
        return { kind: 'formalized', reason: `Fix ${fix.id} is formalized and its next deterministic action is task planning.`, snapshot, severity, owningFeature };
      case 'task_planning_pending':
        return { kind: 'task_planning_pending', reason: `Fix ${fix.id} is waiting for exactly one next task to be planned.`, snapshot, severity, owningFeature };
      case 'task_ready':
        return snapshot.activeTask !== 'none'
          ? { kind: 'task_ready', reason: `Fix ${fix.id} is task_ready with active task ${snapshot.activeTask}.`, snapshot, severity, owningFeature }
          : { kind: 'malformed', reason: `Fix ${fix.id} is task_ready but active_task is missing, so diagnosis/autocorrection must restore the execution anchor.`, snapshot, severity, owningFeature };
      case 'unblock_pending':
        return snapshot.activeUnblockTask !== 'none'
          ? { kind: 'unblock_pending', reason: `Fix ${fix.id} is unblock_pending with active doctor recovery task ${snapshot.activeUnblockTask}.`, snapshot, severity, owningFeature }
          : { kind: 'malformed', reason: `Fix ${fix.id} is unblock_pending but active_unblock_task is missing, so diagnosis/autocorrection must restore the doctor recovery anchor.`, snapshot, severity, owningFeature };
      case 'implementation_running':
        return snapshot.activeTask !== 'none'
          ? { kind: 'implementation_running', reason: `Fix ${fix.id} is implementation_running for ${snapshot.activeTask} and should resume deterministically.`, snapshot, severity, owningFeature }
          : { kind: 'malformed', reason: `Fix ${fix.id} is implementation_running but active_task is missing, so diagnosis/autocorrection must decide whether to repair state or plan doctor recovery.`, snapshot, severity, owningFeature };
      case 'quality_gates_pending':
        return snapshot.activeTask !== 'none'
          ? { kind: 'quality_gates_pending', reason: `Fix ${fix.id} is quality_gates_pending for ${snapshot.activeTask}; the runtime should resume review-side validation deterministically.`, snapshot, severity, owningFeature }
          : { kind: 'malformed', reason: `Fix ${fix.id} is quality_gates_pending but active_task is missing, so diagnosis/autocorrection must restore the review anchor.`, snapshot, severity, owningFeature };
      case 'review_pending':
        return snapshot.activeTask !== 'none'
          ? { kind: 'review_pending', reason: `Fix ${fix.id} is review_pending for ${snapshot.activeTask}.`, snapshot, severity, owningFeature }
          : { kind: 'malformed', reason: `Fix ${fix.id} is review_pending but active_task is missing, so diagnosis/autocorrection must restore the review anchor.`, snapshot, severity, owningFeature };
      case 'correction_pending':
        return snapshot.activeCorrectionTask !== 'none'
          ? { kind: 'correction_pending', reason: `Fix ${fix.id} is correction_pending with correction task ${snapshot.activeCorrectionTask}.`, snapshot, severity, owningFeature }
          : { kind: 'malformed', reason: `Fix ${fix.id} is correction_pending but active_correction_task is missing, so diagnosis/autocorrection must restore the correction anchor.`, snapshot, severity, owningFeature };
      case 'implementation_failed':
        return { kind: 'implementation_failed', reason: `Fix ${fix.id} is in implementation_failed and needs diagnosis/autocorrection before normal execution can resume.`, snapshot, severity, owningFeature };
      case 'quality_failed':
        return { kind: 'quality_failed', reason: `Fix ${fix.id} is in quality_failed and needs diagnosis/autocorrection before normal execution can resume.`, snapshot, severity, owningFeature };
      case 'review_failed':
        return { kind: 'review_failed', reason: `Fix ${fix.id} is in review_failed and needs diagnosis/autocorrection before normal execution can resume.`, snapshot, severity, owningFeature };
      case 'blocked': {
        const blockingFixId = this.readBlockedOnFix(fix.statePath);
        if (blockingFixId) {
          if (this.isFixResolved(blockingFixId)) {
            this.resumeWorkItemBlockedOnFix(fix, snapshot, blockingFixId);
            return this.inspectFix(fix);
          }

          return {
            kind: 'blocked_on_fix',
            reason: `Fix ${fix.id} is blocked pending fix ${blockingFixId}; skipping until it resolves instead of re-diagnosing every run.`,
            snapshot,
            severity,
            owningFeature,
          };
        }

        return { kind: 'blocked', reason: `Fix ${fix.id} is blocked and needs diagnosis/autocorrection to choose bounded recovery or an explicit stop.`, snapshot, severity, owningFeature };
      }
      case 'completed':
        return { kind: 'completed', reason: `Fix ${fix.id} is completed.`, snapshot, severity, owningFeature };
      default:
        return { kind: 'malformed', reason: `Fix ${fix.id} has unknown lifecycle state ${snapshot.lifecycleState}, so diagnosis/autocorrection must repair or stop.`, snapshot, severity, owningFeature };
    }
  }

  private primaryTaskLimitReached(): boolean {
    return this.completedPrimaryTaskAnchors.size >= this.maxTasksPerRun;
  }

  /**
   * Mirrors selectStepForFeature() exactly, except the "start new work" kinds are plan_fix/
   * plan_fix_task instead of plan_feature/plan_task, and the primary-task budget is the same
   * shared this.completedPrimaryTaskAnchors counter/cap used for features (see
   * primaryTaskLimitReached()) -- one budget across both lifecycles, not a separate one per kind.
   */
  private selectStepForFix(fix: FixRecord): StepDecision | null {
    const inspection = this.inspectFix(fix);

    switch (inspection.kind) {
      case 'completed':
        return null;
      case 'request_pending':
      case 'formalization_pending':
        return {
          kind: 'plan_fix',
          feature_id: fix.id,
          task_id: null,
          correction_task_id: null,
          reason: inspection.reason,
        };
      case 'formalized':
      case 'task_planning_pending':
        if (this.primaryTaskLimitReached()) {
          return {
            kind: 'stop',
            feature_id: fix.id,
            task_id: null,
            correction_task_id: null,
            reason: `Primary task limit reached for this run (${this.maxTasksPerRun}); stop before planning another normal task for fix ${fix.id}.`,
          };
        }

        return {
          kind: 'plan_fix_task',
          feature_id: fix.id,
          task_id: null,
          correction_task_id: null,
          reason: inspection.reason,
        };
      case 'task_ready':
        return {
          kind: 'plan_subtask',
          feature_id: fix.id,
          task_id: requireNonNoneValue(inspection.snapshot?.activeTask, `Fix ${fix.id} requires active_task for task_ready.`),
          correction_task_id: null,
          reason: inspection.reason,
        };
      case 'unblock_pending':
        return {
          kind: 'doctor_recovery_task',
          feature_id: fix.id,
          task_id: requireNonNoneValue(inspection.snapshot?.activeUnblockTask, `Fix ${fix.id} requires active_unblock_task for unblock_pending.`),
          correction_task_id: null,
          reason: inspection.reason,
        };
      case 'implementation_running':
        return {
          kind: 'implement_subtask',
          feature_id: fix.id,
          task_id: requireNonNoneValue(inspection.snapshot?.activeTask, `Fix ${fix.id} requires active_task for implementation_running.`),
          correction_task_id: null,
          reason: inspection.reason,
        };
      case 'quality_gates_pending':
      case 'review_pending':
        return {
          kind: 'review_subtask',
          feature_id: fix.id,
          task_id: requireNonNoneValue(inspection.snapshot?.activeTask, `Fix ${fix.id} requires active_task for review.`),
          correction_task_id: null,
          reason: inspection.reason,
        };
      case 'correction_pending':
        return {
          kind: 'plan_subtask',
          feature_id: fix.id,
          task_id: requireNonNoneValue(
            inspection.snapshot?.activeCorrectionTask,
            `Fix ${fix.id} requires active_correction_task for correction_pending.`,
          ),
          correction_task_id: null,
          reason: inspection.reason,
        };
      case 'implementation_failed':
      case 'quality_failed':
      case 'review_failed':
      case 'blocked':
      case 'malformed':
        return {
          kind: 'diagnose_autocorrect',
          feature_id: fix.id,
          task_id: inspection.snapshot?.activeTask ?? null,
          correction_task_id: inspection.snapshot?.activeCorrectionTask ?? null,
          reason: inspection.reason,
        };
      case 'blocked_on_fix':
        throw new Error(
          `Fix ${fix.id} reached selectStepForFix with kind 'blocked_on_fix', which determineNextStep's continuing/startable filters should never allow through.`,
        );
      default:
        return assertNever(inspection.kind);
    }
  }

  private executeStep(decision: StepDecision): StepExecutionResult {
    switch (decision.kind) {
      case 'plan_feature':
        this.planFeature(requireString(decision.feature_id, 'feature_id'));
        return { exitCode: 0, continueLoop: true, summary: `Feature ${requireString(decision.feature_id, 'feature_id')} formalized.` };
      case 'plan_task':
        return this.planTask(requireString(decision.feature_id, 'feature_id'));
      case 'plan_fix':
        this.planFixRequest(requireString(decision.feature_id, 'feature_id'));
        return { exitCode: 0, continueLoop: true, summary: `Fix ${requireString(decision.feature_id, 'feature_id')} formalized.` };
      case 'plan_fix_task':
        return this.planFixTask(requireString(decision.feature_id, 'feature_id'));
      case 'plan_subtask':
        this.planSubtask(requireString(decision.task_id, 'task_id'));
        return { exitCode: 0, continueLoop: true, summary: `Subtask prepared for ${requireString(decision.task_id, 'task_id')}.` };
      case 'correct_state': {
        try {
          this.correctState(requireString(decision.feature_id, 'feature_id'), decision.reason);
          return { exitCode: 0, continueLoop: true, summary: `State correction task created for feature ${requireString(decision.feature_id, 'feature_id')}.` };
        } catch (error) {
          if (error instanceof StateCorrectionLimitReachedError) {
            return { exitCode: 2, continueLoop: false, summary: error.message };
          }
          throw error;
        }
      }
      case 'doctor_recovery_task':
        return this.runDoctorRecoveryTask(requireString(decision.task_id, 'task_id'));
      case 'unblock_task': {
        const unblockFeatureId = requireString(decision.feature_id, 'feature_id');
        try {
          this.planDoctorRecoveryTask(unblockFeatureId, decision.reason);
          return { exitCode: 0, continueLoop: true, summary: `Doctor recovery task planned for feature ${unblockFeatureId}.` };
        } catch (error) {
          if (error instanceof DoctorRecoveryLimitReachedError) {
            return { exitCode: 2, continueLoop: false, summary: error.message };
          }
          throw error;
        }
      }
      case 'diagnose_autocorrect':
        return this.diagnoseAndAutocorrect(requireString(decision.feature_id, 'feature_id'), decision.reason);
      case 'implement_task':
      case 'implement_subtask':
        return this.implementTask(requireString(decision.task_id, 'task_id'));
      case 'correct_task':
        return this.correctTask(requireString(decision.correction_task_id, 'correction_task_id'));
      case 'review_task':
      case 'review_subtask':
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
      // No trailing slash: isPathAllowedByPrefix (gitClient.ts) appends its own '/' when
      // checking a directory prefix, so a prefix that already ends in '/' never matches
      // anything inside it (a latent bug found and fixed alongside findDisallowedDirtyPaths()
      // below, which had the same mistake).
      `docs/features/${featureId}`,
    ]);
  }

  /**
   * Used by src/cli/main.ts's git_policy preflight instead of a blind "any dirty file fails"
   * check. git_policy's own setting name -- require_clean_worktree_BEFORE_TASK -- only makes
   * sense as a gate on STARTING new task-level work; it was previously enforced unconditionally
   * on every invocation, which meant a legitimately interrupted run (killed rather than
   * gracefully stopped, or resumed after any crash) could never resume without the
   * PROTO_COMPASSROSE_SKIP_CLEAN_CHECK escape hatch, even though the dirty tree was exactly the
   * active task's own recognized in-progress work -- exactly what
   * src/contracts/runtime/operation-loop.md's "Recovery After Interruption" section already
   * promises the runtime handles.
   *
   * Returns the empty array when the run is clear to proceed: either the tree is fully clean,
   * or `determineNextStep()`'s next decision continues an already-active task/fix (in which
   * case dirty paths are allowed under the active work item's own docs directory,
   * PROJECT_STATE.md, and the active task's own declared `allowed_paths`). Returns the list of
   * genuinely disallowed dirty paths when the next decision would start brand new work
   * (`plan_feature`/`plan_task`/`plan_fix`/`plan_fix_task`), which still requires a fully clean
   * tree, or when dirty paths fall outside an active task's own recognized footprint.
   */
  findDisallowedDirtyPaths(): string[] {
    const dirtyPaths = this.git.dirtyPaths();
    if (dirtyPaths.length === 0) {
      return [];
    }

    const decision = this.determineNextStep();
    const startingNewWorkKinds: readonly StepKind[] = ['plan_feature', 'plan_task', 'plan_fix', 'plan_fix_task'];
    if (startingNewWorkKinds.includes(decision.kind)) {
      return dirtyPaths;
    }

    const allowedPrefixes: string[] = ['docs/compassrose/PROJECT_STATE.md'];
    if (decision.feature_id) {
      allowedPrefixes.push(`docs/features/${decision.feature_id}`, `docs/fixes/${decision.feature_id}`);
    }

    if (decision.task_id) {
      try {
        const task = this.loadTask(decision.task_id);
        allowedPrefixes.push(...task.allowedPaths);
      } catch {
        // Fall back to the docs-only allowlist above if the active task can't be loaded.
      }
    }

    return this.git.findDisallowedDirtyPaths(allowedPrefixes);
  }

  /**
   * Reconciles the worktree when a new active task/scope is about to supersede a specific
   * previous task (`previousTaskId`) whose own attempt is being abandoned -- e.g. a
   * doctor-recovery task, or a state correction whose scope is always just the state docs,
   * replacing a failed implementation whose allowed_paths were wider. Left alone, that leftover
   * dirty diff falls outside every future run's active-task allowlist and blocks git_policy's
   * require_clean_worktree_before_task preflight in src/cli/main.ts forever, requiring manual
   * intervention. The abandoned attempt's diff is already archived under
   * .git/proto-compassrose/diffs/<taskId>.patch by the time a task reaches quality-gate failure
   * (see runQualityGates's callers), so discarding it here is safe.
   *
   * Deliberately narrow: only dirty paths that were within `previousTaskId`'s OWN declared
   * allowed_paths are ever candidates for discarding. A dirty file that was never that task's to
   * touch -- an unrelated in-progress edit, config change, or anything else -- is left alone no
   * matter how "out of the new scope" it looks, so this can never silently discard something
   * this specific recovery didn't cause. No-ops when `previousTaskId` is unset/'none' or can't be
   * loaded, since without a trusted old footprint there's nothing safe to reconcile.
   */
  private reconcileDirtyPathsForNewScope(featureId: string, previousTaskId: string | null, newAllowedPaths: readonly string[]): void {
    if (!previousTaskId || previousTaskId === 'none') {
      return;
    }

    const dirtyPaths = this.git.dirtyPaths();
    if (dirtyPaths.length === 0) {
      return;
    }

    let previousAllowedPaths: readonly string[];
    try {
      previousAllowedPaths = this.loadTask(previousTaskId).allowedPaths;
    } catch {
      return;
    }

    const withinPreviousFootprint = dirtyPaths.filter((path) => isPathAllowedByPrefix(path, previousAllowedPaths));
    if (withinPreviousFootprint.length === 0) {
      return;
    }

    const newAllowedPrefixes = [
      'docs/compassrose/PROJECT_STATE.md',
      `docs/features/${featureId}`,
      `docs/fixes/${featureId}`,
      ...newAllowedPaths,
    ];

    const orphaned = withinPreviousFootprint.filter((path) => !isPathAllowedByPrefix(path, newAllowedPrefixes));
    if (orphaned.length === 0) {
      return;
    }

    console.error(
      `Reconciling worktree for ${featureId}: discarding ${orphaned.length} dirty path(s) left by superseded attempt ${previousTaskId}, outside the new active task's scope (already archived under .git/proto-compassrose/diffs/): ${orphaned.join(', ')}`,
    );
    this.git.discardDirtyPaths(orphaned);
  }

  private planFeature(featureId: string): void {
    this.ensureCleanWorktreeIfRequired(featureId);
    const feature = this.loadFeature(featureId);
    const siblingFeatures = buildSiblingFeatureIndex(this.featuresRoot, featureId);
    const sourcePaths = [
      'src/contracts/planner/feature-planning-prompt.md',
      relativePath(this.repositoryRoot, feature.requestPath),
      'docs/compassrose/PROJECT_STATE.md',
      'docs/compassrose/CONFIG.md',
      'docs/features/README.md',
      'docs/templates/feature.md',
      'docs/templates/architecture.md',
      'docs/templates/state.md',
      'src/contracts/state/feature-state.md',
      'src/contracts/planner/feature-scope-guard.md',
      'docs/ROADMAP.md',
      'docs/SAD.md',
      'docs/ADR.md',
      'docs/DMS.md',
    ];
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
      '- `src/contracts/planner/feature-scope-guard.md`',
      '- `docs/ROADMAP.md`',
      '- `docs/SAD.md`',
      '- `docs/ADR.md`',
      '- `docs/DMS.md`',
      '',
      'Sibling features (use these to fill each task request\'s `sibling_check`; do not pre-claim scope one of them already owns):',
      ...(siblingFeatures.length > 0
        ? siblingFeatures.map((sibling) => `- ${sibling.featureId}: ${sibling.title} — ${sibling.summary || 'no summary available'}`)
        : ['- none']),
      '',
      'Return JSON with complete Markdown for `feature.md`, `architecture.md`, and `state.md`, plus `task_requests`.',
      '',
      'Rules for `task_requests`:',
      '- Break the feature\'s implementation into a fixed, ordered series of task requests — pre-declared, locked-in boundaries for future tasks, not the tasks themselves.',
      '- Give each one an `id` matching its position ("1", "2", ...), a `title`, and an `objective` narrower than the feature\'s own goal but broader than a single task.',
      '- Decide `scope.allowed_paths`/`forbidden_paths` for each holistically, now, while you have full feature and architecture context — this boundary constrains whatever later plans that request into an actual task.',
      '- Every `allowed_paths` list must include both the primary implementation path prefix and a paired test path prefix (e.g. `src/config/` and `tests/`), since elaboration will need to add tests whose exact filenames aren\'t known yet.',
      '- Fill `sibling_check` by applying `src/contracts/planner/feature-scope-guard.md`\'s reasoning to this task request specifically: set `belongs_to_other_feature` honestly if a sibling feature above describes it more specifically than this feature\'s own scope, and list every sibling you actually considered in `considered_features`.',
      '- Set every `status` to `not_started`.',
      '- Do not hand-author `feature.md`\'s `## Implementation Outline` section carefully — the orchestrator regenerates it deterministically from `task_requests`; a placeholder there is fine.',
      '',
      'Do not modify files.',
    ].join('\n');

    this.recordAgentInvocationContext(this.buildAgentInvocationContext({
      role: 'planner',
      kind: 'feature_planning',
      label: `planner:feature-plan:${featureId}`,
      feature_id: featureId,
      task_id: null,
      source_paths: sourcePaths,
      prompt,
      tool: {
        name: 'codex',
        command: this.codexCommand,
        model: resolveCodexPlannerModel(),
        output_schema_id: 'feature_plan',
      },
    }));

    const planned = this.codex.runStructured<PlannedFeatureDocs>(
      prompt,
      this.contracts.schema('feature_plan'),
      [],
      `planner:feature-plan:${featureId}`,
    );
    const featureMarkdownWithOutline = replaceSection(
      planned.feature_md,
      'Implementation Outline',
      renderImplementationOutlineMarkdown(planned.task_requests),
    );
    writeText(feature.featurePath, ensureTrailingNewline(featureMarkdownWithOutline));
    writeText(feature.architecturePath, ensureTrailingNewline(planned.architecture_md));
    writeText(feature.statePath, ensureTrailingNewline(planned.state_md));
    this.artifacts.writeJson(join('task-requests', `${featureId}.json`), planned.task_requests);

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

  /**
   * Mirrors planFeature(), narrower: no docs/ROADMAP.md/SAD.md/ADR.md/DMS.md reads (a fix
   * repairs already-shipped behavior rather than introducing new architectural surface), and
   * produces fix.md + state.md only -- no architecture.md. See
   * src/contracts/planner/fix-planning-prompt.md.
   */
  private planFixRequest(fixId: string): void {
    this.ensureCleanWorktreeIfRequired(fixId);
    const fix = this.loadFix(fixId);
    const sourcePaths = [
      'src/contracts/planner/fix-planning-prompt.md',
      relativePath(this.repositoryRoot, fix.requestPath),
      'docs/compassrose/PROJECT_STATE.md',
      'docs/compassrose/CONFIG.md',
      'docs/fixes/README.md',
      'docs/templates/fix.md',
      'docs/templates/state.md',
      'src/contracts/state/feature-state.md',
    ];
    const prompt = [
      'Act as the CompassRose Planner.',
      '',
      `Formalize fix \`${fixId}\`.`,
      '',
      'Read only:',
      '- `src/contracts/planner/fix-planning-prompt.md`',
      `- \`${relativePath(this.repositoryRoot, fix.requestPath)}\``,
      '- `docs/compassrose/PROJECT_STATE.md`',
      '- `docs/compassrose/CONFIG.md`',
      '- `docs/fixes/README.md`',
      '- `docs/templates/fix.md`',
      '- `docs/templates/state.md`',
      '- `src/contracts/state/feature-state.md` (read "feature" as "fix" throughout; this fix has no architecture.md)',
      '',
      'Return JSON with complete Markdown for `fix.md` and `state.md`.',
      'Assign `severity` (critical|high|medium|low) and `owning_feature` (a feature id, or `none` if transversal) honestly, and include both as `## Operational Status` bullets in `state.md`.',
      'Do not modify files.',
    ].join('\n');

    this.recordAgentInvocationContext(this.buildAgentInvocationContext({
      role: 'planner',
      kind: 'feature_planning',
      label: `planner:fix-plan:${fixId}`,
      feature_id: fixId,
      task_id: null,
      source_paths: sourcePaths,
      prompt,
      tool: {
        name: 'codex',
        command: this.codexCommand,
        model: resolveCodexPlannerModel(),
        output_schema_id: 'fix_plan',
      },
    }));

    const planned = this.codex.runStructured<PlannedFixDocs>(
      prompt,
      this.contracts.schema('fix_plan'),
      [],
      `planner:fix-plan:${fixId}`,
    );
    writeText(fix.fixPath, ensureTrailingNewline(planned.fix_md));
    writeText(fix.statePath, ensureTrailingNewline(planned.state_md));

    const updatedProjectState = this.updateProjectStateForFixPlan(fixId);
    writeText(this.projectStatePath, updatedProjectState);

    if (this.options.commit) {
      this.git.commit(
        [
          relativePath(this.repositoryRoot, fix.fixPath),
          relativePath(this.repositoryRoot, fix.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
        ],
        `proto: formalize fix ${fixId}`,
      );
    }
  }

  /**
   * Single steady-state path: ensure a task-requests artifact exists (backfilling it once, if
   * this feature was formalized before task requests existed), then deterministically elaborate
   * the next one. If every task request is already complete/superseded, the fixed plan didn't
   * anticipate needing more work here -- block rather than silently inventing new scope.
   */
  private planTask(featureId: string): StepExecutionResult {
    this.ensureCleanWorktreeIfRequired(featureId);
    const feature = this.loadFeature(featureId);
    const existingTaskRequests = this.artifacts.readJson<TaskRequest[]>(join('task-requests', `${featureId}.json`));

    let taskRequests: TaskRequest[];
    if (existingTaskRequests) {
      taskRequests = existingTaskRequests;
    } else {
      const backfilled = this.backfillTaskRequests(featureId, feature);
      if (!Array.isArray(backfilled)) {
        return backfilled;
      }
      taskRequests = backfilled;
    }

    const nextRequest = selectNextTaskRequest(taskRequests);
    if (!nextRequest) {
      const reason = `Task planning for feature \`${featureId}\` was invoked, but every pre-declared task request is already complete or superseded. Formalize additional task requests before continuing.`;
      console.error(`Blocked: ${reason}`);
      this.recordBlockedFeature(featureId, reason);
      this.commitDirtyWorktreeIfConfigured(`proto: record exhausted task requests block for feature ${featureId}`);
      return { exitCode: 2, continueLoop: false, summary: reason };
    }

    return this.planTaskFromRequest(featureId, feature, nextRequest, taskRequests);
  }

  /**
   * One-time reconstruction of task_requests for a feature formalized before this mechanism
   * existed: the fixed reference is `feature.md`'s own Scope/Implementation Outline plus the
   * deterministically pre-computed list of task anchors that already exist under
   * `tasksDirectory` (ground truth handed to the planner, not guessed). The result is verified
   * (reconcileBackfilledTaskRequests) before being persisted -- every existing task anchor must
   * be accounted for, or the feature is blocked instead of silently starting from an baseline
   * that doesn't match repository reality.
   */
  private backfillTaskRequests(featureId: string, feature: FeatureRecord): TaskRequest[] | StepExecutionResult {
    const existingTaskAnchors = uniqueStrings(listExistingTaskIds(feature.tasksDirectory).map(primaryTaskAnchorFromId));
    const sourcePaths = [
      relativePath(this.repositoryRoot, feature.featurePath),
      relativePath(this.repositoryRoot, feature.statePath),
    ];
    const prompt = [
      'Act as the CompassRose Planner.',
      '',
      `Feature \`${featureId}\` was formalized before task requests existed as a structured concept. Reconstruct its \`task_requests\` from its existing Scope and Implementation Outline.`,
      '',
      'Read only:',
      `- \`${relativePath(this.repositoryRoot, feature.featurePath)}\``,
      `- \`${relativePath(this.repositoryRoot, feature.statePath)}\``,
      '',
      'Ground truth: task anchors that already exist for this feature (authoritative repository fact -- do not guess beyond this list, and do not omit any of it):',
      ...(existingTaskAnchors.length > 0 ? existingTaskAnchors.map((anchor) => `- ${anchor}`) : ['- none']),
      '',
      'Return a `task_requests` array reconstructing this feature\'s implementation outline as pre-declared, locked-in scope boundaries (see `TaskRequest` in `src/contracts/planner/plannerContracts.ts`).',
      '',
      'Rules:',
      '- Every task anchor listed above as ground truth must appear in exactly one task request\'s `covers_existing_task_ids`.',
      '- A task request whose `covers_existing_task_ids` is non-empty must have `status` `complete` or `in_progress` -- never `not_started`.',
      '- A task request with an empty `covers_existing_task_ids` must have `status` `not_started`.',
      '- Every `allowed_paths` list must include both the primary implementation path prefix and a paired test path prefix.',
      '- Fill `sibling_check` honestly; if `feature.md` doesn\'t give enough information to check against siblings, set `considered_features` to an empty list and `belongs_to_other_feature` to `null` rather than guessing.',
      '- Do not modify files.',
    ].join('\n');

    this.recordAgentInvocationContext(this.buildAgentInvocationContext({
      role: 'planner',
      kind: 'task_planning',
      label: `planner:task-requests-backfill:${featureId}`,
      feature_id: featureId,
      task_id: null,
      source_paths: sourcePaths,
      prompt,
      tool: {
        name: 'codex',
        command: this.codexCommand,
        model: resolveCodexPlannerModel(),
        output_schema_id: 'task_requests_backfill',
      },
    }));

    const backfilled = this.codex.runStructured<TaskRequestBackfillOutput>(
      prompt,
      this.contracts.schema('task_requests_backfill'),
      [],
      `planner:task-requests-backfill:${featureId}`,
    );

    const reconciliation = reconcileBackfilledTaskRequests(backfilled.task_requests, existingTaskAnchors);
    if (!reconciliation.ok) {
      const reason = `Backfilling task requests for feature \`${featureId}\` couldn't reconcile them against existing tasks: ${reconciliation.reason}.`;
      console.error(`Blocked: ${reason}`);
      this.recordBlockedFeature(featureId, reason);
      this.commitDirtyWorktreeIfConfigured(`proto: record task-request backfill block for feature ${featureId}`);
      return { exitCode: 2, continueLoop: false, summary: reason };
    }

    const taskRequests = stripBackfillMetadata(backfilled.task_requests);
    this.artifacts.writeJson(join('task-requests', `${featureId}.json`), taskRequests);
    return taskRequests;
  }

  private blockIfBelongsToOtherFeature(featureId: string, task: PlannedTask): StepExecutionResult | null {
    const belongsToOtherFeature = task.scope_justification?.belongs_to_other_feature ?? null;
    if (!belongsToOtherFeature) {
      return null;
    }

    const reason = `Task planning for feature \`${featureId}\` proposed \`${task.title}\`, which the planner identified as belonging to feature \`${belongsToOtherFeature}\` instead of this feature's own declared scope. Refusing to write the task; formalize or advance \`${belongsToOtherFeature}\` before retrying.`;
    console.error(`Blocked: ${reason}`);
    this.recordBlockedFeature(featureId, reason);
    this.commitDirtyWorktreeIfConfigured(`proto: record scope-guard block for feature ${featureId}`);
    return { exitCode: 2, continueLoop: false, summary: reason };
  }

  /**
   * persistBlockedFeature() only writes state.md/PROJECT_STATE.md to disk -- it doesn't commit
   * them. Every blocking path needs this same sweep-and-commit so a block never leaves the
   * worktree dirty for the next step's clean-worktree precondition (mirrors reviewTask()'s
   * blocked-review path, which already does this).
   */
  private commitDirtyWorktreeIfConfigured(message: string): void {
    if (!this.options.commit) {
      return;
    }

    const changedFiles = this.git.diffNameOnly();
    if (changedFiles.length > 0) {
      this.git.commit(changedFiles, message);
    }
  }

  private finalizeTaskPlan(
    featureId: string,
    feature: FeatureRecord,
    planned: PlannerOutput,
    taskRequestLink: { featureId: string; taskRequestId: string } | null = null,
  ): StepExecutionResult {
    const task = planned.task;
    validateTaskDeliverables(task, 'task');
    this.assertTaskIdIsUnused(feature.tasksDirectory, task.task_id, 'Task planning');

    const taskPath = join(feature.tasksDirectory, buildTaskFileName(task.task_id, task.title));
    const taskMarkdown = renderTaskMarkdown(task);

    this.writeTaskDocument(taskPath, taskMarkdown);
    this.artifacts.writeJson(join('tasks', `${task.task_id}.json`), planned);

    const updatedFeatureState = this.updateFeatureStateForTaskPlan(feature.statePath, task.task_id, task.title, taskRequestLink);
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

    return { exitCode: 0, continueLoop: true, summary: `Next task planned for feature ${featureId}.` };
  }

  /**
   * Legacy path: invents task scope fresh, exactly as planTask() always has, relying solely on
   * the self-reported scope_justification.belongs_to_other_feature check. Used only when the
   * feature has no task-requests artifact yet, or has exhausted the ones it has -- see
   * planTask()'s dispatch comment. Phase 4's backfill is meant to retire the "no artifact" case.
   */
  private planTaskFreely(featureId: string, feature: FeatureRecord): StepExecutionResult {
    const siblingFeatures = buildSiblingFeatureIndex(this.featuresRoot, featureId);
    const sourcePaths = [
      'src/contracts/planner/task-planning-prompt.md',
      'src/contracts/planner/input.md',
      'src/contracts/planner/output.md',
      'src/contracts/planner/feature-scope-guard.md',
      'src/contracts/state/feature-state.md',
      'src/contracts/task/task.md',
      relativePath(this.repositoryRoot, feature.featurePath),
      relativePath(this.repositoryRoot, feature.architecturePath),
      relativePath(this.repositoryRoot, feature.statePath),
      'docs/compassrose/PROJECT_STATE.md',
      'docs/compassrose/CONFIG.md',
      'src/contracts/runtime/operation-loop.md',
      'src/config/',
      'src/doctor/',
      'src/cli/main.ts',
      'tests/',
    ];
    const prompt = [
      'Act as the CompassRose Planner.',
      '',
      `Plan the next task for feature \`${featureId}\`.`,
      '',
      'Read only:',
      '- `src/contracts/planner/task-planning-prompt.md`',
      '- `src/contracts/planner/input.md`',
      '- `src/contracts/planner/output.md`',
      '- `src/contracts/planner/feature-scope-guard.md`',
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
      'Sibling features (do not duplicate their scope; name one in `scope_justification.belongs_to_other_feature` if the task you would otherwise plan actually belongs to it):',
      ...(siblingFeatures.length > 0
        ? siblingFeatures.map((sibling) => `- ${sibling.featureId}: ${sibling.title} — ${sibling.summary || 'no summary available'}`)
        : ['- none']),
      '',
      'Rules:',
      '- Generate exactly one atomic task.',
      '- Keep the task feature-scoped and reviewable.',
      '- If this task is a later version of an earlier task, set `previous_task_id` to that earlier task so the earlier task remains historical evidence; otherwise set it to `null`.',
      '- Use `test_guided` for implementation tasks that produce code.',
      '- `quality_gates.before_review` must contain runnable shell commands, not prose.',
      '- Any recovery lesson above is an unverified suggestion from a prior model call, not a confirmed requirement — only carry a suggested field, artifact, or mechanism into this task if it already exists in the contracts you were told to read; never invent a new manifest, validator, or artifact type to satisfy one.',
      '- Fill `scope_justification` by following `src/contracts/planner/feature-scope-guard.md`. Set `belongs_to_other_feature` honestly if a sibling feature above describes the task\'s real subject more specifically than this feature\'s own scope. Set `deviation_reason` to `null` -- it only applies when elaborating a pre-declared task request.',
      '- Return JSON only and do not modify files.',
    ].join('\n');

    this.recordAgentInvocationContext(this.buildAgentInvocationContext({
      role: 'planner',
      kind: 'task_planning',
      label: `planner:task-plan:${featureId}`,
      feature_id: featureId,
      task_id: null,
      source_paths: sourcePaths,
      prompt,
      tool: {
        name: 'codex',
        command: this.codexCommand,
        model: resolveCodexPlannerModel(),
        output_schema_id: 'planner_output',
      },
    }));

    const planned = this.codex.runStructured<PlannerOutput>(
      prompt,
      this.contracts.schema('planner_output'),
      [],
      `planner:task-plan:${featureId}`,
    );

    const blocked = this.blockIfBelongsToOtherFeature(featureId, planned.task);
    if (blocked) {
      return blocked;
    }

    return this.finalizeTaskPlan(featureId, feature, planned);
  }

  /**
   * Deterministic path: elaborates exactly one pre-declared task request (see
   * PlannedFeatureDocs.task_requests) into a task, within its already-vetted, locked-in scope
   * boundary -- the structural anti-drift mechanism this backbone plan exists to build. The
   * planner still needs real repository context to elaborate first_executable_step,
   * acceptance_criteria, etc., but only for the paths this task request already declared, not
   * the whole feature's context -- bounding what a single planning step needs to reason about.
   */
  private planTaskFromRequest(
    featureId: string,
    feature: FeatureRecord,
    taskRequest: TaskRequest,
    taskRequests: readonly TaskRequest[],
  ): StepExecutionResult {
    const sourcePaths = [
      'src/contracts/planner/task-planning-prompt.md',
      'src/contracts/planner/input.md',
      'src/contracts/planner/output.md',
      'src/contracts/state/feature-state.md',
      'src/contracts/task/task.md',
      relativePath(this.repositoryRoot, feature.featurePath),
      relativePath(this.repositoryRoot, feature.statePath),
      'docs/compassrose/PROJECT_STATE.md',
      'docs/compassrose/CONFIG.md',
      'src/contracts/runtime/operation-loop.md',
      ...taskRequest.scope.allowed_paths,
    ];
    const prompt = [
      'Act as the CompassRose Planner.',
      '',
      `Elaborate pre-declared task request ${taskRequest.id} ("${taskRequest.title}") for feature \`${featureId}\` into one executable task.`,
      '',
      'Read only:',
      '- `src/contracts/planner/task-planning-prompt.md`',
      '- `src/contracts/planner/input.md`',
      '- `src/contracts/planner/output.md`',
      '- `src/contracts/state/feature-state.md`',
      '- `src/contracts/task/task.md`',
      `- \`${relativePath(this.repositoryRoot, feature.featurePath)}\``,
      `- \`${relativePath(this.repositoryRoot, feature.statePath)}\``,
      '- `docs/compassrose/PROJECT_STATE.md`',
      '- `docs/compassrose/CONFIG.md`',
      '- `src/contracts/runtime/operation-loop.md`',
      ...taskRequest.scope.allowed_paths.map((path) => `- \`${path}\``),
      ...this.buildRecoveryLessonPromptLines(featureId),
      '',
      "This task request's pre-declared, locked-in boundary (decided once at feature formalization time):",
      `- objective: ${taskRequest.objective}`,
      'Allowed:',
      ...taskRequest.scope.allowed_paths.map((path) => `- \`${path}\``),
      'Forbidden:',
      ...taskRequest.scope.forbidden_paths.map((path) => `- \`${path}\``),
      '',
      'Rules:',
      '- Generate exactly one atomic task that elaborates this task request. Do not invent a different scope.',
      '- Keep `task.scope.allowed_paths` within the boundary above. If you genuinely must go beyond it, set `scope_justification.deviation_reason` to an honest, specific reason instead of silently expanding.',
      '- If this task is a later version of an earlier task, set `previous_task_id` to that earlier task so the earlier task remains historical evidence; otherwise set it to `null`.',
      '- Use `test_guided` for implementation tasks that produce code.',
      '- `quality_gates.before_review` must contain runnable shell commands, not prose.',
      '- Any recovery lesson above is an unverified suggestion from a prior model call, not a confirmed requirement — only carry a suggested field, artifact, or mechanism into this task if it already exists in the contracts you were told to read; never invent a new manifest, validator, or artifact type to satisfy one.',
      '- Set `scope_justification.included_by` to this task request\'s own objective and `excluded_by` to this task request\'s own forbidden paths; set `belongs_to_other_feature` only in the rare case that elaboration reveals this task request itself belongs to a different feature than formalization assumed; set `deviation_reason` per the rule above (an honest reason, or `null` if you stayed within bounds).',
      `- Set \`source_task_request_id\` to \`${taskRequest.id}\`.`,
      '- Return JSON only and do not modify files.',
    ].join('\n');

    this.recordAgentInvocationContext(this.buildAgentInvocationContext({
      role: 'planner',
      kind: 'task_planning',
      label: `planner:task-plan:${featureId}`,
      feature_id: featureId,
      task_id: null,
      source_paths: sourcePaths,
      prompt,
      tool: {
        name: 'codex',
        command: this.codexCommand,
        model: resolveCodexPlannerModel(),
        output_schema_id: 'planner_output',
      },
    }));

    const rawPlanned = this.codex.runStructured<PlannerOutput>(
      prompt,
      this.contracts.schema('planner_output'),
      [],
      `planner:task-plan:${featureId}`,
    );
    // Deterministic, not trusted from the LLM's own echo: this is the exact request we asked
    // it to elaborate, known with certainty regardless of what it echoed back.
    const planned: PlannerOutput = { task: { ...rawPlanned.task, source_task_request_id: taskRequest.id } };
    const task = planned.task;

    const blocked = this.blockIfBelongsToOtherFeature(featureId, task);
    if (blocked) {
      return blocked;
    }

    const containment = checkTaskRequestContainment(task.scope.allowed_paths, taskRequest);
    if (!containment.withinBounds) {
      const deviationReason = task.scope_justification?.deviation_reason ?? null;
      if (!deviationReason) {
        const reason = `Task planning for feature \`${featureId}\` elaborated task request ${taskRequest.id} ("${taskRequest.title}") with scope exceeding its pre-declared boundary: \`${containment.exceedingPaths.join('`, `')}\` ${containment.exceedingPaths.length === 1 ? 'is' : 'are'} not covered by \`${taskRequest.scope.allowed_paths.join('`, `')}\`. Refusing to write the task; either stay within the pre-declared boundary or set scope_justification.deviation_reason.`;
        console.error(`Blocked: ${reason}`);
        this.recordBlockedFeature(featureId, reason);
        this.commitDirtyWorktreeIfConfigured(`proto: record scope-boundary block for feature ${featureId}`);
        return { exitCode: 2, continueLoop: false, summary: reason };
      }

      console.log(
        `Task request ${taskRequest.id} scope widened for feature ${featureId} (deviation_reason: ${deviationReason}): ${containment.exceedingPaths.join(', ')}`,
      );
      this.artifacts.writeJson(
        join('task-requests', `${featureId}.json`),
        withWidenedScope(taskRequests, taskRequest.id, containment.exceedingPaths),
      );
    }

    return this.finalizeTaskPlan(featureId, feature, planned, { featureId, taskRequestId: taskRequest.id });
  }

  /**
   * Mirrors planTask(), narrower: no architecture.md reference (a fix has none), a sibling-fix
   * index instead of the sibling-feature index, and no scope_justification/feature-scope-guard
   * check -- that mechanism stays feature-only in v1 (see docs/fixes/README.md and the plan).
   * Fix-owned tasks reuse the same feature_id/`## Parent Feature` field a feature task already
   * uses (see resolveWorkItemContext()), with task ids prefixed `FX` instead of `F` so a task id
   * alone still tells a human which lifecycle it belongs to.
   */
  private planFixTask(fixId: string): StepExecutionResult {
    this.ensureCleanWorktreeIfRequired(fixId);
    const fix = this.loadFix(fixId);
    const siblingFixes = buildSiblingFeatureIndex(this.fixesRoot, fixId, 'fix.md');
    const sourcePaths = [
      'src/contracts/planner/task-planning-prompt.md',
      'src/contracts/planner/input.md',
      'src/contracts/planner/output.md',
      'src/contracts/state/feature-state.md',
      'src/contracts/task/task.md',
      relativePath(this.repositoryRoot, fix.fixPath),
      relativePath(this.repositoryRoot, fix.statePath),
      'docs/compassrose/PROJECT_STATE.md',
      'docs/compassrose/CONFIG.md',
      'src/contracts/runtime/operation-loop.md',
    ];
    const prompt = [
      'Act as the CompassRose Planner.',
      '',
      `Plan the next task for fix \`${fixId}\`.`,
      '',
      'Read only:',
      '- `src/contracts/planner/task-planning-prompt.md`',
      '- `src/contracts/planner/input.md`',
      '- `src/contracts/planner/output.md`',
      '- `src/contracts/state/feature-state.md`',
      '- `src/contracts/task/task.md`',
      `- \`${relativePath(this.repositoryRoot, fix.fixPath)}\``,
      `- \`${relativePath(this.repositoryRoot, fix.statePath)}\``,
      '- `docs/compassrose/PROJECT_STATE.md`',
      '- `docs/compassrose/CONFIG.md`',
      '- `src/contracts/runtime/operation-loop.md`',
      ...this.buildRecoveryLessonPromptLines(fixId),
      '',
      'Sibling fixes (avoid proposing a task that duplicates one already open):',
      ...(siblingFixes.length > 0
        ? siblingFixes.map((sibling) => `- ${sibling.featureId}: ${sibling.title} — ${sibling.summary || 'no summary available'}`)
        : ['- none']),
      '',
      'Rules:',
      '- Generate exactly one atomic task.',
      '- Keep the task scoped to this fix and reviewable.',
      '- Set `feature_id` to this fix\'s own id (`' + fixId + '`), exactly like a feature task would set it to a feature id.',
      '- If this task is a later version of an earlier task, set `previous_task_id` to that earlier task so the earlier task remains historical evidence; otherwise set it to `null`.',
      '- Use `test_guided` for implementation tasks that produce code.',
      '- `quality_gates.before_review` must contain runnable shell commands, not prose.',
      '- Prefix the task id `FX` instead of `F` (e.g. `FX' + fixId.split('-')[0] + '-T01`), so a task id alone always tells a human it belongs to a fix, not a feature.',
      '- Any recovery lesson above is an unverified suggestion from a prior model call, not a confirmed requirement — only carry a suggested field, artifact, or mechanism into this task if it already exists in the contracts you were told to read; never invent a new manifest, validator, or artifact type to satisfy one.',
      '- Set `scope_justification.belongs_to_other_feature` to `null`; that check is feature-only.',
      '- Set `source_task_request_id` to `null`; task requests are feature-only.',
      '- Return JSON only and do not modify files.',
    ].join('\n');

    this.recordAgentInvocationContext(this.buildAgentInvocationContext({
      role: 'planner',
      kind: 'task_planning',
      label: `planner:fix-task-plan:${fixId}`,
      feature_id: fixId,
      task_id: null,
      source_paths: sourcePaths,
      prompt,
      tool: {
        name: 'codex',
        command: this.codexCommand,
        model: resolveCodexPlannerModel(),
        output_schema_id: 'planner_output',
      },
    }));

    const rawPlanned = this.codex.runStructured<PlannerOutput>(
      prompt,
      this.contracts.schema('planner_output'),
      [],
      `planner:fix-task-plan:${fixId}`,
    );
    // Deterministic, not trusted from the LLM's own echo -- fixes never have task requests.
    const planned: PlannerOutput = { task: { ...rawPlanned.task, source_task_request_id: null } };
    const task = planned.task;

    validateTaskDeliverables(task, 'task');
    this.assertTaskIdIsUnused(fix.tasksDirectory, task.task_id, 'Fix task planning');

    const taskPath = join(fix.tasksDirectory, buildTaskFileName(task.task_id, task.title));
    const taskMarkdown = renderTaskMarkdown(task);

    this.writeTaskDocument(taskPath, taskMarkdown);
    this.artifacts.writeJson(join('tasks', `${task.task_id}.json`), planned);

    const updatedFixState = this.updateFeatureStateForTaskPlan(fix.statePath, task.task_id, task.title);
    const updatedProjectState = this.updateProjectStateForFixTaskPlan(fixId, task.task_id);

    writeText(fix.statePath, updatedFixState);
    writeText(this.projectStatePath, updatedProjectState);

    if (this.options.commit) {
      this.git.commit(
        [
          relativePath(this.repositoryRoot, taskPath),
          relativePath(this.repositoryRoot, fix.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
        ],
        `proto: plan task ${task.task_id}`,
      );
    }

    return { exitCode: 0, continueLoop: true, summary: `Next task planned for fix ${fixId}.` };
  }

  private planSubtask(taskId: string): void {
    const task = this.loadTask(taskId);
    this.ensureCleanWorktreeIfRequired(task.featureId);
    const owner = this.resolveWorkItemContext(task.featureId);

    writeText(owner.statePath, this.updateFeatureStateDuringImplementation(owner.statePath, task.taskId));
    writeText(this.projectStatePath, this.updateProjectStateDuringImplementation(task.featureId, task.taskId));

    if (this.options.commit) {
      this.git.commit(
        [
          relativePath(this.repositoryRoot, owner.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
        ],
        `proto: prepare subtask ${task.taskId}`,
      );
    }
  }

  private planDoctorRecoveryTask(featureId: string, reason: string): void {
    const owner = this.resolveWorkItemContext(featureId);
    const snapshot = this.readFeatureStateSnapshot(owner);

    // Enforce the configured recovery-cycle depth limit before spending a planner call: the
    // catastrophic 2026-06-28 incident (2,804 unbounded correction commits in one day) was this
    // same unbounded-loop failure mode on the sibling correction path -- see
    // limitStateCorrectionTaskId/StateCorrectionLimitReachedError for that guard. This is the
    // twin guard for doctor-recovery/unblock cycles, which had no ceiling at all.
    const priorAttempts = this.readDoctorRecoveryAttempts(owner.statePath);
    if (priorAttempts >= this.maxRecoveryIterations) {
      throw new DoctorRecoveryLimitReachedError(
        `Doctor recovery iteration limit reached for feature ${featureId} after ${this.maxRecoveryIterations} attempt(s) recovering the same blocked state; refusing to plan another doctor recovery task.`,
      );
    }

    const recoveryActiveTask = snapshot.lifecycleState === 'implementation_failed'
      ? this.resolveImplementationFailureActiveTask(owner, snapshot)
      : null;
    const blocker = this.buildBlockerProfile(snapshot, reason);
    const restorationTarget = snapshot.lifecycleState === 'implementation_failed'
      ? this.buildImplementationFailureRestorationTarget(owner, snapshot)
      : this.preferredRestorationTarget(snapshot);
    const sourcePaths = [
      'src/contracts/planner/doctor-recovery-planning-prompt.md',
      'src/contracts/planner/input.md',
      'src/contracts/planner/output.md',
      'src/contracts/state/feature-state.md',
      'src/contracts/task/doctor-recovery-task.md',
      'src/contracts/task/state-correction-task.md',
      relativePath(this.repositoryRoot, owner.definitionPath),
      ...(owner.architecturePath ? [relativePath(this.repositoryRoot, owner.architecturePath)] : []),
      relativePath(this.repositoryRoot, owner.statePath),
      ...(recoveryActiveTask ? [`.git/proto-compassrose/implementation-attempts/${recoveryActiveTask}.json`] : []),
      'docs/compassrose/PROJECT_STATE.md',
      'docs/compassrose/CONFIG.md',
      'src/contracts/runtime/operation-loop.md',
    ];
    const prompt = [
      'Act as the CompassRose Planner.',
      '',
      `Plan the next doctor recovery task for feature \`${featureId}\`.`,
      '',
      'Read only:',
      '- `src/contracts/planner/doctor-recovery-planning-prompt.md`',
      '- `src/contracts/planner/input.md`',
      '- `src/contracts/planner/output.md`',
      '- `src/contracts/state/feature-state.md`',
      '- `src/contracts/task/doctor-recovery-task.md`',
      '- `src/contracts/task/state-correction-task.md`',
      `- \`${relativePath(this.repositoryRoot, owner.definitionPath)}\``,
      ...(owner.architecturePath ? [`- \`${relativePath(this.repositoryRoot, owner.architecturePath)}\``] : []),
      `- \`${relativePath(this.repositoryRoot, owner.statePath)}\``,
      ...(recoveryActiveTask ? [`- \`.git/proto-compassrose/implementation-attempts/${recoveryActiveTask}.json\``] : []),
      '- `docs/compassrose/PROJECT_STATE.md`',
      '- `docs/compassrose/CONFIG.md`',
      '- `src/contracts/runtime/operation-loop.md`',
      ...this.buildLatestDiagnosticPromptLines(featureId),
      ...this.buildRecoveryLessonPromptLines(featureId, restorationTarget.active_task),
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
      '- Generate exactly one doctor recovery task.',
      '- Keep the task narrowly focused on removing the blocker or tightening the interface that caused it.',
      '- Allow documentation, state, source, and tests only when they are truly required by the recovery.',
      '- If the recovery task is a later version of an earlier task, set `previous_task_id` to that earlier task so the earlier task remains historical evidence; otherwise set it to `null`.',
      '- If the blocker is pure documentation or state drift, do not plan doctor recovery; use `correct_state` instead.',
      '- Mark the recovery as `doctor` with `no_review_loop` semantics.',
      '- The restoration target above is fixed by the runtime and represents forward progress, not the failed state the blocker was diagnosed from; do not propose a different one.',
      '- Use `test_guided` when the recovery produces code or tests.',
      '- `quality_gates.before_review` must contain runnable shell commands, not prose.',
      '- Any recovery lesson above is an unverified suggestion from a prior model call, not a confirmed requirement — only carry a suggested field, artifact, or mechanism into this task if it already exists in the contracts you were told to read; never invent a new manifest, validator, or artifact type to satisfy one.',
      '- Return JSON only and do not modify files.',
    ].join('\n');

    this.recordAgentInvocationContext(this.buildAgentInvocationContext({
      role: 'planner',
      kind: 'doctor_recovery_planning',
      label: `planner:doctor-recovery:${featureId}`,
      feature_id: featureId,
      task_id: recoveryActiveTask,
      source_paths: sourcePaths,
      prompt,
      tool: {
        name: 'codex',
        command: this.codexCommand,
        model: resolveCodexPlannerModel(),
        output_schema_id: 'planner_output',
      },
    }));

    const planned = this.codex.runStructured<PlannerOutput>(
      prompt,
      this.contracts.schema('planner_output'),
      [],
      `planner:doctor-recovery:${featureId}`,
    );
    const task = planned.task;
    validateTaskDeliverables(task, 'doctor recovery task');
    this.assertTaskIdIsUnused(owner.tasksDirectory, task.task_id, 'Doctor recovery planning');
    this.reconcileDirtyPathsForNewScope(featureId, snapshot.activeTask, task.scope.allowed_paths);

    const doctorRecoveryMetadata: DoctorRecoveryTaskMetadata = {
      blocker,
      restoration_target: {
        lifecycle_state: restorationTarget.lifecycle_state,
        active_task: restorationTarget.active_task,
        active_correction_task: restorationTarget.active_correction_task,
        active_unblock_task: 'none',
      },
      executor_role: 'doctor',
      review_policy: 'no_review_loop',
    };

    const taskPath = join(owner.tasksDirectory, buildTaskFileName(task.task_id, task.title));
    const taskMarkdown = renderDoctorRecoveryTaskMarkdown(task, doctorRecoveryMetadata);

    this.writeTaskDocument(taskPath, taskMarkdown);
    this.artifacts.writeJson(join('tasks', `${task.task_id}.json`), {
      ...planned,
      doctor_recovery: doctorRecoveryMetadata,
    });
    this.writeBlockerProfile(featureId, task.task_id, blocker, doctorRecoveryMetadata.restoration_target, reason);

    const updatedFeatureState = this.updateFeatureStateForDoctorRecovery(owner.statePath, task.task_id, restorationTarget, priorAttempts + 1);
    const updatedProjectState = this.updateProjectStateForDoctorRecovery(featureId, task.task_id, restorationTarget.lifecycle_state);
    writeText(owner.statePath, updatedFeatureState);
    writeText(this.projectStatePath, updatedProjectState);

    if (this.options.commit) {
      this.git.commit(
        [
          relativePath(this.repositoryRoot, taskPath),
          relativePath(this.repositoryRoot, owner.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
        ],
        `proto: plan doctor recovery ${featureId}`,
      );
    }
  }

  private buildImplementationFailureRestorationTarget(feature: Pick<WorkItemContext, 'id'>, snapshot: FeatureStateSnapshot): RestorationTarget {
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

  private diagnoseAndAutocorrect(featureId: string, reason: string): StepExecutionResult {
    const owner = this.resolveWorkItemContext(featureId);
    const decision = this.runDiagnosticAutocorrection(owner, reason);
    this.writeDiagnosticArtifact(decision);

    if (decision.next_step === 'correct_state') {
      if (!statSafeIsFile(owner.statePath)) {
        return {
          exitCode: 2,
          continueLoop: false,
          summary: `${decision.next_step_reason} The current runtime cannot generate a deterministic state-correction artifact because ${relativePath(this.repositoryRoot, owner.statePath)} is missing.`,
        };
      }

      this.correctState(featureId, decision.next_step_reason);
      return {
        exitCode: 0,
        continueLoop: true,
        summary: `Diagnostic/autocorrection applied a state correction for feature ${featureId}.`,
      };
    }

    if (decision.next_step === 'plan_doctor_recovery') {
      if (!this.tryReadFeatureStateSnapshot(owner)) {
        return {
          exitCode: 2,
          continueLoop: false,
          summary: `${decision.next_step_reason} The current runtime cannot plan doctor recovery because feature state is unreadable and no restoration target can be trusted.`,
        };
      }

      try {
        this.planDoctorRecoveryTask(featureId, decision.next_step_reason);
      } catch (error) {
        if (error instanceof DoctorRecoveryLimitReachedError) {
          return { exitCode: 2, continueLoop: false, summary: error.message };
        }
        throw error;
      }

      return {
        exitCode: 0,
        continueLoop: true,
        summary: `Diagnostic/autocorrection planned a doctor recovery task for feature ${featureId}.`,
      };
    }

    if (statSafeIsFile(owner.statePath)) {
      try {
        this.recordBlockedFeature(featureId, decision.next_step_reason);
      } catch {
        // Keep the diagnostic artifact even when the malformed state cannot be persisted as blocked state.
      }
    }

    console.error(decision.diagnosis_summary);
    return {
      exitCode: 2,
      continueLoop: false,
      summary: decision.next_step_reason,
    };
  }

  private runDiagnosticAutocorrection(feature: WorkItemContext, reason: string): DiagnosticAutocorrectionDecision {
    const stateExists = statSafeIsFile(feature.statePath);
    const snapshot = stateExists ? this.tryReadFeatureStateSnapshot(feature) : null;

    if (!snapshot) {
      return this.buildDeterministicStopDiagnosticDecision(
        this.buildMissingStateBlocker(feature, reason),
        feature,
        [
        relativePath(this.repositoryRoot, feature.statePath),
        relativePath(this.repositoryRoot, this.projectStatePath),
        'src/contracts/runtime/diagnostic-autocorrection.md',
        'src/contracts/runtime/operation-loop.md',
        ],
        reason,
        'The feature state is missing or unreadable, so the runtime cannot derive a trustworthy recovery target without guessing.',
      );
    }

    const recordedBlocker = this.readRecordedBlockerProfile(snapshot);
    const blocker = recordedBlocker ?? this.buildBlockerProfile(snapshot, reason);

    if (blocker.kind === 'state_corruption') {
      if (snapshot.lifecycleState === 'blocked') {
        const blockedFrom = snapshot.blockedFrom?.lifecycle_state && snapshot.blockedFrom.lifecycle_state !== 'none'
          ? snapshot.blockedFrom
          : null;

        if (blockedFrom) {
          const recoveryAnchor = snapshot.blockedFrom?.active_task && snapshot.blockedFrom.active_task !== 'none'
            ? snapshot.blockedFrom.active_task
            : snapshot.activeTask !== 'none'
              ? snapshot.activeTask
              : this.resolveStateCorrectionActiveTaskFromArtifacts(feature.id);
          const taskPath = recoveryAnchor ? this.tryFindTaskDocumentPath(recoveryAnchor, feature.tasksDirectory) : null;

          return this.buildDeterministicDoctorRecoveryDecision(feature, snapshot, blocker, reason, [
            relativePath(this.repositoryRoot, feature.statePath),
            relativePath(this.repositoryRoot, this.projectStatePath),
            'src/contracts/task/doctor-recovery-task.md',
            'src/contracts/runtime/operation-loop.md',
            taskPath ? relativePath(this.repositoryRoot, taskPath) : null,
          ]);
        }

        return this.buildDeterministicStopDiagnosticDecision(
          blocker,
          feature,
          [
            relativePath(this.repositoryRoot, feature.statePath),
            relativePath(this.repositoryRoot, this.projectStatePath),
            'src/contracts/runtime/diagnostic-autocorrection.md',
            'src/contracts/runtime/operation-loop.md',
          ],
          reason,
          'The feature is already blocked with recorded state-corruption evidence, so the runtime stops instead of generating another correction loop.',
        );
      }

      return this.buildDeterministicStateCorrectionDecision(feature, blocker, reason);
    }

    if (snapshot.lifecycleState === 'implementation_failed') {
      const activeTask = this.resolveImplementationFailureActiveTask(feature, snapshot);
      if (activeTask) {
        return this.buildDeterministicDoctorRecoveryDecision(feature, snapshot, blocker, reason, [
          relativePath(this.repositoryRoot, feature.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
          'src/contracts/task/doctor-recovery-task.md',
          'src/contracts/runtime/operation-loop.md',
          this.tryFindTaskDocumentPath(activeTask, feature.tasksDirectory)
            ? relativePath(this.repositoryRoot, this.tryFindTaskDocumentPath(activeTask, feature.tasksDirectory) as string)
            : null,
        ]);
      }

      return this.buildDeterministicStopDiagnosticDecision(
        blocker,
        feature,
        [
        relativePath(this.repositoryRoot, feature.statePath),
        relativePath(this.repositoryRoot, this.projectStatePath),
        'src/contracts/runtime/diagnostic-autocorrection.md',
        'src/contracts/runtime/operation-loop.md',
        ],
        reason,
        'The implementation failed, but the runtime could not recover a trusted active task anchor for bounded doctor recovery.',
      );
    }

    if (snapshot.lifecycleState === 'quality_failed' || snapshot.lifecycleState === 'review_failed' || snapshot.lifecycleState === 'blocked') {
      if (blocker.recoverability === 'terminal' || blocker.recoverability === 'human') {
        return this.buildDeterministicStopDiagnosticDecision(
          blocker,
          feature,
          [
          relativePath(this.repositoryRoot, feature.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
          'src/contracts/runtime/diagnostic-autocorrection.md',
          'src/contracts/runtime/operation-loop.md',
          ],
          reason,
          'The blocker is terminal or requires human intervention, so deterministic recovery stops here.',
        );
      }

      const recoveryAnchor = snapshot.activeTask !== 'none'
        ? snapshot.activeTask
        : snapshot.blockedFrom?.active_task && snapshot.blockedFrom.active_task !== 'none'
          ? snapshot.blockedFrom.active_task
          : this.resolveStateCorrectionActiveTaskFromArtifacts(feature.id);

      if (recoveryAnchor) {
        const taskPath = this.tryFindTaskDocumentPath(recoveryAnchor, feature.tasksDirectory);
        return this.buildDeterministicDoctorRecoveryDecision(feature, snapshot, blocker, reason, [
          relativePath(this.repositoryRoot, feature.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
          'src/contracts/task/doctor-recovery-task.md',
          'src/contracts/runtime/operation-loop.md',
          taskPath ? relativePath(this.repositoryRoot, taskPath) : null,
        ]);
      }

      return this.buildDeterministicStopDiagnosticDecision(
        blocker,
        feature,
        [
        relativePath(this.repositoryRoot, feature.statePath),
        relativePath(this.repositoryRoot, this.projectStatePath),
        'src/contracts/runtime/diagnostic-autocorrection.md',
        'src/contracts/runtime/operation-loop.md',
        ],
        reason,
        'The blocker looks recoverable, but the runtime could not recover a safe task anchor from state or recorded artifacts.',
      );
    }

    return this.buildDeterministicStopDiagnosticDecision(
      blocker,
      feature,
      [
      relativePath(this.repositoryRoot, feature.statePath),
      relativePath(this.repositoryRoot, this.projectStatePath),
      'src/contracts/runtime/diagnostic-autocorrection.md',
      'src/contracts/runtime/operation-loop.md',
      ],
      reason,
      'The runtime could not prove a safer deterministic recovery path, so it stops with a diagnostic instead of consulting an agent.',
    );
  }

  private readRecordedBlockerProfile(snapshot: FeatureStateSnapshot): BlockerProfile | null {
    const entries = snapshot.blockedBy
      .map((line) => line.replace(/^(?:-\s*)+/, '').trim())
      .filter((line) => line.length > 0);

    const kind = readValueFromStructuredLines(entries, 'kind');
    const signature = readValueFromStructuredLines(entries, 'signature');
    const recoverability = readValueFromStructuredLines(entries, 'recoverability');
    const observedState = readValueFromStructuredLines(entries, 'observed_state');
    const evidence = entries
      .filter((line) => line.startsWith('evidence:'))
      .map((line) => line.slice('evidence:'.length).trim())
      .filter((line) => line.length > 0);

    if (!kind || !signature || !recoverability) {
      return null;
    }

    if (!isBlockerKind(kind) || !isBlockerRecoverability(recoverability)) {
      return null;
    }

    return {
      kind,
      signature,
      recoverability,
      evidence: uniqueStrings([
        ...evidence,
        observedState ? `observed_state: ${observedState}` : `lifecycle=${snapshot.lifecycleState}`,
      ]),
      observed_state: observedState ?? `lifecycle=${snapshot.lifecycleState}`,
    };
  }

  private buildMissingStateBlocker(feature: WorkItemContext, reason: string): BlockerProfile {
    return {
      kind: 'state_corruption',
      signature: buildBlockerSignature('state_corruption', 'unknown', reason, [feature.id]),
      evidence: uniqueStrings([
        reason,
        `Feature state is missing or unreadable at ${relativePath(this.repositoryRoot, feature.statePath)}.`,
      ]),
      recoverability: 'terminal',
      observed_state: 'lifecycle=unknown',
    };
  }

  private buildDeterministicStateCorrectionDecision(
    feature: WorkItemContext,
    blocker: BlockerProfile,
    reason: string,
  ): DiagnosticAutocorrectionDecision {
    return {
      feature_id: feature.id,
      diagnosis_summary: 'The feature state is malformed, and the existing state-correction contract is sufficient to repair it directly.',
      blocker,
      next_step: 'correct_state',
      next_step_reason: reason,
      interface_response: {
        mode: 'none',
        summary: 'Apply the state-correction contract directly to restore a canonical feature state.',
        target_paths: [
          relativePath(this.repositoryRoot, feature.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
          'src/contracts/state/feature-state.md',
          'src/contracts/task/state-correction-task.md',
        ],
      },
    };
  }

  private buildDeterministicDoctorRecoveryDecision(
    feature: WorkItemContext,
    snapshot: FeatureStateSnapshot,
    blocker: BlockerProfile,
    reason: string,
    targetPaths: readonly (string | null)[],
  ): DiagnosticAutocorrectionDecision {
    const activeTask = snapshot.activeTask !== 'none'
      ? snapshot.activeTask
      : snapshot.blockedFrom?.active_task && snapshot.blockedFrom.active_task !== 'none'
        ? snapshot.blockedFrom.active_task
        : this.resolveStateCorrectionActiveTaskFromArtifacts(feature.id);

    return {
      feature_id: feature.id,
      diagnosis_summary: 'The blocker is recoverable, so the runtime should plan a bounded doctor recovery task instead of guessing or stopping early.',
      blocker,
      next_step: 'plan_doctor_recovery',
      next_step_reason: reason,
      interface_response: {
        mode: 'apply_in_doctor_recovery',
        summary: activeTask
          ? `Plan a bounded doctor recovery task that restores the recorded task anchor ${activeTask}.`
          : 'Plan a bounded doctor recovery task that preserves the current recovery evidence and re-entry target.',
        target_paths: uniqueStrings([
          ...targetPaths.filter((item): item is string => typeof item === 'string' && item.length > 0),
          relativePath(this.repositoryRoot, feature.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
          'src/contracts/task/doctor-recovery-task.md',
        ]),
      },
    };
  }

  private buildDeterministicStopDiagnosticDecision(
    blocker: BlockerProfile,
    feature: WorkItemContext,
    targetPaths: readonly (string | null)[],
    reason: string,
    summary: string,
  ): DiagnosticAutocorrectionDecision {
    return {
      feature_id: feature.id,
      diagnosis_summary: summary,
      blocker,
      next_step: 'stop_with_diagnostic',
      next_step_reason: reason,
      interface_response: {
        mode: 'manual_review',
        summary: 'Inspect the recorded state and diagnostic evidence before trying another automated recovery path.',
        target_paths: uniqueStrings([
          ...targetPaths.filter((item): item is string => typeof item === 'string' && item.length > 0),
        ]),
      },
    };
  }

  private ensureDiagnosticAutocorrectionDecision(
    feature: WorkItemContext,
    reason: string,
    decision: DiagnosticAutocorrectionDecision,
  ): DiagnosticAutocorrectionDecision {
    const blocker = decision?.blocker;
    const interfaceResponse = decision?.interface_response;

    if (
      !decision ||
      typeof decision.feature_id !== 'string' ||
      typeof decision.diagnosis_summary !== 'string' ||
      !blocker ||
      typeof blocker.kind !== 'string' ||
      typeof blocker.signature !== 'string' ||
      typeof blocker.recoverability !== 'string' ||
      !Array.isArray(blocker.evidence) ||
      typeof decision.next_step !== 'string' ||
      typeof decision.next_step_reason !== 'string' ||
      !interfaceResponse ||
      typeof interfaceResponse.mode !== 'string' ||
      typeof interfaceResponse.summary !== 'string' ||
      !Array.isArray(interfaceResponse.target_paths)
    ) {
      return this.buildDiagnosticFallbackDecision(
        feature,
        reason,
        'Diagnostic/autocorrection returned malformed structured output.',
      );
    }

    return this.normalizeDiagnosticAutocorrectionDecision(decision);
  }

  private normalizeDiagnosticAutocorrectionDecision(
    decision: DiagnosticAutocorrectionDecision,
  ): DiagnosticAutocorrectionDecision {
    const nextStep = (decision.next_step as string) === 'plan_unblock_task'
      ? 'plan_doctor_recovery'
      : decision.next_step;
    const interfaceMode = (decision.interface_response.mode as string) === 'apply_in_unblock_task'
      ? 'apply_in_doctor_recovery'
      : decision.interface_response.mode;

    return {
      ...decision,
      next_step: nextStep,
      interface_response: {
        ...decision.interface_response,
        mode: interfaceMode,
      },
    };
  }

  private buildDiagnosticFallbackDecision(
    feature: WorkItemContext,
    reason: string,
    cause: string,
  ): DiagnosticAutocorrectionDecision {
    return {
      feature_id: feature.id,
      diagnosis_summary: 'Diagnostic/autocorrection could not trust the structured output, so the runtime is stopping with a bounded diagnostic instead of crashing.',
      blocker: {
        kind: 'unknown',
        signature: `diagnostic-fallback-${feature.id}`,
        recoverability: 'terminal',
        evidence: [
          reason,
          cause,
          'The diagnostic/autocorrection contract requires a valid blocker.kind before recovery can continue.',
        ],
      },
      next_step: 'stop_with_diagnostic',
      next_step_reason: 'Diagnostic/autocorrection returned malformed or incomplete structured output, so the runtime is stopping with a diagnostic artifact for manual follow-up.',
      interface_response: {
        mode: 'manual_review',
        summary: 'No trusted interface response could be derived from the malformed diagnostic output.',
        target_paths: [
          'src/contracts/runtime/diagnostic-autocorrection.md',
          'src/contracts/runtime/operation-loop.md',
          'src/contracts/task/doctor-recovery-task.md',
        ],
      },
    };
  }

  private buildDiagnosticArtifactPromptLines(feature: WorkItemContext): string[] {
    const lines: string[] = [];
    const inspection = statSafeIsFile(feature.statePath) ? this.tryReadFeatureStateSnapshot(feature) : null;
    const activeTaskCandidates = uniqueStrings([
      inspection?.activeTask ?? 'none',
      inspection?.activeCorrectionTask ?? 'none',
      inspection?.activeUnblockTask ?? 'none',
    ].filter((value) => value !== 'none'));

    for (const taskId of activeTaskCandidates) {
      const taskPath = this.tryFindTaskDocumentPath(taskId, feature.tasksDirectory);
      if (taskPath) {
        lines.push(`- \`${relativePath(this.repositoryRoot, taskPath)}\``);
      }

      const artifactPaths = [
        join(this.repositoryRoot, '.git', 'proto-compassrose', 'implementations', `${taskId}.json`),
        join(this.repositoryRoot, '.git', 'proto-compassrose', 'implementation-attempts', `${taskId}.json`),
        join(this.repositoryRoot, '.git', 'proto-compassrose', 'quality-gates', `${taskId}.json`),
        join(this.repositoryRoot, '.git', 'proto-compassrose', 'reviews', `${taskId}.json`),
        join(this.repositoryRoot, '.git', 'proto-compassrose', 'task-interface-analysis', `${taskId}.json`),
      ];

      for (const artifactPath of artifactPaths) {
        if (statSafeIsFile(artifactPath)) {
          lines.push(`- \`${relativePath(this.repositoryRoot, artifactPath)}\``);
        }
      }
    }

    const latestRecoveryLesson = join(this.repositoryRoot, '.git', 'proto-compassrose', 'latest-recovery-lesson.json');
    if (statSafeIsFile(latestRecoveryLesson)) {
      lines.push(`- \`${relativePath(this.repositoryRoot, latestRecoveryLesson)}\``);
    }

    const latestRefinement = join(this.repositoryRoot, '.git', 'proto-compassrose', 'latest-refinement.json');
    if (statSafeIsFile(latestRefinement)) {
      lines.push(`- \`${relativePath(this.repositoryRoot, latestRefinement)}\``);
    }

    return uniqueStrings(lines);
  }

  private writeDiagnosticArtifact(decision: DiagnosticAutocorrectionDecision): void {
    const markdown = [
      `# Diagnostic: ${decision.feature_id}`,
      '',
      '## Summary',
      '',
      decision.diagnosis_summary,
      '',
      '## Blocker',
      '',
      `- kind: ${decision.blocker.kind}`,
      `- signature: ${decision.blocker.signature}`,
      `- recoverability: ${decision.blocker.recoverability}`,
      ...decision.blocker.evidence.map((item) => `- evidence: ${item}`),
      '',
      '## Next Step',
      '',
      `- action: ${decision.next_step}`,
      `- reason: ${decision.next_step_reason}`,
      '',
      '## Interface Response',
      '',
      `- mode: ${decision.interface_response.mode}`,
      `- summary: ${decision.interface_response.summary}`,
      ...decision.interface_response.target_paths.map((item) => `- target_path: ${item}`),
      '',
    ].join('\n');

    this.artifacts.writeJson(join('diagnostics', `${decision.feature_id}.json`), decision);
    this.artifacts.writeText(join('diagnostics', `${decision.feature_id}.md`), markdown);
    this.artifacts.writeJson('latest-diagnostic.json', decision);
    this.artifacts.writeText('latest-diagnostic.md', markdown);
  }

  private implementTask(taskId: string): StepExecutionResult {
    const task = this.loadTask(taskId);
    const result = this.executeImplementation(task, false, null);
    return result
      ?? {
          exitCode: 0,
          continueLoop: true,
          summary: `Implementation completed for ${taskId}.`,
        };
  }

  private correctTask(correctionTaskId: string): StepExecutionResult {
    const task = this.loadTask(correctionTaskId);
    const artifact = this.loadTaskArtifact(correctionTaskId);
    const result = this.executeImplementation(task, true, artifact?.state_correction ?? null);
    return result
      ?? {
          exitCode: 0,
          continueLoop: true,
          summary: `Correction implementation completed for ${correctionTaskId}.`,
        };
  }

  private runDoctorRecoveryTask(taskId: string): StepExecutionResult {
    const task = this.loadTask(taskId);
    const artifact = this.loadTaskArtifact(taskId);
    const doctorRecovery = artifact?.doctor_recovery ?? artifact?.unblock ?? task.doctorRecovery ?? task.unblock;
    if (!doctorRecovery) {
      throw new Error(`Doctor recovery task ${taskId} is missing recovery metadata.`);
    }

    return this.executeDoctorRecoveryTask(task, doctorRecovery);
  }

  private reviewTask(taskId: string): StepExecutionResult {
    const task = this.loadTask(taskId);
    const artifact = this.loadTaskArtifact(taskId);
    const stateCorrection = artifact?.state_correction ?? null;
    const doctorRecovery = artifact?.doctor_recovery ?? artifact?.unblock ?? null;
    const owner = this.resolveWorkItemContext(task.featureId);
    const qualityResults = this.ensureQualityGateResults(task);
    const implementation = this.ensureImplementationAttempt(task);
    // Exclude the runtime's own state-doc bookkeeping (written live to the working tree by
    // executeImplementation) from what the reviewer sees as "the submitted diff" — otherwise the
    // reviewer mistakes orchestrator bookkeeping for an implementer scope violation. Same exclusion
    // captureImplementationAttempt and ensureImplementationAttempt already apply.
    const reviewDiffExcludedPaths = [
      relativePath(this.repositoryRoot, owner.statePath),
      relativePath(this.repositoryRoot, this.projectStatePath),
      relativePath(this.repositoryRoot, owner.definitionPath),
      ...(owner.architecturePath ? [relativePath(this.repositoryRoot, owner.architecturePath)] : []),
      ...this.runtimeAuthoredTaskPaths,
    ];
    // Deterministic scope check, before the reviewer is ever invoked: a diff that reaches into
    // paths outside the task's own allowed_paths is a fact the runtime can establish with
    // certainty from the diff alone (see pathsExceedingPrefixes) -- it should never depend on an
    // LLM reviewer noticing it in prose. This is the same "never trust the model where a
    // deterministic check exists" principle behind blockOnUnrelatedFixFailure below.
    const changedFiles = this.git.diffNameOnly(reviewDiffExcludedPaths);
    const outOfScopePaths = pathsExceedingPrefixes(changedFiles, task.allowedPaths);
    if (outOfScopePaths.length > 0) {
      return this.blockOnDeterministicScopeViolation(owner, task, outOfScopePaths);
    }

    const liveDiff = this.git.diffPatch(reviewDiffExcludedPaths);
    const reviewDiff = selectReviewableDiffForReview(liveDiff, implementation);
    const agentContextRoot = join('logs', 'agent-contexts', this.runId);
    const implementationContextArtifactNames = selectImplementationContextArtifactNames(
      this.artifacts.listFiles(agentContextRoot).map((entry) => entry.name),
      taskId,
    );
    const implementationContextPaths = implementationContextArtifactNames.map((name) => join(agentContextRoot, name));
    const reviewContextPaths = reviewDiff.diff.trim().length === 0
      ? uniqueStrings([
          ...task.likelyAffectedFiles,
          ...task.reviewableDiffHandoff.requiredChangedFiles,
        ])
      : [];

    const tempDir = mkdtempSync(join(tmpdir(), 'proto-compassrose-review-'));
    const diffPath = join(tempDir, 'diff.patch');
    const qualityPath = join(tempDir, 'quality-gates.json');
    const implementationPath = join(tempDir, 'implementation.json');
    writeFileSync(diffPath, reviewDiff.diff, 'utf8');
    writeFileSync(qualityPath, `${JSON.stringify(qualityResults, null, 2)}\n`, 'utf8');
    writeFileSync(implementationPath, `${JSON.stringify(implementation, null, 2)}\n`, 'utf8');
    const sourcePaths = [
      'src/contracts/reviewer/review-prompt.md',
      'src/contracts/reviewer/input.md',
      'src/contracts/reviewer/output.md',
      ...(stateCorrection ? ['src/contracts/task/state-correction-task.md'] : ['src/contracts/task/correction-task.md']),
      ...(doctorRecovery ? ['src/contracts/task/doctor-recovery-task.md'] : []),
      ...reviewContextPaths,
      ...implementationContextPaths,
      relativePath(this.repositoryRoot, task.path),
      relativePath(this.repositoryRoot, owner.definitionPath),
      ...(owner.architecturePath ? [relativePath(this.repositoryRoot, owner.architecturePath)] : []),
      relativePath(this.repositoryRoot, owner.statePath),
      'docs/compassrose/CONFIG.md',
      diffPath,
      implementationPath,
      qualityPath,
    ];

    const prompt = [
      'Act as the CompassRose Reviewer.',
      '',
      `Review subtask \`${taskId}\` for feature \`${task.featureId}\`.`,
      '',
      'Read only:',
      '- `src/contracts/reviewer/review-prompt.md`',
      '- `src/contracts/reviewer/input.md`',
      '- `src/contracts/reviewer/output.md`',
      stateCorrection ? '- `src/contracts/task/state-correction-task.md`' : '- `src/contracts/task/correction-task.md`',
      doctorRecovery ? '- `src/contracts/task/doctor-recovery-task.md`' : null,
      task.reviewableDiffHandoff.requiredChangedFiles.length > 0
        ? `- Reviewable diff handoff expects these changed files: ${task.reviewableDiffHandoff.requiredChangedFiles.map((item) => `\`${item}\``).join(', ')}.`
        : '- Reviewable diff handoff does not require a specific changed file list.',
      implementationContextPaths.length > 0
        ? `- Implementation context artifacts for this attempt: ${implementationContextPaths.map((item) => `\`${item}\``).join(', ')}.`
        : '- No implementation context artifacts were found for this attempt.',
      '- Read the implementer context artifacts before deciding whether the task was already satisfied or the context was too restrictive.',
      ...reviewContextPaths.map((item) => `- \`${item}\``),
      `- \`${relativePath(this.repositoryRoot, task.path)}\``,
      `- \`${relativePath(this.repositoryRoot, owner.definitionPath)}\``,
      ...(owner.architecturePath ? [`- \`${relativePath(this.repositoryRoot, owner.architecturePath)}\``] : []),
      `- \`${relativePath(this.repositoryRoot, owner.statePath)}\``,
      '- `docs/compassrose/CONFIG.md`',
      `- \`${diffPath}\``,
      `- \`${implementationPath}\``,
      '- `implementation.implementation_notes` inside the implementation artifact (the field is named `implementation_notes`, not `notes`); if it is null or empty, treat that as an execution defect and report it explicitly.',
      `- \`${qualityPath}\``,
      '- if needed, only the files changed in the diff',
      reviewDiff.diff.trim().length === 0
        ? '- The live worktree diff is empty; compare the implementer context and the current repository state before rejecting, because the requested behavior may already have existed.'
        : null,
      reviewDiff.source === 'fallback'
        ? '- The live worktree diff is empty because the implementer appears to have committed away the reviewable diff before handoff.'
        : null,
      reviewDiff.source === 'fallback'
        ? '- The provided diff is a fallback capture from the commit created during the attempt; use it to diagnose the attempted change, not as proof that handoff requirements were satisfied.'
        : null,
      '',
      'Rules:',
      '- Validate objective, acceptance criteria, scope, constraints, and quality gates.',
      stateCorrection
        ? '- Validate the state target, restored lifecycle state, and active task pointer for the repaired state document.'
        : '- Validate the implementation against the subtask contract and acceptance criteria.',
      stateCorrection
        ? '- If status is `changes_required`, keep the correction task state-only and preserve the restored task pointer.'
        : '- For `test_guided` tasks, confirm that the diff includes meaningful test changes for the claimed behavior.',
      reviewDiff.source === 'fallback'
        ? '- Do not approve the attempt while the live reviewable diff is missing; treat the lost handoff as an execution defect even if the fallback diff looks correct.'
        : null,
      doctorRecovery ? '- If this is a doctor recovery task, verify that the blocker signature is resolved and the feature can resume from the captured lifecycle state without entering a reviewer loop for the recovery itself.' : null,
      '- Return JSON only.',
      '- If status is `changes_required`, include a correction task narrower than the original subtask.',
      '- Ground every field of that correction task in artifacts, fields, and mechanisms that already exist in the contracts you were told to read; do not invent a manifest, validator, or artifact type to describe the gap, even if that makes the finding sound less concrete — a correction that demands a fictional mechanism can never be satisfied.',
      '- Do not modify files.',
    ].join('\n');

    this.recordAgentInvocationContext(this.buildAgentInvocationContext({
      role: 'reviewer',
      kind: 'subtask_review',
      label: `reviewer:subtask:${taskId}`,
      feature_id: task.featureId,
      task_id: taskId,
      source_paths: sourcePaths,
      prompt,
      tool: {
        name: 'codex',
        command: this.codexCommand,
        model: resolveCodexPlannerModel(),
        output_schema_id: 'reviewer_output',
      },
    }));

    const review = this.codex.runStructured<ReviewerOutput>(
      prompt,
      this.contracts.schema('reviewer_output'),
      [tempDir],
      `reviewer:subtask:${taskId}`,
    );
    this.artifacts.writeJson(join('reviews', `${taskId}.json`), review);
    const taskInterfaceAnalysis = this.shouldAnalyzeTaskInterface(review)
      ? this.analyzeTaskInterface(task, owner, review, implementation, qualityResults, tempDir, stateCorrection, doctorRecovery)
      : null;

    if (taskInterfaceAnalysis && review.status !== 'approved') {
      this.recordRecoveryLesson(task, review, implementation, qualityResults, taskInterfaceAnalysis, review.correction_task?.correction_task_id ?? null);
    }

    if (review.status === 'approved') {
    const updatedFeatureState = stateCorrection
        ? this.updateFeatureStateAfterStateCorrection(owner.statePath, task.taskId, stateCorrection)
        : doctorRecovery
          ? this.updateFeatureStateAfterDoctorRecovery(owner.statePath, task, doctorRecovery)
          : this.updateFeatureStateAfterApprovedReview(owner.statePath, task);
      const updatedProjectState = stateCorrection
        ? this.updateProjectStateAfterStateCorrection(task.featureId, stateCorrection)
        : doctorRecovery
          ? this.updateProjectStateAfterDoctorRecovery(task.featureId, task.taskId, doctorRecovery.restoration_target)
          : this.updateProjectStateAfterApprovedReview(task.featureId, task.taskId);
      writeText(owner.statePath, updatedFeatureState);
      writeText(this.projectStatePath, updatedProjectState);

      if (!stateCorrection && !doctorRecovery) {
        this.completedPrimaryTaskAnchors.add(this.primaryTaskAnchor(task.taskId));
      }

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
      this.assertTaskIdIsUnused(owner.tasksDirectory, correction.correction_task_id, 'Review correction-task authoring');
      const correctionPath = this.writeCorrectionTask(correction);
      this.artifacts.writeJson(join('tasks', `${correction.correction_task_id}.json`), {
        task: correctionTaskToTask(correction),
      });

      const updatedFeatureState = this.updateFeatureStateForCorrection(owner.statePath, task.taskId, correction.correction_task_id);
      const updatedProjectState = this.updateProjectStateForCorrection(task.featureId, correction.correction_task_id);
      writeText(owner.statePath, updatedFeatureState);
      writeText(this.projectStatePath, updatedProjectState);

      if (this.options.commit) {
        // Sweep every changed file, not just the correction artifact and state docs: the rejected
        // implementer diff (e.g. src/cli/main.ts) is still live in the worktree at this point, and
        // leaving it uncommitted trips ensureCleanWorktreeIfRequired() on the very next step.
        const changedFiles = this.git.diffNameOnly();
        this.git.commit(changedFiles, `proto: request correction ${correction.correction_task_id}`);
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
      const recoverable = blocker.recoverability === 'agent' || blocker.recoverability === 'auto';
      const analysisSuffix = taskInterfaceAnalysis
        ? ' Task-interface analysis and a recovery lesson were recorded.'
        : '';

      if (this.options.commit) {
        // Same reasoning as the changes_required branch above: commit everything dirty so a
        // rejected implementer diff never blocks the next step's clean-worktree precondition.
        const changedFiles = this.git.diffNameOnly();
        this.git.commit(changedFiles, `proto: record blocked review for ${task.taskId}`);
      }

      if (this.options.loop) {
        const blockedSummary = recoverable
          ? `Recoverable blocker ${blocker.signature} recorded; diagnostic/autocorrection will continue through bounded recovery planning.`
          : `Terminal blocker ${blocker.signature} recorded; diagnostic/autocorrection will stop the run with a bounded diagnostic.`;

        if (recoverable) {
          console.log(blockedSummary);
        } else {
          console.error(blockedSummary);
        }

        return {
          exitCode: 0,
          continueLoop: true,
          summary: `${review.summary} ${blockedSummary}${analysisSuffix}`,
        };
      }

      const blockedSummary = recoverable
        ? `Recoverable blocker ${blocker.signature} recorded; running diagnostic/autocorrection before stopping because loop mode is disabled.`
        : `Terminal blocker ${blocker.signature} recorded; running diagnostic/autocorrection before stopping because loop mode is disabled.`;
      const diagnosticResult = this.diagnoseAndAutocorrect(task.featureId, blockedSummary);

      return {
        exitCode: diagnosticResult.exitCode,
        continueLoop: diagnosticResult.continueLoop,
        summary: `${review.summary} ${blockedSummary} ${diagnosticResult.summary}${analysisSuffix}`,
      };
    }

    console.error(review.summary);
    return {
      exitCode: 1,
      continueLoop: false,
      summary: taskInterfaceAnalysis ? `${review.summary} Task-interface analysis was recorded.` : review.summary,
    };
  }

  /**
   * Deterministic counterpart to the reviewer's own scope check: skips the reviewer entirely
   * (never spends the call, never risks it approving or mishandling the leak) and writes a
   * correction task whose only job is to remove the out-of-scope changes. Reuses the same
   * correction-id allocator and depth limit as ordinary reviewer-authored corrections
   * (buildStateCorrectionTaskId), so a task that keeps leaking scope on every retry still
   * terminates instead of looping forever.
   */
  private blockOnDeterministicScopeViolation(
    owner: WorkItemContext,
    task: ParsedTaskDocument,
    outOfScopePaths: readonly string[],
  ): StepExecutionResult {
    const correctionTaskId = this.buildStateCorrectionTaskId(owner.tasksDirectory, task.taskId);
    if (correctionTaskId === null) {
      return {
        exitCode: 2,
        continueLoop: false,
        summary: `Correction iteration limit reached for feature ${task.featureId} after ${this.maxReviewIterations} correction(s) for anchor ${task.taskId}; refusing to create another scope-violation correction task for out-of-scope paths ${outOfScopePaths.join(', ')}.`,
      };
    }

    const outOfScopeList = outOfScopePaths.join(', ');
    const correction: CorrectionTask = {
      parent_task_id: task.taskId,
      correction_task_id: correctionTaskId,
      feature_id: task.featureId,
      title: `Remove out-of-scope changes from ${task.taskId}`,
      objective: `The reviewable diff for \`${task.taskId}\` touched paths outside its own declared allowed_paths. Revert or remove those changes so the diff stays within the task's original scope.`,
      first_executable_step: `Revert or remove the changes to ${outOfScopeList} so the diff for \`${task.taskId}\` touches only ${task.allowedPaths.join(', ')}.`,
      minimum_progress_evidence: [
        `\`git diff\` for the active worktree no longer touches ${outOfScopeList}.`,
      ],
      review_findings: [
        `Deterministic scope check: the reviewable diff for \`${task.taskId}\` includes ${outOfScopeList}, which fall outside its declared allowed_paths (${task.allowedPaths.join(', ')}).`,
      ],
      scope: {
        allowed_paths: [...task.allowedPaths, ...outOfScopePaths],
        forbidden_paths: task.forbiddenPaths,
      },
      constraints: [
        `Only remove or revert the changes in ${outOfScopeList}; do not add new functionality there.`,
        'Preserve the already-correct changes within the task\'s original allowed_paths.',
      ],
      acceptance_criteria: [
        `The final diff for \`${task.taskId}\` touches only paths within ${task.allowedPaths.join(', ')}.`,
      ],
      quality_gates: { before_review: task.qualityGates },
    };

    this.assertTaskIdIsUnused(owner.tasksDirectory, correction.correction_task_id, 'Deterministic scope-violation correction authoring');
    const correctionPath = this.writeCorrectionTask(correction);
    this.artifacts.writeJson(join('tasks', `${correction.correction_task_id}.json`), {
      task: correctionTaskToTask(correction),
    });

    const updatedFeatureState = this.updateFeatureStateForCorrection(owner.statePath, task.taskId, correction.correction_task_id);
    const updatedProjectState = this.updateProjectStateForCorrection(task.featureId, correction.correction_task_id);
    writeText(owner.statePath, updatedFeatureState);
    writeText(this.projectStatePath, updatedProjectState);

    if (this.options.commit) {
      const changedFiles = this.git.diffNameOnly();
      this.git.commit(changedFiles, `proto: request correction ${correction.correction_task_id}`);
    }

    console.log(`Deterministic scope check requested correction task ${correction.correction_task_id} at ${relativePath(this.repositoryRoot, correctionPath)}.`);
    return {
      exitCode: 0,
      continueLoop: true,
      summary: `Deterministic scope check found out-of-scope paths (${outOfScopeList}) in the diff for ${task.taskId}; requested correction task ${correction.correction_task_id} without invoking the reviewer.`,
    };
  }

  private executeDoctorRecoveryTask(
    task: ParsedTaskDocument,
    doctorRecovery: DoctorRecoveryTaskMetadata,
  ): StepExecutionResult {
    const owner = this.resolveWorkItemContext(task.featureId);
    const recoveryLessonLines = this.buildRecoveryLessonPromptLines(task.featureId, task.taskId);
    const prompt = buildDoctorRecoveryPrompt(task, doctorRecovery, recoveryLessonLines);
    const sourcePaths = [
      'src/contracts/runtime/doctor-recovery-execution-prompt.md',
      'src/contracts/task/doctor-recovery-task.md',
      task.path,
      ...task.likelyAffectedFiles,
    ];
    this.recordAgentInvocationContext(this.buildAgentInvocationContext({
      role: 'doctor',
      kind: 'doctor_recovery_task',
      label: `doctor:recover:${task.taskId}`,
      feature_id: task.featureId,
      task_id: task.taskId,
      source_paths: sourcePaths,
      prompt,
      tool: {
        name: 'codex',
        command: this.codexCommand,
        model: resolveCodexImplementerModel(),
        output_schema_id: null,
      },
    }));
    const headBefore = this.git.headCommit();
    const commandResult = this.codex.run(prompt, `doctor:recover:${task.taskId}`);
    this.throwIfControlledStopRequested();
    const headAfter = this.git.headCommit();
    const attempt = this.captureImplementationAttempt(task, commandResult, [], headBefore, headAfter);
    this.persistImplementationAttemptArtifacts(task.taskId, 1, attempt);
    this.artifacts.writeJson(join('implementations', `${task.taskId}.json`), attempt);
    this.artifacts.writeJson(join('implementation-attempts', `${task.taskId}.json`), {
      task_id: task.taskId,
      retried_after_partial_changes: false,
      attempts: [attempt],
      final_attempt: attempt,
    } satisfies ImplementationAttemptHistory);
    this.artifacts.writeText(join('raw-output', `${task.taskId}.log`), ensureTrailingNewline(attempt.raw_output || 'No output.\n'));

    if (attempt.git_diff.trim().length > 0) {
      this.artifacts.writeText(join('diffs', `${task.taskId}.patch`), attempt.git_diff);
    } else if (attempt.fallback_git_diff) {
      this.artifacts.writeText(join('diffs', `${task.taskId}.fallback.patch`), attempt.fallback_git_diff);
    }

    if (attempt.status !== 'success') {
      return this.stopAfterDoctorRecoveryFailure(
        owner,
        task,
        doctorRecovery,
        attempt.error ?? `Doctor recovery ${task.taskId} failed (${attempt.diagnostics.classification}).`,
      );
    }

    // A doctor recovery agent is allowed to tighten the task interface (scope, quality
    // gates, acceptance criteria, ...) by editing task.path directly. Re-persist the stored
    // JSON snapshot from the post-edit markdown before re-entry so loadTask() picks up those
    // edits on this and every future run, instead of silently re-running against the
    // pre-edit interface captured when the task was originally planned.
    this.artifacts.writeJson(join('tasks', `${task.taskId}.json`), storedTaskArtifactFromDocument(task.path, readUtf8(task.path)));
    task = this.loadTask(task.taskId);

    const qualityResults = this.runQualityGates(task);
    this.throwIfControlledStopRequested();
    this.artifacts.writeJson(join('quality-gates', `${task.taskId}.json`), qualityResults);
    if (qualityResults.some((result) => result.status === 'waived')) {
      return this.blockOnUnrelatedFixFailure(owner, task, qualityResults);
    }

    const passed = qualityResults.every((result) => result.status !== 'failed');
    if (!passed) {
      const failures = qualityResults
        .filter((result) => result.status === 'failed')
        .map((result) => `${result.name}: ${result.output_summary}`);
      return this.stopAfterDoctorRecoveryFailure(
        owner,
        task,
        doctorRecovery,
        `Doctor recovery ${task.taskId} failed its re-entry quality gates.\n${failures.join('\n')}`,
      );
    }

    const updatedFeatureState = this.updateFeatureStateAfterDoctorRecovery(owner.statePath, task, doctorRecovery);
    const updatedProjectState = this.updateProjectStateAfterDoctorRecovery(task.featureId, task.taskId, doctorRecovery.restoration_target);
    writeText(owner.statePath, updatedFeatureState);
    writeText(this.projectStatePath, updatedProjectState);

    if (this.options.commit) {
      const changedFiles = this.git.diffNameOnly();
      this.git.commit(changedFiles, `proto: apply doctor recovery ${task.taskId}`);
    }

    return {
      exitCode: 0,
      continueLoop: true,
      summary: `Doctor recovery ${task.taskId} passed its re-entry quality gates and restored ${doctorRecovery.restoration_target.lifecycle_state}.`,
    };
  }

  private stopAfterDoctorRecoveryFailure(
    owner: WorkItemContext,
    task: ParsedTaskDocument,
    doctorRecovery: DoctorRecoveryTaskMetadata,
    reason: string,
  ): StepExecutionResult {
    this.recordBlockedFeature(task.featureId, reason, task.taskId);
    const decision: DiagnosticAutocorrectionDecision = {
      feature_id: task.featureId,
      diagnosis_summary: 'Doctor recovery stopped because the bounded recovery itself failed or could not prove deterministic re-entry readiness.',
      blocker: {
        kind: classifyBlockerKind(reason, doctorRecovery.blocker.evidence, 'blocked').kind,
        signature: doctorRecovery.blocker.signature,
        recoverability: doctorRecovery.blocker.recoverability === 'terminal' ? 'terminal' : 'human',
        evidence: uniqueStrings([
          reason,
          ...doctorRecovery.blocker.evidence,
          `restoration_target=${doctorRecovery.restoration_target.lifecycle_state}:${doctorRecovery.restoration_target.active_task}`,
        ]),
      },
      next_step: 'stop_with_diagnostic',
      next_step_reason: reason,
      interface_response: {
        mode: 'manual_review',
        summary: 'Doctor recovery did not satisfy its own re-entry gates; inspect the recovery artifact before another attempt.',
        target_paths: uniqueStrings([
          task.path,
          'src/contracts/runtime/doctor-recovery-execution-prompt.md',
          'src/contracts/task/doctor-recovery-task.md',
        ]),
      },
    };
    this.writeDiagnosticArtifact(decision);

    if (this.options.commit) {
      this.git.commit(
        [
          relativePath(this.repositoryRoot, owner.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
        ],
        `proto: stop doctor recovery ${task.taskId}`,
      );
    }

    console.error(reason);
    return {
      exitCode: 2,
      continueLoop: false,
      summary: reason,
    };
  }

  private shouldAnalyzeTaskInterface(review: ReviewerOutput): boolean {
    return review.status === 'changes_required';
  }

  private analyzeTaskInterface(
    task: ParsedTaskDocument,
    owner: WorkItemContext,
    review: ReviewerOutput,
    implementation: ImplementationAttempt,
    qualityResults: readonly QualityGateResult[],
    tempDir: string,
    stateCorrection: StateCorrectionTask | null,
    doctorRecovery: DoctorRecoveryTaskMetadata | null,
  ): TaskInterfaceAnalysis {
    const reviewPath = join(tempDir, 'review.json');
    writeFileSync(reviewPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
    const sourcePaths = [
      'src/contracts/task/task.md',
      ...(stateCorrection ? ['src/contracts/task/state-correction-task.md'] : []),
      ...(doctorRecovery ? ['src/contracts/task/doctor-recovery-task.md'] : []),
      ...(doctorRecovery ? ['src/contracts/planner/doctor-recovery-planning-prompt.md'] : []),
      'src/contracts/implementer/task-execution-prompt.md',
      'src/contracts/adapters/implementer-adapter.md',
      'src/contracts/reviewer/review-prompt.md',
      'src/contracts/reviewer/output.md',
      'src/contracts/runtime/task-interface-analysis.md',
      relativePath(this.repositoryRoot, task.path),
      relativePath(this.repositoryRoot, owner.definitionPath),
      ...(owner.architecturePath ? [relativePath(this.repositoryRoot, owner.architecturePath)] : []),
      relativePath(this.repositoryRoot, owner.statePath),
      'docs/compassrose/CONFIG.md',
      join(tempDir, 'implementation.json'),
      join(tempDir, 'quality-gates.json'),
      reviewPath,
    ];

    const prompt = [
      'Act as the CompassRose task-interface analyst.',
      '',
      `Analyze task \`${task.taskId}\` after a problematic or diagnostic review outcome.`,
      '',
      'Read only:',
      '- `src/contracts/task/task.md`',
      ...(stateCorrection ? ['- `src/contracts/task/state-correction-task.md`'] : []),
      ...(doctorRecovery ? ['- `src/contracts/task/doctor-recovery-task.md`'] : []),
      ...(doctorRecovery ? ['- `src/contracts/planner/doctor-recovery-planning-prompt.md`'] : []),
      '- `src/contracts/implementer/task-execution-prompt.md`',
      '- `src/contracts/adapters/implementer-adapter.md`',
      '- `src/contracts/reviewer/review-prompt.md`',
      '- `src/contracts/reviewer/output.md`',
      '- `src/contracts/runtime/task-interface-analysis.md`',
      `- \`${relativePath(this.repositoryRoot, task.path)}\``,
      `- \`${relativePath(this.repositoryRoot, owner.definitionPath)}\``,
      ...(owner.architecturePath ? [`- \`${relativePath(this.repositoryRoot, owner.architecturePath)}\``] : []),
      `- \`${relativePath(this.repositoryRoot, owner.statePath)}\``,
      '- `docs/compassrose/CONFIG.md`',
      `- \`${join(tempDir, 'implementation.json')}\``,
      '- `implementation.implementation_notes` inside `implementation.json` (the field is named `implementation_notes`, not `notes`); if it is null or empty, treat that as an execution defect and report it explicitly.',
      `- \`${join(tempDir, 'quality-gates.json')}\``,
      `- \`${reviewPath}\``,
      '',
      'Goal:',
      '- Decide whether the implementation problems are at least partly perfectible by tightening the task interface.',
      '- If yes, propose concrete adjustments to task fields so future implementers perform better.',
      '- If not fully perfectible, document implementer limitations that should be recognized by future task design.',
      stateCorrection
        ? '- If this is a state repair task, focus on `state_target`, restored lifecycle fields, and scope around canonicalizing state.'
        : doctorRecovery
          ? '- If this is a doctor recovery task, focus on the blocker signature, restoration target, and whether the blocker should become a tighter task interface or a documented limitation.'
        : '- If this is a code task, focus on the minimal fields that improve code implementation behavior.',
      '',
      'Rules:',
      '- Focus on the task interface, not on fixing the code.',
      '- Prefer concrete changes to `first_executable_step`, `minimum_progress_evidence`, context, scope, acceptance criteria, or quality gates.',
      '- Every adjustment must reference a field, artifact, or mechanism that already exists in the contracts you were told to read. Do not invent new artifact types, manifests, validators, or field names to describe the gap.',
      '- If satisfying the gap would require a mechanism the runtime does not implement, report that as a limitation instead of proposing one; a future task or agent will otherwise treat your proposal as if it already existed.',
      '- When the implementer appears limited rather than under-specified, say so explicitly.',
      '- Return JSON only.',
    ].join('\n');

    this.recordAgentInvocationContext(this.buildAgentInvocationContext({
      role: 'diagnostic',
      kind: 'task_interface_analysis',
      label: `recover:task-interface:${task.taskId}`,
      feature_id: task.featureId,
      task_id: task.taskId,
      source_paths: sourcePaths,
      prompt,
      tool: {
        name: 'codex',
        command: this.codexCommand,
        model: resolveCodexPlannerModel(),
        output_schema_id: 'task_interface_analysis',
      },
    }));

    const analysis = this.codex.runStructured<TaskInterfaceAnalysis>(
      prompt,
      this.contracts.schema('task_interface_analysis'),
      [tempDir],
      `recover:task-interface:${task.taskId}`,
    );
    this.artifacts.writeJson(join('task-interface-analysis', `${task.taskId}.json`), analysis);
    this.artifacts.writeText(
      join('task-interface-analysis', `${task.taskId}.md`),
      renderTaskInterfaceAnalysisMarkdown(analysis, task, review, implementation, qualityResults),
    );
    return analysis;
  }

  /**
   * Returns `null` on ordinary success (caller builds its own success StepExecutionResult).
   * Returns a `StepExecutionResult` directly for every terminal outcome that needs its own
   * distinct handling: implementation failure (doctor recovery continues), or a confirmed
   * unrelated/pre-existing quality-gate failure (blocked on a newly filed or reused fix instead).
   */
  private executeImplementation(task: ParsedTaskDocument, correction: boolean, stateCorrection: StateCorrectionTask | null): StepExecutionResult | null {
    const recoveryLessonLines = this.buildRecoveryLessonPromptLines(task.featureId, task.taskId);
    const prompt = buildImplementerPrompt(task, correction, stateCorrection, recoveryLessonLines);
    const owner = this.resolveWorkItemContext(task.featureId);
    const implementationStatePaths = [
      relativePath(this.repositoryRoot, owner.statePath),
      relativePath(this.repositoryRoot, this.projectStatePath),
    ];
    const sourcePaths = [
      'src/contracts/implementer/task-execution-prompt.md',
      'src/contracts/adapters/implementer-adapter.md',
      'src/contracts/task/task.md',
      ...(stateCorrection ? ['src/contracts/task/state-correction-task.md'] : []),
      task.path,
      ...task.likelyAffectedFiles,
    ];
    writeText(owner.statePath, this.updateFeatureStateDuringImplementation(owner.statePath, task.taskId));
    writeText(this.projectStatePath, this.updateProjectStateDuringImplementation(task.featureId, task.taskId));

    const attempts: ImplementationAttempt[] = [];
    let retriedAfterPartialChanges = false;
    let finalAttempt: ImplementationAttempt | null = null;
    const baseLabel = `implementer:subtask:${task.taskId}`;

    for (let attemptIndex = 1; attemptIndex <= 2; attemptIndex += 1) {
      const attemptLabel = `${baseLabel}:attempt-${attemptIndex}`;
      if (attemptIndex === 2) {
        console.log(`Implementation for ${task.taskId} left partial repository changes; retrying once from the current worktree.`);
      }

      const headBefore = this.git.headCommit();
      this.recordAgentInvocationContext(this.buildAgentInvocationContext({
        role: 'implementer',
        kind: 'subtask_execution',
        label: attemptLabel,
        feature_id: task.featureId,
        task_id: task.taskId,
        source_paths: sourcePaths,
        prompt,
        tool: {
          name: this.options.implementer,
          command: this.options.implementer === 'codex' ? this.codexCommand : this.opencodeCommand,
          model: this.options.implementer === 'codex' ? resolveCodexImplementerModel() : resolveOpenCodeModel(),
          output_schema_id: null,
        },
      }));
      const commandResult = this.implementer.run(prompt, attemptLabel);
      this.throwIfControlledStopRequested();
      const headAfter = this.git.headCommit();
      const attempt = this.captureImplementationAttempt(task, commandResult, implementationStatePaths, headBefore, headAfter);
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
    } else if (finalAttempt.fallback_git_diff) {
      this.artifacts.writeText(join('diffs', `${task.taskId}.fallback.patch`), finalAttempt.fallback_git_diff);
    }

    if (finalAttempt.status !== 'success') {
      const failureReason = finalAttempt.error ?? `Implementation for ${task.taskId} failed (${finalAttempt.diagnostics.classification}).`;
      writeText(owner.statePath, this.updateFeatureStateAfterImplementationFailure(owner.statePath, task.taskId, failureReason));
      writeText(this.projectStatePath, this.updateProjectStateAfterImplementationFailure(task.featureId, task.taskId, failureReason));
      this.writeRefinementFeedback(failureReason, {
        kind: correction ? 'correct_task' : 'implement_subtask',
        feature_id: task.featureId,
        task_id: task.taskId,
        correction_task_id: correction ? task.taskId : null,
        reason: failureReason,
      });
      console.error(`Implementation for ${task.taskId} failed; recovery will continue through doctor recovery planning.`);
      return {
        exitCode: 0,
        continueLoop: true,
        summary: correction
          ? `Correction implementation for ${task.taskId} failed; doctor recovery planning will continue.`
          : `Implementation for ${task.taskId} failed; doctor recovery planning will continue.`,
      };
    }

    const qualityResults = this.runQualityGates(task);
    this.throwIfControlledStopRequested();
    this.artifacts.writeJson(join('quality-gates', `${task.taskId}.json`), qualityResults);

    if (qualityResults.some((result) => result.status === 'waived')) {
      return this.blockOnUnrelatedFixFailure(owner, task, qualityResults);
    }

    const passed = qualityResults.every((result) => result.status !== 'failed');
    const featureState = this.updateFeatureStateAfterImplementation(
      owner.statePath,
      task.taskId,
      passed ? 'review_pending' : 'quality_failed',
      passed ? 'passed' : 'failed',
    );
    const projectState = this.updateProjectStateAfterImplementation(task.featureId, task.taskId, passed);
    writeText(owner.statePath, featureState);
    writeText(this.projectStatePath, projectState);

    if (!passed) {
      const failedGateSummaries = qualityResults
        .filter((result) => result.status === 'failed')
        .map((result) => `${result.name}: ${result.output_summary}`)
        .join('\n');
      const failureReason = `Quality gates failed after implementing ${task.taskId}.\n${failedGateSummaries}`;
      this.writeRefinementFeedback(failureReason, {
        kind: correction ? 'correct_task' : 'implement_subtask',
        feature_id: task.featureId,
        task_id: task.taskId,
        correction_task_id: correction ? task.taskId : null,
        reason: failureReason,
      });
      console.error(`Quality gates failed after implementing ${task.taskId}; recovery will continue through doctor recovery planning.`);
      return {
        exitCode: 0,
        continueLoop: true,
        summary: correction
          ? `Correction implementation for ${task.taskId} failed; doctor recovery planning will continue.`
          : `Implementation for ${task.taskId} failed; doctor recovery planning will continue.`,
      };
    }

    return null;
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
    } else if (attempt.fallback_git_diff) {
      this.artifacts.writeText(join('diffs', `${taskId}.attempt-${attemptIndex}.fallback.patch`), attempt.fallback_git_diff);
    }
  }

  private captureImplementationAttempt(
    task: ParsedTaskDocument,
    commandResult: CommandExecution,
    excludedPaths: readonly string[] = [],
    headBefore: string | null = null,
    headAfter: string | null = null,
  ): ImplementationAttempt {
    const changedFiles = this.git.diffNameOnly(excludedPaths);
    const diff = this.git.diffPatch(excludedPaths);
    const fallbackChangedFiles = diff.trim().length === 0 && headBefore && headAfter && headBefore !== headAfter
      ? this.git.diffNameOnlyBetween(headBefore, headAfter, excludedPaths)
      : [];
    const fallbackDiff = diff.trim().length === 0 && headBefore && headAfter && headBefore !== headAfter
      ? this.git.diffPatchBetween(headBefore, headAfter, excludedPaths)
      : null;
    const rawOutput = joinOutput(commandResult.stdout, commandResult.stderr);
    const implementationNotes = extractImplementationNotes(rawOutput);
    const alreadyComplete = implementationNotesIndicatesAlreadyComplete(implementationNotes);
    const diagnostics = buildImplementationDiagnostics(
      task,
      commandResult,
      changedFiles,
      diff,
      fallbackDiff,
      rawOutput,
      implementationNotes,
      headBefore,
      headAfter,
    );
    const hasDiff = diff.trim().length > 0;
    const status = commandResult.ok && implementationNotes !== null && (hasDiff || alreadyComplete)
      ? 'success'
      : 'failed';

    return {
      status,
      changed_files: changedFiles,
      git_diff: diff,
      fallback_changed_files: fallbackChangedFiles,
      fallback_git_diff: fallbackDiff,
      raw_output: rawOutput,
      implementation_notes: implementationNotes,
      diagnostics,
      error: status === 'failed'
        ? buildImplementationErrorMessage(task.taskId, commandResult, diagnostics, hasDiff, implementationNotes)
        : null,
    };
  }

  private ensureImplementationAttempt(task: ParsedTaskDocument): ImplementationAttempt {
    const stored = this.artifacts.readJson<ImplementationAttempt>(join('implementations', `${task.taskId}.json`));
    if (stored) {
      return stored;
    }

    const owner = this.resolveWorkItemContext(task.featureId);
    const diff = this.git.diffPatch([
      relativePath(this.repositoryRoot, owner.statePath),
      relativePath(this.repositoryRoot, this.projectStatePath),
    ]);
    return {
      status: 'failed',
      changed_files: this.git.diffNameOnly([
        relativePath(this.repositoryRoot, owner.statePath),
        relativePath(this.repositoryRoot, this.projectStatePath),
      ]),
      git_diff: diff,
      fallback_changed_files: [],
      fallback_git_diff: null,
      raw_output: 'No stored implementer output.',
      implementation_notes: extractImplementationNotes('No stored implementer output.'),
      diagnostics: {
        classification: 'unknown',
        evidence: ['No stored implementation artifact was found.', 'Implementation notes: absent'],
        first_executable_step_status: diff.trim().length > 0 ? 'attempted' : 'unknown',
        minimum_progress_evidence_status: diff.trim().length > 0 ? 'present' : 'absent',
        exit_code: null,
        signal: null,
        timed_out: false,
        command_invoked: null,
      },
      error: 'No stored implementation artifact was found.',
    };
  }

  private runShellCommand(command: string): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
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

    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  private runQualityGates(task: ParsedTaskDocument): QualityGateResult[] {
    return task.qualityGates.map((command) => {
      const result = this.runShellCommand(command);
      if (result.status !== 0) {
        const waived = this.tryWaiveUnrelatedGateFailure(task, command, result.stdout, result.stderr);
        if (waived) {
          return waived;
        }
      }

      return {
        name: command,
        command,
        status: result.status === 0 ? 'passed' : 'failed',
        output_summary: summarizeCommandOutput(result.stdout, result.stderr),
      } satisfies QualityGateResult;
    });
  }

  /**
   * Reclassifies a failing quality-gate command as `waived` when the failure is confirmed to be
   * unrelated to this task: none of the paths its output references fall within this task's own
   * `allowedPaths` or its actual changed files, AND the same command still fails against a clean
   * checkout of `HEAD` (i.e. it already failed before this task's diff existed). This is what
   * stops a narrowly-scoped correction/doctor-recovery task from being rejected by an unrelated,
   * pre-existing failure elsewhere in a broad gate like `npm test` -- see the "gate/scope
   * mismatch" finding (cause F) in the fragility diagnosis at
   * C:\Users\Eric\.claude\plans\atomic-strolling-rivest.md: two real multi-round recovery chains
   * (F002-T07-C2, F002-T10) needed a second, near-duplicate round only because their correct
   * first fix was rejected by a test failure entirely outside what that task was allowed to touch.
   *
   * Deliberately conservative: returns `null` (stays `failed`) whenever the output doesn't clearly
   * name a file, when any named file IS in scope, or when the baseline re-run can't reproduce the
   * same failure -- a false "failed" costs an extra recovery round; a false "waived" would let a
   * real regression through uncontested.
   */
  private tryWaiveUnrelatedGateFailure(
    task: ParsedTaskDocument,
    command: string,
    stdout: string,
    stderr: string,
  ): QualityGateResult | null {
    const referencedPaths = extractReferencedPaths(`${stdout}\n${stderr}`);
    if (referencedPaths.length === 0) {
      return null;
    }

    const changedFiles = this.git.diffNameOnly();
    const inScope = referencedPaths.some(
      (path) => isPathAllowedByPrefix(path, task.allowedPaths) || changedFiles.includes(path),
    );
    if (inScope) {
      return null;
    }

    const baselineStatus = this.git.runAgainstCleanBaseline(() => this.runShellCommand(command).status);
    if (baselineStatus === null || baselineStatus === 0) {
      return null;
    }

    return {
      name: command,
      command,
      status: 'waived',
      output_summary:
        `Waived: this command already fails the same way on a clean checkout of HEAD, and its `
        + `failure output names no path within this task's allowed_paths (${task.allowedPaths.join(', ')}) `
        + `or changed files (${changedFiles.join(', ') || 'none'}) -- referenced instead: ${referencedPaths.join(', ')}.`,
    } satisfies QualityGateResult;
  }

  /**
   * Handles a confirmed-unrelated quality-gate failure by filing (or reusing) its own bounded
   * fix and blocking the active feature/fix on it, instead of letting the task continue to
   * review. Deliberately does NOT let the task's own reviewer see this failure at all: an
   * earlier version of this mechanism marked the gate `waived` and let the task proceed, but the
   * waived output_summary named exactly which file/system was broken, and nothing stopped the
   * reviewer from proposing a `correction_task` scoped to THAT file -- a correction completely
   * outside the active task's own frame. Filing a separate, independently-scoped fix and
   * stopping before review closes that hole at the source rather than validating the
   * reviewer's output after the fact.
   */
  private blockOnUnrelatedFixFailure(
    owner: WorkItemContext,
    task: ParsedTaskDocument,
    qualityResults: readonly QualityGateResult[],
  ): StepExecutionResult {
    const waived = qualityResults.find((result) => result.status === 'waived');
    if (!waived) {
      throw new Error(`blockOnUnrelatedFixFailure called for ${task.taskId} without a waived quality-gate result.`);
    }

    const referencedPaths = extractReferencedPaths(waived.output_summary);
    const fixId = this.fileOrReuseBlockingFix(waived.command, referencedPaths);
    const reason =
      `Task ${task.taskId} hit a quality-gate failure (\`${waived.command}\`) confirmed unrelated to and preexisting `
      + `its own scope; filed/reused fix \`${fixId}\` and stopped instead of continuing to review or generating a `
      + 'correction for it.';

    this.recordBlockedFeature(task.featureId, reason, task.taskId);
    writeText(owner.statePath, replaceOperationalStatus(readUtf8(owner.statePath), { blocked_on_fix: fixId }));

    if (this.options.commit) {
      this.git.commit(
        [
          relativePath(this.repositoryRoot, owner.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
          relativePath(this.repositoryRoot, join(this.fixesRoot, fixId)),
        ],
        `proto: file blocking fix ${fixId} for ${task.taskId}`,
      );
    }

    console.error(reason);
    return {
      exitCode: 2,
      continueLoop: false,
      summary: reason,
    };
  }

  /**
   * Deterministically scaffolds a new fix (request.md + fix.md + state.md, no LLM call --
   * the defect is already precisely known: which command, which unrelated paths, and that it
   * reproduces against a clean baseline) describing a confirmed pre-existing/unrelated
   * quality-gate failure, or returns the id of an existing fix already filed for the same
   * signature so repeated hits of the same defect never spawn duplicates. Left in
   * `task_planning_pending` with no tasks/ yet: diagnosing and actually fixing an arbitrary
   * pre-existing bug needs real reasoning, so the normal fix-task planning flow takes it from
   * here.
   */
  private fileOrReuseBlockingFix(command: string, referencedPaths: readonly string[]): string {
    const signature = this.computeGateFailureSignature(command, referencedPaths);
    const existing = this.findExistingFixForSignature(signature);
    if (existing) {
      return existing;
    }

    const primaryPath = referencedPaths[0] ?? 'the system';
    const fixId = this.nextFixId(slugify(`pre-existing failure in ${primaryPath}`));
    const fixDirectory = join(this.fixesRoot, fixId);

    const requestMarkdown = [
      `# Request: Pre-existing failure in \`${primaryPath}\``,
      '',
      `Signature: \`${signature}\``,
      '',
      '## What happened',
      '',
      `While executing an unrelated task, the quality-gate command \`${command}\` failed. The `
        + 'failure was confirmed to be pre-existing and unrelated to that task: none of the paths '
        + "its output referenced fell within the task's own allowed scope or changed files, and "
        + 'the same command still fails the same way on a clean checkout of the repository (i.e. '
        + "before that task's own diff existed).",
      '',
      '## Evidence',
      '',
      `- Command: \`${command}\``,
      `- Referenced path(s): ${referencedPaths.length > 0 ? referencedPaths.map((path) => `\`${path}\``).join(', ') : 'none extracted'}`,
      '- Reproduces against a clean checkout of HEAD (confirmed via a stash/rerun/restore baseline check).',
      '',
      '## Scope',
      '',
      'This fix includes:',
      '',
      `- Diagnosing and repairing the root cause of \`${command}\` failing.`,
      '',
      'This fix does not include:',
      '',
      '- Any work belonging to the task that first surfaced this failure; that task is unrelated and unblocks automatically once this fix reaches `completed`.',
    ].join('\n');

    const fixMarkdown = [
      `# Fix: Pre-existing failure in \`${primaryPath}\``,
      '',
      '## Status',
      '',
      'Planned',
      '',
      '## Severity',
      '',
      'high',
      '',
      '## Owning Feature',
      '',
      'none',
      '',
      '## Purpose',
      '',
      `Repair the pre-existing, unrelated failure in \`${command}\` that is blocking unrelated task chains.`,
      '',
      '## Problem',
      '',
      `\`${command}\` fails on a clean checkout of the repository, unrelated to any task currently in progress. `
        + `Referenced path(s): ${referencedPaths.length > 0 ? referencedPaths.map((path) => `\`${path}\``).join(', ') : 'none extracted'}.`,
      '',
      '## Scope',
      '',
      'This fix includes:',
      '',
      `- Diagnosing and repairing the root cause of \`${command}\` failing.`,
      '',
      'This fix does not include:',
      '',
      '- Any work belonging to the task chain that discovered it.',
      '',
      '## Acceptance Criteria',
      '',
      `- \`${command}\` passes on a clean checkout of the repository.`,
      '',
      '## Implementation Deliverables',
      '',
      '- A code or configuration change that repairs the root cause.',
      '',
      '## Completion Criteria',
      '',
      'This fix is considered resolved when:',
      '',
      `- \`${command}\` passes cleanly, and every feature/fix blocked on this fix id can resume.`,
      '',
      '## Implementation Outline',
      '',
      `1. Diagnose why \`${command}\` fails and repair the root cause.`,
      '',
      '## Related Documents',
      '',
      '- `state.md`',
    ].join('\n');

    const stateMarkdown = [
      `# State: Pre-existing failure in \`${primaryPath}\``,
      '',
      '## Lifecycle State',
      '',
      'task_planning_pending',
      '',
      '## Source Request',
      '',
      '`request.md`',
      '',
      '## Operational Status',
      '',
      '- formalization: complete',
      '- active_task: none',
      '- active_correction_task: none',
      '- active_unblock_task: none',
      '- severity: high',
      '- owning_feature: none',
      '- last_implementation_result: not_run',
      '- last_quality_gate_result: unknown',
      '- last_review_result: not_run',
      '- last_unblock_result: not_run',
      '',
      '## Current Reality',
      '',
      `\`${command}\` fails on a clean checkout of the repository, confirmed unrelated to any single task.`,
      '',
      '## Implemented Deliverables',
      '',
      '- None yet.',
      '',
      '## Remaining Deliverables',
      '',
      `- Diagnose and repair the root cause of \`${command}\` failing.`,
      '',
      '## Outline Progress',
      '',
      `- Diagnose and repair \`${command}\`: not started`,
      '',
      '## Blocked By',
      '',
      '- None',
      '',
      '## Blocked From',
      '',
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
      '- active_unblock_task: none',
      '',
      '## Last Approved Change',
      '',
      'None',
      '',
      '## Known Gaps',
      '',
      '- None',
      '',
      '## Next Planning Hint',
      '',
      `Plan the first task for fix \`${fixId}\`: diagnose and repair \`${command}\`.`,
    ].join('\n');

    writeText(join(fixDirectory, 'request.md'), requestMarkdown);
    writeText(join(fixDirectory, 'fix.md'), fixMarkdown);
    writeText(join(fixDirectory, 'state.md'), stateMarkdown);

    return fixId;
  }

  private computeGateFailureSignature(command: string, referencedPaths: readonly string[]): string {
    return createHash('sha1').update(`${command}::${referencedPaths[0] ?? ''}`).digest('hex').slice(0, 12);
  }

  private findExistingFixForSignature(signature: string): string | null {
    for (const fix of this.listFixes()) {
      if (!statSafeIsFile(fix.requestPath)) {
        continue;
      }

      if (readUtf8(fix.requestPath).includes(`Signature: \`${signature}\``)) {
        return fix.id;
      }
    }

    return null;
  }

  private nextFixId(slug: string): string {
    const highestNumber = this.listFixes().reduce((max, fix) => {
      const match = fix.id.match(/^(\d+)-/);
      const number = match?.[1] ? Number.parseInt(match[1], 10) : 0;
      return Math.max(max, number);
    }, 0);

    return `${String(highestNumber + 1).padStart(3, '0')}-${slug}`;
  }

  /**
   * Reads the `blocked_on_fix` Operational Status field a `blocked` feature/fix may carry
   * (mirrors `owning_feature`'s own accessor pattern, see readFixSeverityAndOwnership) --
   * `none`/absent means this `blocked` state has nothing to do with the fix-blocking mechanism.
   */
  private readBlockedOnFix(statePath: string): string | null {
    try {
      const markdown = readUtf8(statePath);
      const operationalStatus = requireSection(markdown, 'Operational Status');
      const raw = stripTicks(parsePreferredStatusValue(operationalStatus, 'blocked_on_fix') ?? 'none');
      return raw === 'none' || raw === '' ? null : raw;
    } catch {
      return null;
    }
  }

  /**
   * Counts how many doctor-recovery attempts have already been made for whatever is currently
   * blocked/failed, entirely independent of how the LLM planner names each recovery task (real
   * chains observed this session, e.g. "F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY-R7", nest
   * unpredictably and can't be parsed back into a stable anchor). The runtime owns this counter
   * completely: planDoctorRecoveryTask() increments it before every attempt, and
   * updateFeatureStateAfterDoctorRecovery() resets it to 0 once a recovery actually succeeds.
   */
  private readDoctorRecoveryAttempts(statePath: string): number {
    try {
      const markdown = readUtf8(statePath);
      const operationalStatus = requireSection(markdown, 'Operational Status');
      const raw = stripTicks(parsePreferredStatusValue(operationalStatus, 'doctor_recovery_attempts') ?? '0');
      const parsed = Number.parseInt(raw, 10);
      return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Fails safe (treats the fix as unresolved) when the fix can't be found or read, so a
   * transient error never silently resumes a feature whose blocking defect might still be real.
   */
  private isFixResolved(fixId: string): boolean {
    const fix = this.listFixes().find((candidate) => candidate.id === fixId);
    if (!fix || !statSafeIsFile(fix.statePath)) {
      return false;
    }

    try {
      return this.readFeatureStateSnapshot(fix).lifecycleState === 'completed';
    } catch {
      return false;
    }
  }

  /**
   * Deterministically restores a feature/fix once the fix it was blocked on reaches
   * `completed` -- no LLM call, same shape as updateFeatureStateAfterDoctorRecovery's own
   * restoration write. Its quality gates should now pass cleanly since the actual defect is
   * repaired.
   */
  private resumeWorkItemBlockedOnFix(owner: Pick<WorkItemContext, 'id' | 'statePath'>, snapshot: FeatureStateSnapshot, fixId: string): void {
    const restorationTarget = this.preferredRestorationTarget(snapshot);
    writeText(owner.statePath, this.updateFeatureStateAfterFixResolved(owner.statePath, restorationTarget, fixId));
    writeText(this.projectStatePath, this.updateProjectStateAfterFixResolved(owner.id, fixId, restorationTarget));

    if (this.options.commit) {
      this.git.commit(
        [
          relativePath(this.repositoryRoot, owner.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
        ],
        `proto: resume ${owner.id} after fix ${fixId} completed`,
      );
    }
  }

  private updateFeatureStateAfterFixResolved(featureStatePath: string, restorationTarget: RestorationTarget, fixId: string): string {
    let markdown = readUtf8(featureStatePath);
    markdown = replaceSection(markdown, 'Lifecycle State', restorationTarget.lifecycle_state);
    markdown = replaceOperationalStatus(markdown, {
      active_task: restorationTarget.active_task,
      active_correction_task: restorationTarget.active_correction_task,
      active_unblock_task: restorationTarget.active_unblock_task,
      blocked_on_fix: 'none',
    });
    markdown = replaceSection(markdown, 'Blocked By', '- None');
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
      '- active_unblock_task: none',
    ].join('\n'));
    markdown = replaceSection(markdown, 'Last Approved Change', `Fix \`${fixId}\` reached completed; resumed automatically.`);
    markdown = replaceSection(markdown, 'Next Planning Hint', restorationTargetNextPlanningHint(restorationTarget, restorationTarget.active_task, 'doctor'));
    return markdown;
  }

  private updateProjectStateAfterFixResolved(ownerId: string, fixId: string, restorationTarget: RestorationTarget): string {
    let markdown = readUtf8(this.projectStatePath);
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${ownerId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList(restorationTargetProjectPendingLines(restorationTarget, restorationTarget.active_task, 'doctor')));
    markdown = replaceSection(markdown, 'Last Approved Change', `Fix \`${fixId}\` reached completed; \`${ownerId}\` resumed automatically.`);
    markdown = replaceSection(markdown, 'Next Planning Hint', restorationTargetNextPlanningHint(restorationTarget, restorationTarget.active_task, 'doctor'));
    markdown = upsertBulletInSection(
      markdown,
      'Current Reality',
      `- \`${ownerId}\` resumed after a blocking fix`,
      `- \`${ownerId}\` resumed after fix \`${fixId}\` reached completed; the active task pointer was restored to \`${restorationTarget.active_task}\`.`,
    );
    return markdown;
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

  /** See runtimeAuthoredTaskPaths above for why every task-document writer routes through this. */
  private writeTaskDocument(path: string, markdown: string): void {
    writeText(path, markdown);
    this.runtimeAuthoredTaskPaths.add(relativePath(this.repositoryRoot, path));
  }

  private writeCorrectionTask(correction: CorrectionTask): string {
    const owner = this.resolveWorkItemContext(correction.feature_id);
    const path = join(
      owner.tasksDirectory,
      buildCorrectionTaskFileName(correction.correction_task_id, correction.title),
    );

    const markdown = renderCorrectionTaskMarkdown(correction);
    this.writeTaskDocument(path, markdown);
    return path;
  }

  /**
   * Public accessor: builds the next state-correction task id for `activeTaskId`, bounded
   * by the configured correction depth (limits.max_review_iterations). Returns null when
   * the correction limit has already been reached.
   */
  buildStateCorrectionTaskId(tasksDirectory: string, activeTaskId: string): string | null {
    return limitStateCorrectionTaskId(tasksDirectory, activeTaskId, this.maxReviewIterations);
  }

  private correctState(featureId: string, reason: string): void {
    const owner = this.resolveWorkItemContext(featureId);

    // Enforce the configured correction depth limit before allocating a new correction ID.
    // At the limit, refuse to create any correction artifact or mutate state.
    const correctionId = this.buildStateCorrectionTaskId(owner.tasksDirectory, owner.id);
    if (correctionId === null) {
      throw new StateCorrectionLimitReachedError(
        `Correction iteration limit reached for feature ${featureId} after ${this.maxReviewIterations} correction(s) for anchor ${owner.id}; refusing to create another near-duplicate state-correction task.`,
      );
    }

    const markdown = readUtf8(owner.statePath);
    const lifecycleState = stripTicks(requireSection(markdown, 'Lifecycle State').trim());
    const operationalStatusSection = requireSection(markdown, 'Operational Status');
    const activeTask = stripTicks(parsePreferredStatusValue(operationalStatusSection, 'active_task') ?? 'none');
    const restoredActiveTask = activeTask !== 'none'
      ? activeTask
      : this.resolveStateCorrectionActiveTask(owner, markdown);

    if (activeTask === 'none') {
      console.error(
        `State correction fallback for ${featureId}: active_task is missing, so the prototype will use ${restoredActiveTask} as the repair anchor.`,
      );
    }

    const stateCorrection = this.buildStateCorrectionTask(owner, restoredActiveTask, lifecycleState, reason);
    this.assertTaskIdIsUnused(owner.tasksDirectory, stateCorrection.task_id, 'State correction planning');
    this.reconcileDirtyPathsForNewScope(featureId, activeTask, stateCorrection.scope.allowed_paths);
    const path = this.writeStateCorrectionTask(stateCorrection);
    this.artifacts.writeJson(join('tasks', `${stateCorrection.task_id}.json`), {
      task: stateCorrectionTaskToTask(stateCorrection),
      state_correction: stateCorrection,
    });

    const stateCorrectionTask = stateCorrectionTaskToTask(stateCorrection);
    const updatedFeatureState = this.updateFeatureStateAfterStateCorrection(owner.statePath, stateCorrection.task_id, stateCorrection);
    const updatedProjectState = this.updateProjectStateAfterStateCorrection(featureId, stateCorrection);
    writeText(owner.statePath, updatedFeatureState);
    writeText(this.projectStatePath, updatedProjectState);

    if (this.options.commit) {
      this.git.commit(
        [
          relativePath(this.repositoryRoot, path),
          relativePath(this.repositoryRoot, owner.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
        ],
        `proto: repair state for ${featureId}`,
      );
    }
    console.error(`State correction artifact ${stateCorrection.task_id} applied and recorded at ${relativePath(this.repositoryRoot, path)}.`);
  }

  private resolveStateCorrectionActiveTask(feature: Pick<WorkItemContext, 'id'>, featureStateMarkdown: string): string {
    const projectStateMarkdown = readUtf8(this.projectStatePath);
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
      `Cannot create a state correction artifact for ${feature.id} because no active task is recorded and no recoverable task hint could be derived from project state or recorded task artifacts.`,
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

  private resolveImplementationFailureActiveTask(feature: Pick<WorkItemContext, 'id'>, snapshot: FeatureStateSnapshot): string | null {
    return resolveImplementationFailureActiveTask(
      snapshot,
      () => this.resolveStateCorrectionActiveTaskFromArtifacts(feature.id),
    );
  }

  private findLatestTaskArtifactTaskId(featureId: string): string | null {
    return findLatestTaskArtifactTaskId(
      this.artifacts.listFiles('tasks'),
      (fileName) => this.artifacts.readJson<StoredTaskArtifact>(join('tasks', fileName)),
      featureId,
    );
  }

  private findLatestImplementationAttemptTaskId(featureId: string): string | null {
    return findLatestImplementationAttemptTaskId(
      this.artifacts.listFiles('implementation-attempts'),
      (fileName) => this.artifacts.readJson<ImplementationAttemptHistory>(join('implementation-attempts', fileName)),
      (taskId) => this.artifacts.readJson<StoredTaskArtifact>(join('tasks', `${taskId}.json`)),
      featureId,
    );
  }

  private buildStateCorrectionTask(
    feature: Pick<WorkItemContext, 'id' | 'statePath' | 'tasksDirectory'>,
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
      first_executable_step: `Apply the canonical repair directly to \`${statePath}\` and \`${projectStatePath}\`, preserving \`${activeTaskId}\`.`,
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
        'Apply the repair directly through the runtime state-correction path instead of delegating it to the implementer.',
        'Keep the correction narrowly focused on canonicalizing state.',
      ],
      development_policy: {
        mode: 'documentation_first',
      },
      quality_gates: {
        before_review: [
          'git diff --check',
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
    const owner = this.resolveWorkItemContext(stateCorrection.feature_id);
    const path = join(
      owner.tasksDirectory,
      buildCorrectionTaskFileName(stateCorrection.task_id, stateCorrection.title),
    );

    const markdown = renderStateCorrectionTaskMarkdown(stateCorrection);
    this.writeTaskDocument(path, markdown);
    return path;
  }

  private readFeatureStateSnapshot(feature: Pick<WorkItemContext, 'statePath'>): FeatureStateSnapshot {
    const markdown = readUtf8(feature.statePath);
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

  private tryReadFeatureStateSnapshot(feature: Pick<WorkItemContext, 'statePath'>): FeatureStateSnapshot | null {
    try {
      return this.readFeatureStateSnapshot(feature);
    } catch {
      return null;
    }
  }

  private preferredRestorationTarget(snapshot: FeatureStateSnapshot): RestorationTarget {
    return preferredRestorationTarget(snapshot);
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
    const owner = this.resolveWorkItemContext(featureId);
    const snapshot = this.readFeatureStateSnapshot(owner);
    const blocker = this.buildBlockerProfile(snapshot, reason);
    const restorationTarget = this.preferredRestorationTarget(snapshot);
    this.persistBlockedFeature(featureId, taskId ?? (snapshot.activeTask === 'none' ? null : snapshot.activeTask), reason, blocker, restorationTarget, owner);
    return blocker;
  }

  private recordBlockedReview(
    task: ParsedTaskDocument,
    review: ReviewerOutput,
    implementation: ImplementationAttempt,
    qualityResults: readonly QualityGateResult[],
  ): BlockerProfile {
    const owner = this.resolveWorkItemContext(task.featureId);
    const snapshot = this.readFeatureStateSnapshot(owner);
    const blocker = this.buildReviewBlockerProfile(review, implementation, qualityResults, snapshot);
    const restorationTarget = this.preferredRestorationTarget(snapshot);
    const reason = this.buildReviewBlockerReason(review, implementation, qualityResults);

    this.persistBlockedFeature(task.featureId, task.taskId, reason, blocker, restorationTarget, owner);
    return blocker;
  }

  private persistBlockedFeature(
    featureId: string,
    taskId: string | null,
    reason: string,
    blocker: BlockerProfile,
    restorationTarget: RestorationTarget,
    feature: WorkItemContext,
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

    return `Plan a doctor recovery task for blocker \`${blocker.signature}\` and then restore \`${restorationTarget.lifecycle_state}\`.`;
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
      'Plan a doctor recovery task for the active feature.',
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
    let markdown = readUtf8(featureStatePath);
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
    let markdown = readUtf8(this.projectStatePath);
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
    const stored = this.artifacts.readJson<StoredTaskArtifact>(join('tasks', `${taskId}.json`));
    if (stored) {
      return stored;
    }

    const taskPath = this.tryFindTaskDocumentPath(taskId);
    if (!taskPath) {
      return null;
    }

    return storedTaskArtifactFromDocument(taskPath, readUtf8(taskPath));
  }

  private primaryTaskAnchor(taskId: string): string {
    const artifact = this.loadTaskArtifact(taskId);
    const restoredTask = artifact?.doctor_recovery?.restoration_target.active_task
      ?? artifact?.unblock?.restoration_target.active_task
      ?? artifact?.state_correction?.state_target.restored_active_task
      ?? 'none';
    if (restoredTask !== 'none') {
      return primaryTaskAnchorFromId(restoredTask);
    }

    return primaryTaskAnchorFromId(taskId);
  }

  private loadFeature(featureId: string): FeatureRecord {
    const features = this.listFeatures();
    const feature = features.find((item) => item.id === featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} was not found under ${this.featuresRoot}.`);
    }

    return feature;
  }

  private tryLoadFeature(featureId: string): FeatureRecord | null {
    return this.listFeatures().find((item) => item.id === featureId) ?? null;
  }

  /**
   * Resolves a task's owning work item (feature or fix) by trying the features root, then
   * the fixes root, for the given id — no new "kind" field is threaded through task documents;
   * a fix task simply carries its fix's directory id in the same `feature_id`/`## Parent
   * Feature` slot a feature task already uses. Throws with the same failure mode as
   * loadFeature() when the id resolves under neither root.
   */
  private resolveWorkItemContext(ownerId: string): WorkItemContext {
    const feature = this.tryLoadFeature(ownerId);
    if (feature) {
      return {
        id: feature.id,
        directory: feature.directory,
        requestPath: feature.requestPath,
        definitionPath: feature.featurePath,
        architecturePath: feature.architecturePath,
        statePath: feature.statePath,
        tasksDirectory: feature.tasksDirectory,
      };
    }

    const fix = this.loadFix(ownerId);
    return {
      id: fix.id,
      directory: fix.directory,
      requestPath: fix.requestPath,
      definitionPath: fix.fixPath,
      architecturePath: null,
      statePath: fix.statePath,
      tasksDirectory: fix.tasksDirectory,
    };
  }

  private listFeatures(): FeatureRecord[] {
    if (!existsSync(this.featuresRoot)) {
      return [];
    }

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

  private loadFix(fixId: string): FixRecord {
    const fixes = this.listFixes();
    const fix = fixes.find((item) => item.id === fixId);
    if (!fix) {
      throw new Error(`Fix ${fixId} was not found under ${this.fixesRoot}.`);
    }

    return fix;
  }

  private listFixes(): FixRecord[] {
    if (!existsSync(this.fixesRoot)) {
      return [];
    }

    return readdirSync(this.fixesRoot)
      .filter((entry) => statSync(join(this.fixesRoot, entry)).isDirectory())
      .map((entry) => ({
        id: entry,
        name: entry.replace(/^\d+-/, ''),
        directory: join(this.fixesRoot, entry),
        requestPath: join(this.fixesRoot, entry, 'request.md'),
        fixPath: join(this.fixesRoot, entry, 'fix.md'),
        statePath: join(this.fixesRoot, entry, 'state.md'),
        tasksDirectory: join(this.fixesRoot, entry, 'tasks'),
      }))
      .sort((left, right) => compareFeatureIds(left.id, right.id));
  }

  private loadTask(taskId: string): ParsedTaskDocument {
    const stored = this.artifacts.readJson<StoredTaskArtifact>(join('tasks', `${taskId}.json`));
    if (stored) {
      const owner = this.resolveWorkItemContext(stored.task.feature_id);
      const taskPath = this.findTaskDocumentPath(taskId, owner.tasksDirectory);
      const parsed = parseTaskDocument(taskPath, readUtf8(taskPath));
      return {
        taskId: stored.task.task_id,
        previousTaskId: parsed.previousTaskId,
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
        trace: stored.task.trace,
        context: stored.task.context,
        expectedDeliverables: stored.task.expected_deliverables,
        stateCorrection: stored.state_correction ?? parsed.stateCorrection,
        doctorRecovery: stored.doctor_recovery ?? stored.unblock ?? parsed.doctorRecovery ?? parsed.unblock,
        unblock: stored.unblock ?? stored.doctor_recovery ?? parsed.unblock ?? parsed.doctorRecovery,
        reviewableDiffHandoff: parsed.reviewableDiffHandoff,
        path: taskPath,
      };
    }

    const taskPath = this.findTaskDocumentPath(taskId);
    return parseTaskDocument(taskPath, readUtf8(taskPath));
  }

  private findTaskDocumentPath(taskId: string, tasksDirectory?: string): string {
    const searchRoots = tasksDirectory ? [tasksDirectory] : this.listFeatures().map((feature) => feature.tasksDirectory);
    return findTaskDocumentPath(taskId, searchRoots);
  }

  private tryFindTaskDocumentPath(taskId: string, tasksDirectory?: string): string | null {
    const searchRoots = tasksDirectory ? [tasksDirectory] : this.listFeatures().map((feature) => feature.tasksDirectory);
    return tryFindTaskDocumentPath(taskId, searchRoots);
  }

  private assertTaskIdIsUnused(tasksDirectory: string, taskId: string, context: string): void {
    assertTaskIdIsUnused(tasksDirectory, taskId, context, this.repositoryRoot);
  }

  private updateProjectStateForFeaturePlan(featureId: string): string {
    let markdown = readUtf8(this.projectStatePath);
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

  // PROJECT_STATE.md's "Active Feature" pointer/Pending/Next Planning Hint fields are purely
  // narrative (never read by scheduling code -- see determineNextStep()), and predate fixes
  // existing at all. Rather than fork every updateProjectStateAfter*() call in the generic
  // execution machinery to thread a work-item kind through, these two fix-specific plan/task
  // methods just reuse the same "Active Feature" section with fix-flavored wording; once a
  // fix's task starts executing, the shared execution-machinery methods (executeImplementation,
  // reviewTask, etc.) continue updating that same pointer/hint fields generically, so the label
  // may say "Active Feature" while pointing at a fix id. This is a known, cosmetic-only quirk of
  // the single global pointer design -- nothing reads it for decisions.
  private updateProjectStateForFixPlan(fixId: string): string {
    let markdown = readUtf8(this.projectStatePath);
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${fixId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList([
      'Plan the next implementation task for the active fix.',
      'Continue updating this file with approved repository facts as fix work lands.',
    ]));
    markdown = replaceSection(markdown, 'Next Planning Hint', `The active work item is fix \`${fixId}\`, and its next valid action is task planning.`);
    markdown = replaceSection(markdown, 'Last Approved Change', `Fix \`${fixId}\` was formalized by the orchestrator.`);
    markdown = upsertBulletInSection(
      markdown,
      'Current Reality',
      `- The active work-item pointer currently targets fix \`${fixId}\``,
      `- The active work-item pointer currently targets fix \`${fixId}\`; the detailed task and lifecycle state for that fix lives in \`docs/fixes/${fixId}/state.md\`.`,
    );
    return markdown;
  }

  private updateProjectStateForFixTaskPlan(fixId: string, taskId: string): string {
    let markdown = readUtf8(this.projectStatePath);
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${fixId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList([
      `Execute \`${taskId}\` for the active fix.`,
      'Continue updating this file with approved repository facts as fix work lands.',
    ]));
    markdown = replaceSection(markdown, 'Next Planning Hint', `The active work item is fix \`${fixId}\`, and its next valid action is to execute \`${taskId}\`.`);
    markdown = upsertBulletInSection(
      markdown,
      'Current Reality',
      `- Fix \`${fixId}\` now has a planned next task`,
      `- Fix \`${fixId}\` now has a planned next task, \`${taskId}\`, ready to execute.`,
    );
    return markdown;
  }

  private updateProjectStateForTaskPlan(featureId: string, taskId: string): string {
    let markdown = readUtf8(this.projectStatePath);
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
    let markdown = readUtf8(this.projectStatePath);
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${featureId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList([
      passed ? `Review subtask \`${taskId}\` for the active feature.` : `Investigate failed quality gates for subtask \`${taskId}\`.`,
      'Continue updating this file with approved repository facts as feature work lands.',
    ]));
    markdown = replaceSection(
      markdown,
      'Next Planning Hint',
      passed
        ? `The active feature is \`${featureId}\`, and its next valid action is to review subtask \`${taskId}\`.`
        : `The active feature is \`${featureId}\`, but quality gates for \`${taskId}\` failed and the run should stop.`,
    );
    return markdown;
  }

  private updateProjectStateAfterImplementationFailure(featureId: string, taskId: string, reason: string): string {
    let markdown = readUtf8(this.projectStatePath);
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${featureId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList([
      `Recover the failed implementation attempt for \`${taskId}\` before continuing.`,
      'Continue updating this file with approved repository facts as feature work lands.',
    ]));
    markdown = replaceSection(
      markdown,
      'Next Planning Hint',
      `The active feature is \`${featureId}\`, but implementation of \`${taskId}\` failed; plan a bounded doctor recovery task before continuing.`,
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
    let markdown = readUtf8(this.projectStatePath);
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${featureId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList([
      'Plan the next implementation task for the active feature.',
      'Continue updating this file with approved repository facts as feature work lands.',
    ]));
    markdown = replaceSection(markdown, 'Last Approved Change', `Subtask \`${taskId}\` was approved by the prototype orchestrator.`);
    markdown = replaceSection(markdown, 'Next Planning Hint', `The active feature is \`${featureId}\`, and its next valid action is the next task-planning pass.`);
    return markdown;
  }

  private updateProjectStateForCorrection(featureId: string, correctionTaskId: string): string {
    let markdown = readUtf8(this.projectStatePath);
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${featureId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList([
      `Execute correction subtask \`${correctionTaskId}\` for the active feature.`,
      'Continue updating this file with approved repository facts as feature work lands.',
    ]));
    markdown = replaceSection(markdown, 'Next Planning Hint', `The active feature is \`${featureId}\`, and its next valid action is to execute correction subtask \`${correctionTaskId}\`.`);
    return markdown;
  }

  private updateFeatureStateForTaskPlan(
    featureStatePath: string,
    taskId: string,
    title: string,
    taskRequestLink: { featureId: string; taskRequestId: string } | null = null,
  ): string {
    let markdown = readUtf8(featureStatePath);
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

    if (taskRequestLink) {
      markdown = this.markTaskRequestStatus(markdown, taskRequestLink.featureId, taskRequestLink.taskRequestId, 'in_progress');
    }

    return markdown;
  }

  /**
   * Flips one task request's status in its feature's task-requests JSON artifact and
   * regenerates `## Outline Progress` in the given state.md content from the updated array --
   * the code-driven counterpart to `## Outline Progress`, never hand-edited by the planner
   * after formalization. A no-op (returns markdown unchanged) if the feature has no
   * task-requests artifact at all, e.g. a fix (fixes never reach here with a non-null link).
   */
  private markTaskRequestStatus(
    markdown: string,
    featureId: string,
    taskRequestId: string,
    status: TaskRequestStatus,
  ): string {
    const taskRequests = this.artifacts.readJson<TaskRequest[]>(join('task-requests', `${featureId}.json`));
    if (!taskRequests) {
      return markdown;
    }

    const updated = withUpdatedStatus(taskRequests, taskRequestId, status);
    this.artifacts.writeJson(join('task-requests', `${featureId}.json`), updated);
    return replaceSection(markdown, 'Outline Progress', renderOutlineProgressMarkdown(updated));
  }

  private updateFeatureStateAfterImplementation(
    featureStatePath: string,
    taskId: string,
    lifecycleState: 'review_pending' | 'quality_failed',
    qualityResult: 'passed' | 'failed',
  ): string {
    let markdown = readUtf8(featureStatePath);
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
        ? `Review subtask \`${taskId}\` next.`
        : `Quality gates for \`${taskId}\` failed; stop and recover before continuing.`,
    );
    return markdown;
  }

  private updateFeatureStateDuringImplementation(featureStatePath: string, taskId: string): string {
    let markdown = readUtf8(featureStatePath);
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
    markdown = replaceSection(markdown, 'Next Planning Hint', `Recover or finish subtask implementation of \`${taskId}\` before allowing review or new planning.`);
    return markdown;
  }

  private updateFeatureStateAfterImplementationFailure(featureStatePath: string, taskId: string, reason: string): string {
    let markdown = readUtf8(featureStatePath);
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
      `Plan a bounded doctor recovery task for the failed implementation of \`${taskId}\` and restore task readiness before continuing.`,
    );
    return markdown;
  }

  private updateProjectStateDuringImplementation(featureId: string, taskId: string): string {
    let markdown = readUtf8(this.projectStatePath);
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${featureId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList([
      `Recover or finish implementation for \`${taskId}\`.`,
      'Continue updating this file with approved repository facts as feature work lands.',
    ]));
    markdown = replaceSection(markdown, 'Next Planning Hint', `The active feature is \`${featureId}\`, and subtask execution for \`${taskId}\` is in progress.`);
    return markdown;
  }

  private updateFeatureStateAfterApprovedReview(featureStatePath: string, task: ParsedTaskDocument): string {
    let markdown = readUtf8(featureStatePath);
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
    markdown = replaceSection(markdown, 'Last Approved Change', `Subtask \`${task.taskId}\` was approved by the prototype orchestrator.`);
    markdown = replaceSection(markdown, 'Next Planning Hint', 'Plan the next task that advances this feature from the remaining gap.');

    const sourceTaskRequestId = this.artifacts.readJson<PlannerOutput>(join('tasks', `${task.taskId}.json`))?.task?.source_task_request_id ?? null;
    if (sourceTaskRequestId) {
      markdown = this.markTaskRequestStatus(markdown, task.featureId, sourceTaskRequestId, 'complete');
    }

    return markdown;
  }

  private updateFeatureStateForCorrection(
    featureStatePath: string,
    taskId: string,
    correctionTaskId: string,
  ): string {
    let markdown = readUtf8(featureStatePath);
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
    markdown = replaceSection(markdown, 'Next Planning Hint', `Execute correction subtask \`${correctionTaskId}\` next.`);
    return markdown;
  }

  private updateFeatureStateForStateCorrection(
    featureStatePath: string,
    taskId: string,
    correctionTaskId: string,
  ): string {
    let markdown = readUtf8(featureStatePath);
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

  private updateFeatureStateForDoctorRecovery(
    featureStatePath: string,
    taskId: string,
    restorationTarget: RestorationTarget,
    doctorRecoveryAttempts: number,
  ): string {
    let markdown = readUtf8(featureStatePath);
    markdown = replaceSection(markdown, 'Lifecycle State', 'unblock_pending');
    markdown = replaceOperationalStatus(markdown, {
      active_correction_task: 'none',
      active_unblock_task: taskId,
      last_review_result: 'blocked',
      last_unblock_result: 'not_run',
      doctor_recovery_attempts: String(doctorRecoveryAttempts),
    });
    markdown = replaceSection(markdown, 'Blocked From', [
      `- lifecycle_state: \`${restorationTarget.lifecycle_state}\``,
      `- active_task: \`${restorationTarget.active_task}\``,
      `- active_correction_task: \`${restorationTarget.active_correction_task}\``,
      `- active_unblock_task: \`${restorationTarget.active_unblock_task}\``,
    ].join('\n'));
    markdown = replaceSection(markdown, 'Next Planning Hint', `Execute doctor recovery task \`${taskId}\` next.`);
    return markdown;
  }

  private updateFeatureStateAfterStateCorrection(
    featureStatePath: string,
    taskId: string,
    stateCorrection: StateCorrectionTask,
  ): string {
    let markdown = readUtf8(featureStatePath);
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
    markdown = replaceSection(markdown, 'Last Approved Change', `State correction artifact \`${taskId}\` was applied by the prototype orchestrator.`);
    markdown = replaceSection(markdown, 'Next Planning Hint', stateCorrectionNextPlanningHint(stateCorrection));
    return markdown;
  }

  private updateFeatureStateAfterDoctorRecovery(
    featureStatePath: string,
    task: ParsedTaskDocument,
    doctorRecovery: DoctorRecoveryTaskMetadata,
  ): string {
    let markdown = readUtf8(featureStatePath);
    markdown = replaceSection(markdown, 'Lifecycle State', doctorRecovery.restoration_target.lifecycle_state);
    markdown = replaceOperationalStatus(markdown, {
      active_task: doctorRecovery.restoration_target.active_task,
      active_correction_task: doctorRecovery.restoration_target.active_correction_task,
      active_unblock_task: doctorRecovery.restoration_target.active_unblock_task,
      last_implementation_result: 'passed',
      last_quality_gate_result: 'passed',
      last_review_result: 'skipped',
      last_unblock_result: 'passed',
      // This recovery attempt actually worked -- reset the depth counter so a later, unrelated
      // failure starts its own fresh budget instead of inheriting this one's exhausted count.
      doctor_recovery_attempts: '0',
    });
    markdown = replaceSection(markdown, 'Blocked By', '- None');
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
      '- active_unblock_task: none',
    ].join('\n'));
    markdown = replaceSection(markdown, 'Last Approved Change', `Doctor recovery task \`${task.taskId}\` passed re-entry quality gates and was applied by the prototype orchestrator.`);
    markdown = replaceSection(markdown, 'Next Planning Hint', restorationTargetNextPlanningHint(doctorRecovery.restoration_target, doctorRecovery.restoration_target.active_task, 'doctor'));
    return markdown;
  }

  private updateFeatureStateAfterUnblock(
    featureStatePath: string,
    task: ParsedTaskDocument,
    unblock: UnblockTaskMetadata,
  ): string {
    return this.updateFeatureStateAfterDoctorRecovery(featureStatePath, task, unblock);
  }

  private updateProjectStateAfterStateCorrection(featureId: string, stateCorrection: StateCorrectionTask): string {
    let markdown = readUtf8(this.projectStatePath);
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${featureId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList(stateCorrectionProjectPendingLines(stateCorrection)));
    markdown = replaceSection(markdown, 'Last Approved Change', `State correction artifact \`${stateCorrection.task_id}\` was applied by the prototype orchestrator.`);
    markdown = replaceSection(markdown, 'Next Planning Hint', stateCorrectionNextPlanningHint(stateCorrection));
    markdown = upsertBulletInSection(
      markdown,
      'Current Reality',
      `- Feature \`${featureId}\` now has a planned next task`,
      `- Feature \`${featureId}\` state was canonicalized; the active task pointer remains \`${stateCorrection.state_target.restored_active_task}\`.`,
    );
    return markdown;
  }

  private updateProjectStateForDoctorRecovery(featureId: string, taskId: string, lifecycleState: string): string {
    let markdown = readUtf8(this.projectStatePath);
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${featureId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList([
      `Execute doctor recovery task \`${taskId}\` for the active feature.`,
      'Continue updating this file with approved repository facts as feature work lands.',
    ]));
    markdown = replaceSection(markdown, 'Next Planning Hint', `The active feature is \`${featureId}\`, and its next valid action is to execute doctor recovery task \`${taskId}\` from the captured \`${lifecycleState}\` state.`);
    markdown = upsertBulletInSection(
      markdown,
      'Current Reality',
      `- Feature \`${featureId}\` now has a planned doctor recovery task`,
      `- Feature \`${featureId}\` now has a planned doctor recovery task, \`${taskId}\`, to resolve a recoverable blocker and restore \`${lifecycleState}\`.`,
    );
    return markdown;
  }

  private updateProjectStateForUnblock(featureId: string, taskId: string, lifecycleState: string): string {
    return this.updateProjectStateForDoctorRecovery(featureId, taskId, lifecycleState);
  }

  private updateProjectStateAfterDoctorRecovery(featureId: string, taskId: string, restorationTarget: RestorationTarget): string {
    let markdown = readUtf8(this.projectStatePath);
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${featureId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList(restorationTargetProjectPendingLines(restorationTarget, taskId, 'doctor')));
    markdown = replaceSection(markdown, 'Last Approved Change', `Doctor recovery task \`${taskId}\` passed re-entry quality gates and was applied by the prototype orchestrator.`);
    markdown = replaceSection(markdown, 'Next Planning Hint', restorationTargetNextPlanningHint(restorationTarget, restorationTarget.active_task, 'doctor'));
    markdown = upsertBulletInSection(
      markdown,
      'Current Reality',
      `- Feature \`${featureId}\` now has a planned doctor recovery task`,
      `- Feature \`${featureId}\` recovered from a blocker through doctor recovery task \`${taskId}\`; the active task pointer was restored to \`${restorationTarget.active_task}\`.`,
    );
    return markdown;
  }

  private updateProjectStateAfterUnblock(featureId: string, taskId: string, restorationTarget: RestorationTarget): string {
    return this.updateProjectStateAfterDoctorRecovery(featureId, taskId, restorationTarget);
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
      implementation_notes: implementation.implementation_notes,
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

  /**
   * `activeTaskId`, when given, additionally requires the lesson to be about the SAME task
   * anchor currently being recovered (see primaryTaskAnchorFromId) -- not just the same
   * feature. `latest-recovery-lesson.json` is a single file overwritten only when a NEW
   * lesson is recorded, so without this check a stale lesson from an unrelated, long-finished
   * task keeps getting fed into doctor-recovery prompts for every later, unrelated failure on
   * that feature until something else happens to overwrite it. Confirmed in practice: a
   * two-day-old lesson from F002-T14 (part of the orchestration-adjacent work later
   * superseded by embedding the real orchestrator) was still "latest" for feature
   * 002-configuration-model and got surfaced, verbatim task_interface_adjustments and all,
   * while diagnosing an unrelated F002-T15 quality-gate failure -- producing a doctor-recovery
   * task that proposed "fixing" since-deleted code.
   *
   * Callers planning a brand NEW task (planTask/planFixTask) intentionally omit
   * `activeTaskId`, since learning from the feature's most recent lesson regardless of which
   * task it was about is the intended, existing behavior there -- only doctor-recovery
   * (which is fixing one specific active task) needs this narrower match.
   */
  private loadLatestRecoveryLesson(featureId: string, activeTaskId?: string | null): RecoveryLesson | null {
    const lesson = this.artifacts.readJson<RecoveryLesson>('latest-recovery-lesson.json');
    if (!lesson || lesson.feature_id !== featureId) {
      return null;
    }

    if (activeTaskId && primaryTaskAnchorFromId(lesson.task_id) !== primaryTaskAnchorFromId(activeTaskId)) {
      return null;
    }

    return lesson;
  }

  private loadLatestDiagnostic(featureId: string): DiagnosticAutocorrectionDecision | null {
    const diagnostic = this.artifacts.readJson<DiagnosticAutocorrectionDecision>('latest-diagnostic.json');
    if (!diagnostic || diagnostic.feature_id !== featureId) {
      return null;
    }

    return diagnostic;
  }

  private loadLatestRefinement(featureId: string, activeTaskId?: string | null): RefinementFeedback | null {
    const feedback = this.artifacts.readJson<RefinementFeedback>('latest-refinement.json');
    if (!feedback || feedback.selected_step?.feature_id !== featureId) {
      return null;
    }

    const refinementTaskId = feedback.selected_step?.task_id;
    if (activeTaskId && refinementTaskId && primaryTaskAnchorFromId(refinementTaskId) !== primaryTaskAnchorFromId(activeTaskId)) {
      return null;
    }

    return feedback;
  }

  private buildLatestDiagnosticPromptLines(featureId: string): string[] {
    const diagnostic = this.loadLatestDiagnostic(featureId);
    if (!diagnostic) {
      return [];
    }

    return [
      '',
      'Latest diagnostic/autocorrection:',
      `- diagnosis_summary: ${diagnostic.diagnosis_summary}`,
      `- blocker_kind: ${diagnostic.blocker.kind}`,
      `- blocker_signature: ${diagnostic.blocker.signature}`,
      `- blocker_recoverability: ${diagnostic.blocker.recoverability}`,
      ...diagnostic.blocker.evidence.map((item) => `- blocker_evidence: ${item}`),
      `- next_step: ${diagnostic.next_step}`,
      `- next_step_reason: ${diagnostic.next_step_reason}`,
      `- interface_mode: ${diagnostic.interface_response.mode}`,
      `- interface_summary: ${diagnostic.interface_response.summary}`,
      ...diagnostic.interface_response.target_paths.map((item) => `- interface_target_path: ${item}`),
    ];
  }

  private buildRecoveryLessonPromptLines(featureId: string, activeTaskId?: string | null): string[] {
    const lesson = this.loadLatestRecoveryLesson(featureId, activeTaskId);
    if (!lesson) {
      const refinement = this.loadLatestRefinement(featureId, activeTaskId);
      if (!refinement) {
        return [];
      }

      const lines = [
        '',
        'Recent implementation failure refinement (advisory only — produced by a prior diagnostic model call and not independently verified against the contracts; ground anything you adopt from it in the contracts listed above rather than treating it as fact):',
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
      'Recent recovery lesson (advisory only — produced by a prior review/analysis model call and not independently verified; treat it as a hypothesis to check against the contracts listed above, not as a confirmed requirement):',
      `- task_id: ${lesson.task_id}`,
      `- review_status: ${lesson.review_status}`,
      `- summary: ${lesson.summary}`,
      `- implementation_notes: ${lesson.implementation_notes ?? 'none'}`,
      ...lesson.scope_isolation_notes.map((item) => `- scope_isolation: ${item}`),
      ...lesson.review_findings.map((item) => `- review_finding: ${item}`),
      ...lesson.quality_gate_failures.map((item) => `- quality_gate_failure: ${item}`),
      `- recommended_action: ${lesson.recommended_action}`,
      `- perfectible: ${lesson.perfectible ? 'yes' : 'no'}`,
      ...lesson.implementer_limitations.map((item) => `- implementer_limitation: ${item}`),
    ];

    const adjustments = lesson.task_interface_adjustments;
    const hasAdjustments = Boolean(adjustments.first_executable_step)
      || adjustments.minimum_progress_evidence.length > 0
      || adjustments.context_additions.length > 0
      || adjustments.scope_adjustments.length > 0
      || adjustments.acceptance_criteria_adjustments.length > 0
      || adjustments.quality_gate_adjustments.length > 0;

    if (hasAdjustments) {
      lines.push(
        '- suggested_task_interface_adjustments (unverified proposals from that prior model call; adopt a suggestion only if it names a field, artifact, or mechanism that already exists in the contracts listed above — never invent a new artifact type, manifest, validator, or field name to satisfy one):',
      );
    }

    if (adjustments.first_executable_step) {
      lines.push(`- first_executable_step: ${adjustments.first_executable_step}`);
    }

    for (const item of adjustments.minimum_progress_evidence) {
      lines.push(`- minimum_progress_evidence: ${item}`);
    }

    for (const item of adjustments.context_additions) {
      lines.push(`- context_addition: ${item}`);
    }

    for (const item of adjustments.scope_adjustments) {
      lines.push(`- scope_adjustment: ${item}`);
    }

    for (const item of adjustments.acceptance_criteria_adjustments) {
      lines.push(`- acceptance_criteria_adjustment: ${item}`);
    }

    for (const item of adjustments.quality_gate_adjustments) {
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
      '## Implementation Notes',
      ...(lesson.implementation_notes ? lesson.implementation_notes.split('\n').map((item) => `- ${item}`) : ['- None recorded.']),
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
