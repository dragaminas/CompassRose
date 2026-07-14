import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative as relativePath, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
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
  ImplementationAttempt,
  ImplementationAttemptHistory,
  ImplementationDiagnostics,
  ParsedTaskDocument,
  PlannedFeatureDocs,
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
  ReviewableDiffHandoff,
  ExpectedDeliverable,
  UnblockTaskMetadata,
} from '../src/contracts/types.js';
import { selectImplementationContextArtifactNames } from '../src/contracts/runtime/agentContext.js';
import type { AgentInvocationContext, AgentToolName } from '../src/contracts/runtime/agentContext.js';
import type {
  ContractRefreshResult,
  FeatureInspection,
  FeatureRecord,
  ProtoOptions,
  RunSummary,
  StepExecutionResult,
  StepRunRecord,
} from '../src/contracts/runtime/protoRuntime.js';
import type { ProjectConfiguration } from '../src/config/configTypes.js';
import { readProjectConfiguration } from '../src/config/configReader.js';
import { resolveRepositoryRelativePath } from '../src/filesystem/pathResolver.js';
import { findGitRepositoryRoot } from '../src/git/gitStatus.js';
import { normalizeTextForWrite, readUtf8 } from '../src/filesystem/textNormalization.js';
import { parseTaskDocument, storedTaskArtifactFromDocument } from '../src/task/taskDocument.js';
import {
  buildCorrectionTaskFileName,
  buildStateCorrectionTaskId,
  buildTaskFileName,
  capTaskFileNameLength,
  humanCorrectionNumber,
  humanTaskNumber,
} from '../src/task/taskId.js';
import {
  assertTaskIdIsUnused,
  findLatestImplementationAttemptTaskId,
  findLatestTaskArtifactTaskId,
  findTaskDocumentPath,
  tryFindTaskDocumentPath,
} from '../src/task/taskStore.js';
import { extractImplementationNotes, implementationNotesIndicatesAlreadyComplete } from '../src/implementer/implementationNotes.js';
import {
  preferredRestorationTarget,
  resolveImplementationFailureActiveTask,
  restorationTargetNextPlanningHint,
  restorationTargetProjectPendingLines,
  stateCorrectionNextPlanningHint,
  stateCorrectionProjectPendingLines,
} from '../src/state/restorationTarget.js';
import { buildBlockerSignature, classifyBlockerKind } from '../src/state/blockerClassification.js';
import { uniqueStrings } from '../src/shared/arrays.js';
import { ControlledStopError, stopExitCodeForSignal } from '../src/runtime/controlledStop.js';
import { GitClient } from '../src/git/gitClient.js';
import { ArtifactStore } from '../src/artifacts/artifactStore.js';
import { DEFAULT_AGENT_HEARTBEAT_MS, runCommandWithHeartbeat } from '../src/agents/heartbeatRunner.js';
import type { HeartbeatRunConfig } from '../src/agents/heartbeatRunner.js';
import { normalizeModelName, resolveCodexImplementerModel, resolveCodexPlannerModel, resolveOpenCodeModel } from '../src/agents/modelResolution.js';
import { logAgentEnd, logAgentStart, logAgentStream } from '../src/agents/agentLogging.js';
import { CodexCli } from '../src/agents/codexCli.js';
import { OpenCodeCli } from '../src/agents/openCodeCli.js';
import type { CommandExecution, TaskImplementer } from '../src/agents/taskImplementer.js';
import { ContractRegistry } from '../src/orchestrator/contractRegistry.js';
import type { StructuredSchemaId } from '../src/orchestrator/contractRegistry.js';
// Re-exported because tests/protoReviewableDiffHandoff.test.ts imports parseTaskDocument from
// this file alongside proto-only helpers (classifyImplementation, selectReviewableDiffForReview),
// so it's simpler to keep that one import site than to split it across two modules.
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
} from '../src/markdown/sections.js';


class PrototypeCompassRose {
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
  private readonly maxTasksPerRun: number;
  private readonly runId: string;
  private readonly codexCommand: string;
  private readonly opencodeCommand: string;
  private readonly startedAt: string;
  private readonly stepRecords: StepRunRecord[] = [];
  private readonly completedPrimaryTaskAnchors = new Set<string>();
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
    this.contracts = new ContractRegistry(repositoryRoot);
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

    if (!projectStatePath || !featuresRoot) {
      throw new Error('Configuration paths for project state or features root are invalid.');
    }

    this.projectStatePath = projectStatePath;
    this.featuresRoot = featuresRoot;
    this.maxTasksPerRun = readPositiveInteger(limits, 'max_tasks_per_run') ?? Number.POSITIVE_INFINITY;
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

  private determineNextStep(): StepDecision {
    for (const feature of this.listFeatures()) {
      const decision = this.selectStepForFeature(feature);
      if (decision) {
        return decision;
      }
    }

    return {
      kind: 'stop',
      feature_id: null,
      task_id: null,
      correction_task_id: null,
      reason: 'No non-completed feature remains.',
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
        if (this.completedPrimaryTaskAnchors.size >= this.maxTasksPerRun) {
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
      case 'blocked':
        return {
          kind: 'blocked',
          reason: `Feature ${feature.id} is blocked and needs diagnosis/autocorrection to choose bounded recovery or an explicit stop.`,
          snapshot,
        };
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

  private executeStep(decision: StepDecision): StepExecutionResult {
    switch (decision.kind) {
      case 'plan_feature':
        this.planFeature(requireString(decision.feature_id, 'feature_id'));
        return { exitCode: 0, continueLoop: true, summary: `Feature ${requireString(decision.feature_id, 'feature_id')} formalized.` };
      case 'plan_task':
        this.planTask(requireString(decision.feature_id, 'feature_id'));
        return { exitCode: 0, continueLoop: true, summary: `Next task planned for feature ${requireString(decision.feature_id, 'feature_id')}.` };
      case 'plan_subtask':
        this.planSubtask(requireString(decision.task_id, 'task_id'));
        return { exitCode: 0, continueLoop: true, summary: `Subtask prepared for ${requireString(decision.task_id, 'task_id')}.` };
      case 'correct_state':
        this.correctState(requireString(decision.feature_id, 'feature_id'), decision.reason);
        return { exitCode: 0, continueLoop: true, summary: `State correction task created for feature ${requireString(decision.feature_id, 'feature_id')}.` };
      case 'doctor_recovery_task':
        return this.runDoctorRecoveryTask(requireString(decision.task_id, 'task_id'));
      case 'unblock_task':
        this.planDoctorRecoveryTask(requireString(decision.feature_id, 'feature_id'), decision.reason);
        return { exitCode: 0, continueLoop: true, summary: `Doctor recovery task planned for feature ${requireString(decision.feature_id, 'feature_id')}.` };
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
      `docs/features/${featureId}/`,
    ]);
  }

  private planFeature(featureId: string): void {
    this.ensureCleanWorktreeIfRequired(featureId);
    const feature = this.loadFeature(featureId);
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
      '- `docs/ROADMAP.md`',
      '- `docs/SAD.md`',
      '- `docs/ADR.md`',
      '- `docs/DMS.md`',
      '',
      'Return JSON with complete Markdown for `feature.md`, `architecture.md`, and `state.md`.',
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
    const sourcePaths = [
      'src/contracts/planner/task-planning-prompt.md',
      'src/contracts/planner/input.md',
      'src/contracts/planner/output.md',
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
      '- If this task is a later version of an earlier task, set `previous_task_id` to that earlier task so the earlier task remains historical evidence; otherwise set it to `null`.',
      '- Use `test_guided` for implementation tasks that produce code.',
      '- `quality_gates.before_review` must contain runnable shell commands, not prose.',
      '- Any recovery lesson above is an unverified suggestion from a prior model call, not a confirmed requirement — only carry a suggested field, artifact, or mechanism into this task if it already exists in the contracts you were told to read; never invent a new manifest, validator, or artifact type to satisfy one.',
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
    const task = planned.task;
    validateTaskDeliverables(task, 'task');
    this.assertTaskIdIsUnused(feature.tasksDirectory, task.task_id, 'Task planning');

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

  private planSubtask(taskId: string): void {
    const task = this.loadTask(taskId);
    this.ensureCleanWorktreeIfRequired(task.featureId);
    const feature = this.loadFeature(task.featureId);

    writeText(feature.statePath, this.updateFeatureStateDuringImplementation(feature.statePath, task.taskId));
    writeText(this.projectStatePath, this.updateProjectStateDuringImplementation(task.featureId, task.taskId));

    if (this.options.commit) {
      this.git.commit(
        [
          relativePath(this.repositoryRoot, feature.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
        ],
        `proto: prepare subtask ${task.taskId}`,
      );
    }
  }

  private planDoctorRecoveryTask(featureId: string, reason: string): void {
    const feature = this.loadFeature(featureId);
    const snapshot = this.readFeatureStateSnapshot(feature);
    const recoveryActiveTask = snapshot.lifecycleState === 'implementation_failed'
      ? this.resolveImplementationFailureActiveTask(feature, snapshot)
      : null;
    const blocker = this.buildBlockerProfile(snapshot, reason);
    const restorationTarget = snapshot.lifecycleState === 'implementation_failed'
      ? this.buildImplementationFailureRestorationTarget(feature, snapshot)
      : this.preferredRestorationTarget(snapshot);
    const sourcePaths = [
      'src/contracts/planner/doctor-recovery-planning-prompt.md',
      'src/contracts/planner/input.md',
      'src/contracts/planner/output.md',
      'src/contracts/state/feature-state.md',
      'src/contracts/task/doctor-recovery-task.md',
      'src/contracts/task/state-correction-task.md',
      relativePath(this.repositoryRoot, feature.featurePath),
      relativePath(this.repositoryRoot, feature.architecturePath),
      relativePath(this.repositoryRoot, feature.statePath),
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
      `- \`${relativePath(this.repositoryRoot, feature.featurePath)}\``,
      `- \`${relativePath(this.repositoryRoot, feature.architecturePath)}\``,
      `- \`${relativePath(this.repositoryRoot, feature.statePath)}\``,
      ...(recoveryActiveTask ? [`- \`.git/proto-compassrose/implementation-attempts/${recoveryActiveTask}.json\``] : []),
      '- `docs/compassrose/PROJECT_STATE.md`',
      '- `docs/compassrose/CONFIG.md`',
      '- `src/contracts/runtime/operation-loop.md`',
      ...this.buildLatestDiagnosticPromptLines(featureId),
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
    this.assertTaskIdIsUnused(feature.tasksDirectory, task.task_id, 'Doctor recovery planning');

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

    const taskPath = join(feature.tasksDirectory, buildTaskFileName(task.task_id, task.title));
    const taskMarkdown = renderDoctorRecoveryTaskMarkdown(task, doctorRecoveryMetadata);

    writeText(taskPath, taskMarkdown);
    this.artifacts.writeJson(join('tasks', `${task.task_id}.json`), {
      ...planned,
      doctor_recovery: doctorRecoveryMetadata,
    });
    this.writeBlockerProfile(featureId, task.task_id, blocker, doctorRecoveryMetadata.restoration_target, reason);

    const updatedFeatureState = this.updateFeatureStateForDoctorRecovery(feature.statePath, task.task_id, restorationTarget);
    const updatedProjectState = this.updateProjectStateForDoctorRecovery(featureId, task.task_id, restorationTarget.lifecycle_state);
    writeText(feature.statePath, updatedFeatureState);
    writeText(this.projectStatePath, updatedProjectState);

    if (this.options.commit) {
      this.git.commit(
        [
          relativePath(this.repositoryRoot, taskPath),
          relativePath(this.repositoryRoot, feature.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
        ],
        `proto: plan doctor recovery ${featureId}`,
      );
    }
  }

  private planUnblockTask(featureId: string, reason: string): void {
    this.planDoctorRecoveryTask(featureId, reason);
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

  private diagnoseAndAutocorrect(featureId: string, reason: string): StepExecutionResult {
    const feature = this.loadFeature(featureId);
    const decision = this.runDiagnosticAutocorrection(feature, reason);
    this.writeDiagnosticArtifact(decision);

    if (decision.next_step === 'correct_state') {
      if (!statSafeIsFile(feature.statePath)) {
        return {
          exitCode: 2,
          continueLoop: false,
          summary: `${decision.next_step_reason} The current runtime cannot generate a deterministic state-correction artifact because ${relativePath(this.repositoryRoot, feature.statePath)} is missing.`,
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
      if (!this.tryReadFeatureStateSnapshot(feature)) {
        return {
          exitCode: 2,
          continueLoop: false,
          summary: `${decision.next_step_reason} The current runtime cannot plan doctor recovery because feature state is unreadable and no restoration target can be trusted.`,
        };
      }

      this.planDoctorRecoveryTask(featureId, decision.next_step_reason);
      return {
        exitCode: 0,
        continueLoop: true,
        summary: `Diagnostic/autocorrection planned a doctor recovery task for feature ${featureId}.`,
      };
    }

    if (statSafeIsFile(feature.statePath)) {
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

  private runDiagnosticAutocorrection(feature: FeatureRecord, reason: string): DiagnosticAutocorrectionDecision {
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

  private buildMissingStateBlocker(feature: FeatureRecord, reason: string): BlockerProfile {
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
    feature: FeatureRecord,
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
    feature: FeatureRecord,
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
    feature: FeatureRecord,
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
    feature: FeatureRecord,
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
    feature: FeatureRecord,
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

  private buildDiagnosticArtifactPromptLines(feature: FeatureRecord): string[] {
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
    const failed = this.executeImplementation(task, false, null);
    return failed
      ? {
          exitCode: 0,
          continueLoop: true,
          summary: `Implementation for ${taskId} failed; doctor recovery planning will continue.`,
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
          summary: `Correction implementation for ${correctionTaskId} failed; doctor recovery planning will continue.`,
        }
      : {
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
    const feature = this.loadFeature(task.featureId);
    const qualityResults = this.ensureQualityGateResults(task);
    const implementation = this.ensureImplementationAttempt(task);
    // Exclude the runtime's own state-doc bookkeeping (written live to the working tree by
    // executeImplementation) from what the reviewer sees as "the submitted diff" — otherwise the
    // reviewer mistakes orchestrator bookkeeping for an implementer scope violation. Same exclusion
    // captureImplementationAttempt and ensureImplementationAttempt already apply.
    const reviewDiffExcludedPaths = [
      relativePath(this.repositoryRoot, feature.statePath),
      relativePath(this.repositoryRoot, this.projectStatePath),
    ];
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
      relativePath(this.repositoryRoot, feature.featurePath),
      relativePath(this.repositoryRoot, feature.architecturePath),
      relativePath(this.repositoryRoot, feature.statePath),
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
      `- \`${relativePath(this.repositoryRoot, feature.featurePath)}\``,
      `- \`${relativePath(this.repositoryRoot, feature.architecturePath)}\``,
      `- \`${relativePath(this.repositoryRoot, feature.statePath)}\``,
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
      ? this.analyzeTaskInterface(task, feature, review, implementation, qualityResults, tempDir, stateCorrection, doctorRecovery)
      : null;

    if (taskInterfaceAnalysis && review.status !== 'approved') {
      this.recordRecoveryLesson(task, review, implementation, qualityResults, taskInterfaceAnalysis, review.correction_task?.correction_task_id ?? null);
    }

    if (review.status === 'approved') {
    const updatedFeatureState = stateCorrection
        ? this.updateFeatureStateAfterStateCorrection(feature.statePath, task.taskId, stateCorrection)
        : doctorRecovery
          ? this.updateFeatureStateAfterDoctorRecovery(feature.statePath, task, doctorRecovery)
          : this.updateFeatureStateAfterApprovedReview(feature.statePath, task);
      const updatedProjectState = stateCorrection
        ? this.updateProjectStateAfterStateCorrection(task.featureId, stateCorrection)
        : doctorRecovery
          ? this.updateProjectStateAfterDoctorRecovery(task.featureId, task.taskId, doctorRecovery.restoration_target)
          : this.updateProjectStateAfterApprovedReview(task.featureId, task.taskId);
      writeText(feature.statePath, updatedFeatureState);
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
      this.assertTaskIdIsUnused(feature.tasksDirectory, correction.correction_task_id, 'Review correction-task authoring');
      const correctionPath = this.writeCorrectionTask(correction);
      this.artifacts.writeJson(join('tasks', `${correction.correction_task_id}.json`), {
        task: correctionTaskToTask(correction),
      });

      const updatedFeatureState = this.updateFeatureStateForCorrection(feature.statePath, task.taskId, correction.correction_task_id);
      const updatedProjectState = this.updateProjectStateForCorrection(task.featureId, correction.correction_task_id);
      writeText(feature.statePath, updatedFeatureState);
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

  private executeDoctorRecoveryTask(
    task: ParsedTaskDocument,
    doctorRecovery: DoctorRecoveryTaskMetadata,
  ): StepExecutionResult {
    const feature = this.loadFeature(task.featureId);
    const recoveryLessonLines = this.buildRecoveryLessonPromptLines(task.featureId);
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
        feature,
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
    const passed = qualityResults.every((result) => result.status !== 'failed');
    if (!passed) {
      const failures = qualityResults
        .filter((result) => result.status === 'failed')
        .map((result) => `${result.name}: ${result.output_summary}`);
      return this.stopAfterDoctorRecoveryFailure(
        feature,
        task,
        doctorRecovery,
        `Doctor recovery ${task.taskId} failed its re-entry quality gates.\n${failures.join('\n')}`,
      );
    }

    const updatedFeatureState = this.updateFeatureStateAfterDoctorRecovery(feature.statePath, task, doctorRecovery);
    const updatedProjectState = this.updateProjectStateAfterDoctorRecovery(task.featureId, task.taskId, doctorRecovery.restoration_target);
    writeText(feature.statePath, updatedFeatureState);
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
    feature: FeatureRecord,
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
          relativePath(this.repositoryRoot, feature.statePath),
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
    feature: FeatureRecord,
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
      relativePath(this.repositoryRoot, feature.featurePath),
      relativePath(this.repositoryRoot, feature.architecturePath),
      relativePath(this.repositoryRoot, feature.statePath),
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
      `- \`${relativePath(this.repositoryRoot, feature.featurePath)}\``,
      `- \`${relativePath(this.repositoryRoot, feature.architecturePath)}\``,
      `- \`${relativePath(this.repositoryRoot, feature.statePath)}\``,
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

  private executeImplementation(task: ParsedTaskDocument, correction: boolean, stateCorrection: StateCorrectionTask | null): boolean {
    const recoveryLessonLines = this.buildRecoveryLessonPromptLines(task.featureId);
    const prompt = buildImplementerPrompt(task, correction, stateCorrection, recoveryLessonLines);
    const feature = this.loadFeature(task.featureId);
    const implementationStatePaths = [
      relativePath(this.repositoryRoot, feature.statePath),
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
    writeText(feature.statePath, this.updateFeatureStateDuringImplementation(feature.statePath, task.taskId));
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
      writeText(feature.statePath, this.updateFeatureStateAfterImplementationFailure(feature.statePath, task.taskId, failureReason));
      writeText(this.projectStatePath, this.updateProjectStateAfterImplementationFailure(task.featureId, task.taskId, failureReason));
      this.writeRefinementFeedback(failureReason, {
        kind: correction ? 'correct_task' : 'implement_subtask',
        feature_id: task.featureId,
        task_id: task.taskId,
        correction_task_id: correction ? task.taskId : null,
        reason: failureReason,
      });
      console.error(`Implementation for ${task.taskId} failed; recovery will continue through doctor recovery planning.`);
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
      return true;
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

    const feature = this.loadFeature(task.featureId);
    const diff = this.git.diffPatch([
      relativePath(this.repositoryRoot, feature.statePath),
      relativePath(this.repositoryRoot, this.projectStatePath),
    ]);
    return {
      status: 'failed',
      changed_files: this.git.diffNameOnly([
        relativePath(this.repositoryRoot, feature.statePath),
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
    const markdown = readUtf8(feature.statePath);
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
    this.assertTaskIdIsUnused(feature.tasksDirectory, stateCorrection.task_id, 'State correction planning');
    const path = this.writeStateCorrectionTask(stateCorrection);
    this.artifacts.writeJson(join('tasks', `${stateCorrection.task_id}.json`), {
      task: stateCorrectionTaskToTask(stateCorrection),
      state_correction: stateCorrection,
    });

    const stateCorrectionTask = stateCorrectionTaskToTask(stateCorrection);
    const updatedFeatureState = this.updateFeatureStateAfterStateCorrection(feature.statePath, stateCorrection.task_id, stateCorrection);
    const updatedProjectState = this.updateProjectStateAfterStateCorrection(featureId, stateCorrection);
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
    console.error(`State correction artifact ${stateCorrection.task_id} applied and recorded at ${relativePath(this.repositoryRoot, path)}.`);
  }

  private resolveStateCorrectionActiveTask(feature: FeatureRecord, featureStateMarkdown: string): string {
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

  private resolveImplementationFailureActiveTask(feature: FeatureRecord, snapshot: FeatureStateSnapshot): string | null {
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

  private tryReadFeatureStateSnapshot(feature: FeatureRecord): FeatureStateSnapshot | null {
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
    const feature = this.loadFeature(featureId);
    const snapshot = this.readFeatureStateSnapshot(feature);
    const blocker = this.buildBlockerProfile(snapshot, reason);
    const restorationTarget = this.preferredRestorationTarget(snapshot);
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
    const restorationTarget = this.preferredRestorationTarget(snapshot);
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

  private updateFeatureStateForTaskPlan(featureStatePath: string, taskId: string, title: string): string {
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
    return markdown;
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
  ): string {
    let markdown = readUtf8(featureStatePath);
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
    markdown = replaceSection(markdown, 'Next Planning Hint', `Execute doctor recovery task \`${taskId}\` next.`);
    return markdown;
  }

  private updateFeatureStateForUnblock(
    featureStatePath: string,
    taskId: string,
    restorationTarget: RestorationTarget,
  ): string {
    return this.updateFeatureStateForDoctorRecovery(featureStatePath, taskId, restorationTarget);
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

  private loadLatestRecoveryLesson(featureId: string): RecoveryLesson | null {
    const lesson = this.artifacts.readJson<RecoveryLesson>('latest-recovery-lesson.json');
    if (!lesson || lesson.feature_id !== featureId) {
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

  private loadLatestRefinement(featureId: string): RefinementFeedback | null {
    const feedback = this.artifacts.readJson<RefinementFeedback>('latest-refinement.json');
    if (!feedback || feedback.selected_step?.feature_id !== featureId) {
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

  private buildRecoveryLessonPromptLines(featureId: string): string[] {
    const lesson = this.loadLatestRecoveryLesson(featureId);
    if (!lesson) {
      const refinement = this.loadLatestRefinement(featureId);
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

function main(argv: readonly string[]): number {
  const options = parseArguments(argv);
  const orchestrator = new PrototypeCompassRose(options);
  return orchestrator.run();
}

function parseArguments(argv: readonly string[]): ProtoOptions {
  let loop = false;
  let commit = true;
  let cwd = process.cwd();
  let implementer: AgentToolName = 'opencode';

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
  const lineageSection = task.previous_task_id
    ? [
        '## Task Lineage',
        '',
        `- previous_task_id: \`${task.previous_task_id}\``,
        '',
      ]
    : [];

  return [
    `# Task ${humanTaskNumber(task.task_id)}: ${task.title}`,
    '',
    '## Task ID',
    `\`${task.task_id}\``,
    '',
    ...lineageSection,
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

function renderDoctorRecoveryTaskMarkdown(task: PlannedTask, doctorRecovery: DoctorRecoveryTaskMetadata): string {
  return [
    renderTaskMarkdown(task).trimEnd(),
    '',
    '## Doctor Recovery',
    '',
    `- executor_role: ${doctorRecovery.executor_role ?? 'doctor'}`,
    `- review_policy: ${doctorRecovery.review_policy ?? 'no_review_loop'}`,
    '',
    '## Blocker Context',
    '',
    `- kind: ${doctorRecovery.blocker.kind}`,
    `- signature: ${doctorRecovery.blocker.signature}`,
    `- recoverability: ${doctorRecovery.blocker.recoverability}`,
    `- observed_state: ${doctorRecovery.blocker.observed_state}`,
    ...(doctorRecovery.blocker.evidence.length > 0 ? doctorRecovery.blocker.evidence.map((item) => `- evidence: ${item}`) : ['- evidence: none']),
    '',
    '## Restoration Target',
    '',
    `- lifecycle_state: ${doctorRecovery.restoration_target.lifecycle_state}`,
    `- active_task: \`${doctorRecovery.restoration_target.active_task}\``,
    `- active_correction_task: \`${doctorRecovery.restoration_target.active_correction_task}\``,
    `- active_unblock_task: \`${doctorRecovery.restoration_target.active_unblock_task}\``,
    '',
  ].join('\n');
}

function renderUnblockTaskMarkdown(task: PlannedTask, unblock: UnblockTaskMetadata): string {
  return renderDoctorRecoveryTaskMarkdown(task, unblock);
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



function isBlockerKind(value: string): value is BlockerKind {
  return value === 'state_corruption'
    || value === 'task_interface_gap'
    || value === 'cli_mismatch'
    || value === 'environment'
    || value === 'implementation_failure'
    || value === 'review_failure'
    || value === 'unknown';
}

function isBlockerRecoverability(value: string): value is BlockerRecoverability {
  return value === 'auto' || value === 'agent' || value === 'human' || value === 'terminal';
}

function readValueFromStructuredLines(lines: readonly string[], key: string): string | null {
  for (const line of lines) {
    const normalized = line.trim();
    if (!normalized.toLowerCase().startsWith(`${key.toLowerCase()}:`)) {
      continue;
    }

    const value = normalized.slice(key.length + 1).trim();
    return value.length > 0 ? stripTicks(value) : null;
  }

  return null;
}

function buildImplementerPrompt(
  task: ParsedTaskDocument,
  correction: boolean,
  stateCorrection: StateCorrectionTask | null,
  recoveryLessonLines: readonly string[] = [],
): string {
  const role = stateCorrection ? 'state repair task' : 'subtask';
  const requiredDiffLine = task.reviewableDiffHandoff.requireLiveDiff
    ? (task.reviewableDiffHandoff.requiredChangedFiles.length > 0
        ? `- At handoff, leave the live worktree diff visible and limited to: ${task.reviewableDiffHandoff.requiredChangedFiles.map((item) => `\`${item}\``).join(', ')}.`
        : '- Leave the live worktree diff visible for handoff so CompassRose can capture the reviewable change directly.')
    : '- The task contract allows a non-live-diff handoff, but you still need to preserve the required repository evidence.';
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
    requiredDiffLine,
    !task.reviewableDiffHandoff.requireLiveDiff || task.reviewableDiffHandoff.allowGitCommitBeforeHandoff
      ? '- The task contract explicitly allows clearing the live diff before handoff if you still preserve the required evidence.'
      : '- Do not run `git commit` or otherwise clear the live worktree diff before handoff; CompassRose captures reviewable evidence from the live diff.',
    '- Continue until there is repository evidence beyond read-only exploration.',
    `- Follow \`${task.developmentPolicy}\`.`,
    '- Keep the change minimal and provider-independent.',
    '- If the task or any recovery-lesson context above references a mechanism, manifest, validator, or field that is not in the contracts you were told to read, report that as a task-interface defect in your notes; do not fabricate placeholder files or evidence to satisfy it.',
    '- End every attempt with a short `## Implementation Notes` section written in your own final reply text, not only inside an edited file; the runtime reads it from what you say, not from a diff.',
    '- If you changed repository files, justify the change briefly and cite the evidence.',
    '- If you made no repository changes because the task already appears satisfied, start the notes with the line `Status: already_complete` and cite the repository evidence that already satisfies it; the runtime relies on that exact line to tell a satisfied task apart from a stalled one.',
    '- If you made no repository changes because you are blocked, explain why and cite the evidence; do not use the `Status: already_complete` line unless the requested behavior genuinely already exists.',
    '- Keep implementation notes brief and separate from product documentation.',
    '- Do not claim approval.',
  ].join('\n');
}

function buildDoctorRecoveryPrompt(
  task: ParsedTaskDocument,
  doctorRecovery: DoctorRecoveryTaskMetadata,
  recoveryLessonLines: readonly string[] = [],
): string {
  return [
    'Act as the CompassRose Doctor.',
    '',
    `Execute doctor recovery task \`${task.taskId}\` for feature \`${task.featureId}\`.`,
    '',
    'Read only:',
    '- `src/contracts/runtime/doctor-recovery-execution-prompt.md`',
    '- `src/contracts/task/doctor-recovery-task.md`',
    `- \`${task.path}\``,
    ...task.likelyAffectedFiles.map((item) => `- \`${item}\``),
    '',
    'Recovery context:',
    `- blocker_kind: ${doctorRecovery.blocker.kind}`,
    `- blocker_signature: ${doctorRecovery.blocker.signature}`,
    `- restoration_lifecycle_state: ${doctorRecovery.restoration_target.lifecycle_state}`,
    `- restoration_active_task: ${doctorRecovery.restoration_target.active_task}`,
    ...doctorRecovery.blocker.evidence.map((item) => `- blocker_evidence: ${item}`),
    '',
    'Instructions:',
    `- Start with: ${task.firstExecutableStep}`,
    '- Follow `src/contracts/runtime/doctor-recovery-execution-prompt.md`.',
    '- Keep the recovery bounded to the blocker and restoration target.',
    '- Preserve task lineage and blocker evidence.',
    '- You may touch docs, state, src, and tests only when they are required by the recorded recovery scope.',
    '- Do not widen into unrelated backlog work.',
    '- Do not run `git commit`; leave the recovery diff available for the runtime handoff.',
    '- Treat `quality_gates.before_review` as doctor re-entry gates.',
    '- If the task or any recovery-lesson context below references a mechanism, manifest, validator, or field that is not in the contracts you were told to read, report that as a task-interface defect in your notes; do not fabricate placeholder artifacts or files to satisfy it.',
    ...recoveryLessonLines,
    `- Follow \`${task.developmentPolicy}\`.`,
    '- End every attempt with a short `## Implementation Notes` section written in your own final reply text, not only inside an edited file; the runtime reads it from what you say, not from a diff.',
    '- If you changed repository files, justify the recovery briefly and cite the blocker evidence.',
    '- If you made no repository changes because the restoration target already holds, start the notes with the line `Status: already_complete` and cite the evidence; the runtime relies on that exact line to tell an already-satisfied recovery apart from one that could not proceed.',
    '- If you made no repository changes because the recovery could not proceed, explain why; do not use the `Status: already_complete` line unless the restoration target genuinely already holds.',
  ].join('\n');
}

function buildImplementationDiagnostics(
  task: ParsedTaskDocument,
  commandResult: CommandExecution,
  changedFiles: readonly string[],
  diff: string,
  fallbackDiff: string | null,
  rawOutput: string,
  implementationNotes: string | null,
  headBefore: string | null,
  headAfter: string | null,
): ImplementationDiagnostics {
  const hasDiff = diff.trim().length > 0;
  const headChanged = Boolean(headBefore && headAfter && headBefore !== headAfter);
  const alreadyComplete = implementationNotesIndicatesAlreadyComplete(implementationNotes);
  const evidence = [
    `Task: ${task.taskId}`,
    `Changed files: ${changedFiles.length > 0 ? changedFiles.join(', ') : 'none'}`,
    `Fallback diff: ${fallbackDiff && fallbackDiff.trim().length > 0 ? 'present' : 'absent'}`,
    `Implementation notes: ${implementationNotes ? 'present' : 'absent'}`,
    `Implementation completion signal: ${alreadyComplete ? 'already_complete' : 'not_detected'}`,
    `Exit code: ${commandResult.exitCode ?? 'null'}`,
    `Signal: ${commandResult.signal ?? 'null'}`,
    `Head changed during attempt: ${headChanged ? `yes (${headBefore} -> ${headAfter})` : 'no'}`,
    `Output tail: ${summarizeText(rawOutput, 400)}`,
  ];

  return {
    classification: classifyImplementation(commandResult, rawOutput, hasDiff, implementationNotes, headBefore, headAfter, fallbackDiff),
    evidence,
    first_executable_step_status: hasDiff || rawOutput.trim().length > 0 ? 'attempted' : 'unknown',
    minimum_progress_evidence_status: hasDiff || alreadyComplete ? 'present' : 'absent',
    exit_code: commandResult.exitCode,
    signal: commandResult.signal,
    timed_out: commandResult.timedOut,
    command_invoked: commandResult.commandInvoked,
  };
}

export function classifyImplementation(
  commandResult: CommandExecution,
  rawOutput: string,
  hasDiff: boolean,
  implementationNotes: string | null,
  headBefore: string | null = null,
  headAfter: string | null = null,
  fallbackDiff: string | null = null,
): DiagnosticClassification {
  const normalized = rawOutput.toLowerCase();
  const headChanged = Boolean(headBefore && headAfter && headBefore !== headAfter);
  const hasFallbackDiff = Boolean(fallbackDiff && fallbackDiff.trim().length > 0);
  const alreadyComplete = implementationNotesIndicatesAlreadyComplete(implementationNotes);

  if (!hasDiff && commandResult.ok && ((headChanged && hasFallbackDiff) || outputShowsCommittedReviewableDiff(rawOutput))) {
    return 'reviewable_diff_lost';
  }

  if (commandResult.ok && !hasDiff && alreadyComplete) {
    return 'already_complete';
  }

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

  if (commandResult.ok && !implementationNotes) {
    return 'missing_implementation_notes';
  }

  if (!hasDiff && commandResult.ok) {
    return 'model_passivity';
  }

  if (/tty|interactive|terminal ui|render/i.test(normalized)) {
    return 'ui_cli_behavior';
  }

  return 'unknown';
}

function outputShowsCommittedReviewableDiff(rawOutput: string): boolean {
  return /^\$ .*git\s+.*commit/m.test(rawOutput)
    || /^\[[^\]]+\s+[0-9a-f]{7,}\]/m.test(rawOutput)
    || /evidence committed:\s*[0-9a-f]{7,}/i.test(rawOutput);
}

export function selectReviewableDiffForReview(
  liveDiff: string,
  implementation: Pick<ImplementationAttempt, 'diagnostics' | 'fallback_git_diff'>,
): { diff: string; source: 'live' | 'fallback' | 'none' } {
  if (liveDiff.trim().length > 0) {
    return { diff: liveDiff, source: 'live' };
  }

  if (implementation.diagnostics.classification === 'reviewable_diff_lost' && implementation.fallback_git_diff) {
    return { diff: implementation.fallback_git_diff, source: 'fallback' };
  }

  return { diff: '', source: 'none' };
}

function buildImplementationErrorMessage(
  taskId: string,
  commandResult: CommandExecution,
  diagnostics: ImplementationDiagnostics,
  hasDiff: boolean,
  implementationNotes: string | null,
): string {
  if (!commandResult.ok && commandResult.exitCode !== null) {
    return `Implementation for ${taskId} failed with exit code ${commandResult.exitCode} (${diagnostics.classification}).`;
  }

  if (!implementationNotes) {
    return `Implementation for ${taskId} did not include the required Implementation Notes justification.`;
  }

  if (diagnostics.classification === 'reviewable_diff_lost') {
    return `Implementation for ${taskId} lost the live reviewable diff before handoff (reviewable_diff_lost).`;
  }

  if (!hasDiff) {
    return `Implementation for ${taskId} produced no git diff (${diagnostics.classification}).`;
  }

  if (diagnostics.minimum_progress_evidence_status === 'absent') {
    return `Implementation for ${taskId} did not produce minimum progress evidence.`;
  }

  return `Implementation for ${taskId} failed (${diagnostics.classification}).`;
}


function validateTaskDeliverables(task: PlannedTask, taskLabel: string): void {
  const deliversExecutableWork = task.expected_deliverables.some((deliverable) => deliverable === 'code' || deliverable === 'tests');
  const deliversDocumentation = task.expected_deliverables.includes('documentation');

  if (task.development_policy.mode === 'documentation_first' && deliversExecutableWork) {
    throw new Error(
      `Planned ${taskLabel} ${task.task_id} must not deliver code or tests when it uses \`documentation_first\`.`,
    );
  }

  if (taskLabel === 'unblock task' && deliversDocumentation) {
    throw new Error(`Planned unblock task ${task.task_id} must not deliver documentation.`);
  }

  if (taskLabel === 'unblock task' && task.development_policy.mode !== 'test_guided') {
    throw new Error(`Planned unblock task ${task.task_id} must use \`test_guided\`.`);
  }

  if (deliversExecutableWork && task.development_policy.mode !== 'test_guided') {
    throw new Error(`Planned ${taskLabel} ${task.task_id} must use \`test_guided\` when it delivers code or tests.`);
  }
}

function inferLikelySources(trigger: string, selectedStep: StepDecision | null): string[] {
  const sources = new Set<string>();
  const normalized = trigger.toLowerCase();

  sources.add('src/contracts/runtime/operation-loop.md');

  if (selectedStep?.kind === 'plan_feature') {
    sources.add('src/contracts/planner/feature-planning-prompt.md');
    sources.add('docs/features/README.md');
  }

  if (selectedStep?.kind === 'plan_task' || selectedStep?.kind === 'plan_subtask') {
    sources.add('src/contracts/planner/task-planning-prompt.md');
    sources.add('src/contracts/planner/output.md');
    sources.add('src/contracts/task/task.md');
  }

  if (selectedStep?.kind === 'unblock_task' || selectedStep?.kind === 'doctor_recovery_task') {
    sources.add('src/contracts/planner/doctor-recovery-planning-prompt.md');
    sources.add('src/contracts/task/doctor-recovery-task.md');
    sources.add('src/contracts/state/feature-state.md');
  }

  if (selectedStep?.kind === 'diagnose_autocorrect') {
    sources.add('src/contracts/runtime/diagnostic-autocorrection.md');
    sources.add('src/contracts/task/doctor-recovery-task.md');
    sources.add('src/contracts/task/state-correction-task.md');
    sources.add('src/contracts/state/feature-state.md');
  }

  if (selectedStep?.kind === 'implement_task' || selectedStep?.kind === 'implement_subtask' || selectedStep?.kind === 'correct_task') {
    sources.add('src/contracts/implementer/task-execution-prompt.md');
    sources.add('src/contracts/adapters/implementer-adapter.md');
    sources.add('src/contracts/task/task.md');
  }

  if (selectedStep?.kind === 'review_task' || selectedStep?.kind === 'review_subtask') {
    sources.add('src/contracts/reviewer/review-prompt.md');
    sources.add('src/contracts/reviewer/output.md');
    sources.add('src/contracts/task/correction-task.md');
  }

  if (normalized.includes('project configuration') || normalized.includes('configuration paths')) {
    sources.add('docs/compassrose/CONFIG.md');
    sources.add('src/config/configReader.ts');
  }

  if (normalized.includes('git diff is empty') || normalized.includes('produced no git diff') || normalized.includes('reviewable diff')) {
    sources.add('src/contracts/adapters/implementer-adapter.md');
    sources.add('src/contracts/reviewer/input.md');
    sources.add('src/contracts/implementer/task-execution-prompt.md');
    sources.add('src/contracts/task/task.md');
  }

  if (normalized.includes('implementation notes') || normalized.includes('justification')) {
    sources.add('src/contracts/implementer/task-execution-prompt.md');
    sources.add('src/contracts/adapters/implementer-adapter.md');
    sources.add('src/contracts/reviewer/input.md');
    sources.add('src/contracts/reviewer/review-prompt.md');
    sources.add('src/contracts/runtime/operation-loop.md');
    sources.add('src/contracts/state/feature-state.md');
  }

  if (normalized.includes('blocked') || normalized.includes('blocker')) {
    sources.add('src/contracts/task/doctor-recovery-task.md');
    sources.add('src/contracts/runtime/operation-loop.md');
  }

  if (normalized.includes('implementation failed') || normalized.includes('implementation_failure')) {
    sources.add('src/contracts/task/doctor-recovery-task.md');
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

  if (normalized.includes('doctor recovery') || normalized.includes('unblock task') || normalized.includes('unblock_pending')) {
    sources.add('src/contracts/task/doctor-recovery-task.md');
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

  if (/git diff is empty|produced no git diff|reviewable diff/i.test(trigger)) {
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
    observations.push('The runtime should continue into a bounded doctor recovery task instead of stopping on the failed implementation state.');
  }

  if (/implementation notes|justification/i.test(trigger)) {
    observations.push('The implementer must justify the attempt outcome before the reviewer can trust the artifact.');
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

  if (/git diff is empty|produced no git diff|reviewable diff/i.test(trigger)) {
    questions.push('Should the implementer adapter preserve stronger minimum-progress evidence before review is attempted?');
    questions.push('Should the task contract make live-diff handoff and no-commit expectations explicit?');
  }

  if (/quality gates failed/i.test(trigger)) {
    questions.push('Should quality-gate failure transition rules be documented more explicitly in the runtime contract?');
  }

  if (/blocked|blocker/i.test(trigger)) {
    questions.push('Should the blocker be classified into a reusable doctor recovery profile before the run stops?');
  }

  if (/implementation failed|implementation_failure/i.test(trigger)) {
    questions.push('Should implementation failure automatically open a bounded doctor recovery task that restores the active task target?');
  }

  if (/implementation notes|justification/i.test(trigger)) {
    questions.push('Should missing Implementation Notes fail the implementation attempt immediately so the reviewer never sees an ambiguous artifact?');
  }

  if (selectedStep?.kind === 'plan_task') {
    questions.push('Did the planner receive enough repository-local context to produce a bounded task?');
  }

  if (selectedStep?.kind === 'plan_subtask') {
    questions.push('Did the runtime have enough context to move the active task into a concrete subtask execution pass?');
  }

  if (selectedStep?.kind === 'review_task' || selectedStep?.kind === 'review_subtask') {
    questions.push('Did the reviewer receive enough structured implementation evidence beyond the raw diff?');
  }

  if (selectedStep?.kind === 'unblock_task' || selectedStep?.kind === 'doctor_recovery_task') {
    questions.push('Did the doctor recovery prompt expose enough blocker context and restoration target detail for planning?');
  }

  if (selectedStep?.kind === 'diagnose_autocorrect') {
    questions.push('Did the diagnostic/autocorrection step choose the smallest safe recovery path instead of falling back to a generic stop?');
    questions.push('If the blocker came from a weak interface, was that hardening captured for the doctor recovery task or the diagnostic stop?');
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

function bulletList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

function compareFeatureIds(left: string, right: string): number {
  const leftNumber = Number.parseInt(left.split('-')[0] ?? '0', 10);
  const rightNumber = Number.parseInt(right.split('-')[0] ?? '0', 10);
  return leftNumber - rightNumber;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecordString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readPositiveInteger(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function createRunId(): string {
  return `run-${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '--').replace('Z', '')}`;
}

function statSafeIsFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function writeText(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, normalizeTextForWrite(contents), 'utf8');
}

function requireString(value: string | null, field: string): string {
  if (!value) {
    throw new Error(`Missing required field ${field}.`);
  }

  return value;
}

function requireNonNoneValue(value: string | null | undefined, message: string): string {
  if (!value || value === 'none') {
    throw new Error(message);
  }

  return value;
}

function primaryTaskAnchorFromId(taskId: string): string {
  const match = taskId.match(/^(F\d+-T\d+)/);
  return match?.[1] ?? taskId;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
