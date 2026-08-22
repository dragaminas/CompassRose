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
  SystemicBlockerRequest,
  TaskInterfaceAnalysis,
  TaskRequest,
  TaskRequestBackfillOutput,
  TaskRequestStatus,
  ReviewableDiffHandoff,
  ExpectedDeliverable,
} from '../contracts/types.js';
import { selectImplementationContextArtifactNames } from '../contracts/runtime/agentContext.js';
import type { AgentInvocationContext, AgentInvocationKind, AgentToolName } from '../contracts/runtime/agentContext.js';
import type { RunObserver } from '../contracts/runtime/runObserver.js';
import { allCriteriaMet, unmetCriteria } from '../contracts/runtime/acceptanceCriteria.js';
import type { RecoveryDiagnosis, StoredRecoveryDiagnosis } from '../contracts/runtime/recoveryDiagnosis.js';
import { runSmokeGate } from './smokeGate.js';
import { buildManifest, manifestEntry, manifestFitsBudget, mergeExploration } from './contextManifest.js';
import { buildCodeInventory, deriveGateCandidates, detectProjectFacts, signalsChanged } from '../project/detectProject.js';
import type { InventoryGroup, SignalFingerprint } from '../project/detectProject.js';
import { EMPTY_PROJECT_FACTS, mergeDetectedFacts, parseProjectFactsDocument, renderProjectFactsDocument } from '../project/projectFacts.js';
import type { FactContradiction, ProjectFacts } from '../project/projectFacts.js';
import type { ContextManifest, ExplorationRecord, ManifestEntry } from './contextManifest.js';
import {
  buildCoverageReport,
  decideDimension,
  markCovered,
  readDimensions,
  renderDimensionsDocument,
} from '../state/dimensions.js';
import type { CoverageReport, Dimension, DimensionState } from '../state/dimensions.js';
import type { SmokeResult } from './smokeGate.js';
import type {
  AcceptanceCriteriaVerification,
  AcceptanceCriterionVerdict,
} from '../contracts/runtime/acceptanceCriteria.js';
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
import type { ValidationDecisionPointsOutput, ValidationRoundRecord, ValidationWeight } from '../contracts/validator/validatorContracts.js';
import type { BrainstormTurnOutput, BrainstormTurnRecord } from '../contracts/brainstormer/brainstormerContracts.js';
import { renderBlockerCard, scanBlockedWorkItems, type BlockerCardInput } from './blockerCard.js';
import {
  buildAdrPath,
  buildDmsPath,
  buildFeaturesReadmePath,
  buildFeaturesRoot,
  buildFixesRoot,
  buildFixesReadmePath,
  buildRoadmapPath,
  buildSadPath,
  buildTemplatePath,
  getBootstrapConfigPath,
  resolveCompassRoseRoot,
  buildDimensionsPath,
  buildProjectFactsPath,
} from '../config/compassRosePaths.js';
import { resolveRepositoryRelativePath } from '../filesystem/pathResolver.js';
import { findGitRepositoryRoot } from '../git/gitStatus.js';
import { normalizeTextForWrite, readUtf8 } from '../filesystem/textNormalization.js';
import { parseTaskDocument, storedTaskArtifactFromDocument } from '../task/taskDocument.js';
import { sanitizeAllowedPaths, validateQualityGateRefs } from '../task/taskContentValidation.js';
import { classifyRecoveryLessonCategory } from './recoveryLessons.js';
import {
  buildCorrectionTaskFileName,
  buildStateCorrectionTaskId,
  buildTaskFileName,
  capTaskFileNameLength,
  humanCorrectionNumber,
  humanTaskNumber,
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
import {
  buildBlockerSignature,
  buildEnsembleDisagreementProfile,
  classifyBlockerKind,
  classifyDiagnosticKind,
  finalizeBlockerProfile,
  resolveBlockerKindEnsemble,
} from '../state/blockerClassification.js';
import { resolveUnanimousVote, uniqueStrings } from '../shared/arrays.js';
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
  renderImplementationOutlineMarkdown,
  renderOutlineProgressMarkdown,
  renderStateCorrectionTaskMarkdown,
  renderTaskMarkdown,
  stateCorrectionTaskToTask,
} from './taskRendering.js';
import {
  isBlockerKind,
  isBlockerRecoverability,
  readValueFromStructuredLines,
  renderBlockerProfileMarkdown,
} from './blockerRendering.js';
import { buildImplementerPrompt } from './promptBuilding.js';
import { compactRecoveryHistorySection } from './recoveryHistoryCompaction.js';
import { renderTaskCommitMessage, type TaskCommitTrailEntry } from './taskCommitTrail.js';
import {
  buildImplementationDiagnostics,
  buildImplementationErrorMessage,
  classifyImplementation,
  joinOutput,
  outputShowsCommittedReviewableDiff,
  selectReviewableDiffForReview,
  stripAnsiCodes,
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
  boundRecoveryLessonNotes,
  compareFeatureIds,
  createRunId,
  errorMessage,
  extractReferencedPaths,
  isRecord,
  limitStateCorrectionTaskId,
  primaryTaskAnchorFromId,
  readNonNegativeInteger,
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
  'src/orchestrator/recoveryHistoryCompaction.ts',
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

// Number of independent, fresh-context classification calls fired by
// classifyReviewBlockerKindByEnsemble() before requiring unanimous agreement (see ADR-0036).
// Deliberately small: each call costs one local/cheap-model invocation, and the goal is cheap
// cross-checking, not statistical sampling.
const BLOCKER_KIND_ENSEMBLE_SIZE = 3;

export class StateCorrectionLimitReachedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateCorrectionLimitReachedError';
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
  // Repo-relative root for every CompassRose-owned document that isn't config/project-state
  // (ADR.md, SAD.md, ROADMAP.md, DMS.md, templates/, features/README.md, fixes/README.md, and
  // the default features_root/fixes_root) -- isolated from the target repository's own docs/
  // tree. See src/config/compassRosePaths.ts.
  private readonly compassRoseRoot: string;
  private readonly maxTasksPerRun: number;
  private readonly maxReviewIterations: number;
  private readonly maxAiCallsPerRun: number;
  private readonly contextBudgetCharacters: number;
  private readonly runId: string;
  private readonly codexCommand: string;
  private readonly opencodeCommand: string;
  private readonly startedAt: string;
  private readonly stepRecords: StepRunRecord[] = [];
  private readonly completedPrimaryTaskAnchors = new Set<string>();
  // Every task-document path this process itself has authored (plan_task/plan_fix_task/
  // correction/state-correction writers below), so the review-time scope check
  // (reviewTask()) can tell "the runtime's own bookkeeping from an earlier step in this run" apart
  // from "an implementer wrote to a task document outside its declared scope" -- the latter is
  // exactly the class of bug causa A exists to catch, so this must stay narrow: only paths this
  // process itself is known to have written, never a blanket directory exclusion.
  private readonly runtimeAuthoredTaskPaths = new Set<string>();
  private agentInvocationCount = 0;
  // Display-only, per src/contracts/runtime/runObserver.ts: an observed run must take exactly the
  // same steps as an unobserved one.
  private runObserver: RunObserver | null = null;
  // Work items this run blocked, with why -- the material for the end-of-run summary.
  private readonly blockedThisRun = new Map<string, string>();
  // Work items excluded from selection for the remainder of this run. Per-run only: the durable
  // exclusion is the item's own recorded blocker, which the scheduler already honors.
  private readonly setAsideItemIds = new Set<string>();
  // When set, this run works only on this item. Narrows selection; never widens it.
  private runTarget: string | null = null;
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

    const configurationPath = getBootstrapConfigPath(repositoryRoot);
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
    this.compassRoseRoot = resolveCompassRoseRoot(projectConfiguration);
    const projectStatePath = resolveRepositoryRelativePath(repositoryRoot, projectConfiguration.documentation.project_state);
    const featuresRoot = resolveRepositoryRelativePath(
      repositoryRoot,
      readRecordString(documentation, 'features_root') ?? buildFeaturesRoot(this.compassRoseRoot),
    );
    const fixesRoot = resolveRepositoryRelativePath(
      repositoryRoot,
      readRecordString(documentation, 'fixes_root') ?? buildFixesRoot(this.compassRoseRoot),
    );

    if (!projectStatePath || !featuresRoot || !fixesRoot) {
      throw new Error('Configuration paths for project state, features root, or fixes root are invalid.');
    }

    this.projectStatePath = projectStatePath;
    this.featuresRoot = featuresRoot;
    this.fixesRoot = fixesRoot;
    // readNonNegativeInteger(), not readPositiveInteger(): every limits.* field's config
    // validator (requireNonNegativeInteger/optionalNonNegativeInteger) already accepts an
    // explicit 0 as a real, distinct budget (e.g. "disable this entirely"), so the runtime must
    // not silently coerce a configured 0 into "unset" -> unbounded/default. See ADR-0042.
    this.maxTasksPerRun = readNonNegativeInteger(limits, 'max_tasks_per_run') ?? Number.POSITIVE_INFINITY;
    this.maxReviewIterations = readNonNegativeInteger(limits, 'max_review_iterations') ?? 1;
    // Opt-in only, unlike the sibling limits above: unbounded by default so no existing project
    // config is retroactively affected. See ADR-0041.
    this.maxAiCallsPerRun = readNonNegativeInteger(limits, 'max_ai_calls_per_run') ?? Number.POSITIVE_INFINITY;
    // 0 means unbounded, matching how every other optional limit here treats absence (ADR-0040).
    this.contextBudgetCharacters = readNonNegativeInteger(limits, 'context_budget_characters') ?? 0;
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

  /** Attach (or detach, with `null`) a display-only watcher for the next run. */
  setRunObserver(observer: RunObserver | null): void {
    this.runObserver = observer;
  }

  /**
   * Restrict the next run to one work item, or clear the restriction with `null`
   * (025-automated-development-loop).
   *
   * Throws when the named item does not exist, so `/run 024` against a typo says so instead of
   * quietly running everything. It does not throw when the item exists but is not currently
   * selectable -- that is reported by the run itself, which knows why.
   */
  setRunTarget(itemId: string | null): void {
    if (itemId !== null && !this.listFeatures().some((feature) => feature.id === itemId) && !this.listFixes().some((fix) => fix.id === itemId)) {
      throw new Error(`No feature or fix named ${itemId} exists.`);
    }

    this.runTarget = itemId;
  }

  /** What this run blocked, and why -- the material for an end-of-run summary. */
  blockedDuringRun(): ReadonlyMap<string, string> {
    return this.blockedThisRun;
  }

  /**
   * Cooperative stop requested from outside the signal handlers -- the interactive session's `esc`
   * key. Delegates to the same path SIGINT takes, so it lands at the next step boundary and a step
   * in flight is always allowed to finish rather than leaving the worktree mid-write.
   */
  requestStop(reason: string): void {
    this.requestControlledStop(reason, 130, null);
  }

  run(): number {
    const cleanupStopHandlers = this.installControlledStopHandlers();
    let keepRunning = true;
    let lastDecision: StepDecision | null = null;

    // Both are per-run, and the interactive session reuses one orchestrator across several `/run`
    // invocations: without this, a second run would still be avoiding what the first set aside.
    this.blockedThisRun.clear();
    this.setAsideItemIds.clear();

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

        this.runObserver?.onStepStart(decision);
        const result = this.executeStep(decision);
        this.runObserver?.onStepEnd(decision, result);
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

        // 025-automated-development-loop: react to what the step meant, not to what number it
        // returned. `failed` is the engine being in no state to continue; `blocked` is one work
        // item that cannot proceed, which is a normal outcome and must not end the run.
        if (result.kind === 'failed') {
          this.writeRefinementFeedback(result.summary, lastDecision);
          this.writeRunSummary('stopped', result.exitCode, null);
          return result.exitCode;
        }

        if (result.kind === 'blocked') {
          const blockedId = decision.feature_id;
          if (blockedId) {
            this.blockedThisRun.set(blockedId, result.summary);
            // Set aside for the remainder of this run. The durable exclusion lives in the item's
            // own recorded blocker (inspectFeature reports `blocked_on_human`, which both
            // scheduler passes already skip), but a blocker whose recoverability is `agent` stays
            // selectable across runs by design -- and would be re-selected immediately, in this
            // same run, without this.
            this.setAsideItemIds.add(blockedId);
          }

          this.writeRefinementFeedback(result.summary, lastDecision);
          console.error(`Set aside ${blockedId ?? 'the current item'}; continuing with the next selectable work.`);

          if (!this.options.loop) {
            keepRunning = false;
          }
          continue;
        }

        if (!this.options.loop || !result.continueLoop) {
          keepRunning = false;
        }
      }

      this.throwIfControlledStopRequested();
      // A run that ends with items blocked did not fail, but it did not finish the work either.
      // Non-interactive callers need to tell those apart: 0 means nothing left to do, 3 means
      // something needs a human.
      const endedWithBlockedItems = this.blockedThisRun.size > 0;
      this.writeRunSummary('completed', endedWithBlockedItems ? 3 : 0, null);
      return endedWithBlockedItems ? 3 : 0;
    } catch (error) {
      if (error instanceof ControlledStopError) {
        if (!this.stopRequested) {
          console.error(error.message);
        }
        this.writeRunSummary('stopped', error.exitCode, null);
        return error.exitCode;
      }

      // An unhandled exception escaping a step is an engine failure (025-automated-development-loop):
      // the run stops and reports what broke. It used to rethrow, which meant the process died with
      // a raw stack trace and no run summary reached the caller -- the least legible possible
      // ending, and the exact opposite of what this system is for. The stack is still printed, for
      // whoever has to debug it.
      const message = error instanceof Error ? error.message : String(error);
      this.writeRefinementFeedback(message, lastDecision);
      this.writeRunSummary('failed', 1, message);
      console.error(`Run failed: ${message}`);
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      return 1;
    } finally {
      cleanupStopHandlers();
    }
  }

  /**
   * Flow 1 ("npm run feature-validation", ADR-0046): every formalized feature/fix that
   * inspectFeature()/inspectFix() would currently report as `awaiting_validation` -- i.e.
   * exactly the set Flow 2 ("npm run app") is silently skipping. Reuses the same inspection the
   * scheduler already runs rather than re-deriving the gate condition a second way.
   */
  listFeaturesAwaitingValidation(): readonly WorkItemContext[] {
    const featureIds = this.listFeatures()
      .filter((feature) => this.inspectFeature(feature).kind === 'awaiting_validation')
      .map((feature) => feature.id);
    const fixIds = this.listFixes()
      .filter((fix) => this.inspectFix(fix).kind === 'awaiting_validation')
      .map((fix) => fix.id);

    return [...featureIds, ...fixIds].map((id) => this.resolveWorkItemContext(id));
  }

  /**
   * Every work item bucketed by what it is waiting on, for the interactive session's header
   * (`023-terminal-session`). Read-only: it runs the same inspections the scheduler runs and
   * writes nothing.
   *
   * Deliberately built from `inspectFeature`/`inspectFix` rather than from lifecycle strings, so a
   * bucket here can never disagree with what the scheduler would actually do with the item.
   */
  describeWorkItems(): {
    readonly completed: readonly string[];
    readonly inProgress: readonly string[];
    readonly blocked: readonly string[];
    readonly awaitingValidation: readonly string[];
    readonly pendingSpecification: readonly string[];
  } {
    const completed: string[] = [];
    const inProgress: string[] = [];
    const blocked: string[] = [];
    const awaitingValidation: string[] = [];
    const pendingSpecification: string[] = [];

    const bucket = (id: string, kind: WorkItemInspectionKind): void => {
      if (kind === 'completed') {
        completed.push(id);
      } else if (kind === 'blocked' || kind === 'blocked_on_human' || kind === 'blocked_on_fix') {
        blocked.push(id);
      } else if (kind === 'awaiting_validation') {
        awaitingValidation.push(id);
      } else if (kind === 'request_pending' || kind === 'formalization_pending') {
        pendingSpecification.push(id);
      } else {
        inProgress.push(id);
      }
    };

    for (const feature of this.listFeatures()) {
      bucket(feature.id, this.inspectFeature(feature).kind);
    }
    for (const fix of this.listFixes()) {
      bucket(fix.id, this.inspectFix(fix).kind);
    }

    return { completed, inProgress, blocked, awaitingValidation, pendingSpecification };
  }

  /** The configured project name, for the session header. */
  projectName(): string {
    return this.projectConfiguration.project?.name ?? 'this project';
  }

  /**
   * Every feature/fix currently sitting in `blocked` or `review_failed`, rendered back into the
   * same `BlockerCardInput` shape `persistBlockedFeature` already prints live -- so `npm run
   * doctor` can show the human the identical card later without re-triggering the failure.
   * Delegates to the shared, orchestrator-independent `scanBlockedWorkItems` (doctor calls the
   * same function directly, without constructing a full orchestrator).
   */
  listBlockedWorkItems(): readonly BlockerCardInput[] {
    return scanBlockedWorkItems({
      repositoryRoot: this.repositoryRoot,
      featuresRoot: this.featuresRoot,
      fixesRoot: this.fixesRoot,
    });
  }

  /**
   * Formalizes a request that already exists on disk, as the product of a specification
   * conversation (024-specification-flow).
   *
   * The loop can no longer do this -- that was the whole point of the narrowing -- but a repository
   * full of `request.md`-only folders still needs a way through, and it is exactly the eighteen this
   * repository accumulated. The difference from the old behavior is not the mechanism but the
   * authority: this runs because a human, in a session, said so, and the result lands
   * `validation: not_started` for the same human to confirm.
   *
   * Throws when the item is not actually pending specification, so it can never be used to
   * regenerate a specification somebody has already agreed to.
   */
  specifyExistingRequest(id: string): void {
    const feature = this.tryLoadFeature(id);
    const inspection = feature ? this.inspectFeature(feature) : this.inspectFix(this.loadFix(id));

    if (!this.isPendingSpecificationKind(inspection.kind)) {
      throw new Error(`Cannot specify ${id}: it is not pending specification (inspected kind: ${inspection.kind}).`);
    }

    if (feature) {
      this.planFeature(id);
    } else {
      this.planFixRequest(id);
    }
  }

  /**
   * Re-reads the repository's own signals and records what changed (028-project-understanding).
   *
   * Deterministic and read-only in substance: no AI call, no network, and the only file it writes
   * is CompassRose's own `PROJECT_FACTS.md`. A detected value that disagrees with something a human
   * confirmed is reported as a contradiction and never applied -- a machine quietly replacing a
   * human decision with its own guess is the failure mode this whole feature is shaped to avoid.
   */
  refreshProjectFacts(): {
    readonly facts: ProjectFacts;
    readonly contradictions: readonly FactContradiction[];
    readonly changedSignals: readonly string[];
  } {
    const artifactPath = join('project-facts', 'signals.json');
    const previousFingerprints = this.artifacts.readJson<SignalFingerprint[]>(artifactPath) ?? [];
    const { facts: detected, fingerprints } = detectProjectFacts(this.repositoryRoot);

    const factsPath = join(this.repositoryRoot, buildProjectFactsPath(this.compassRoseRoot));
    const recorded = existsSync(factsPath) ? parseProjectFactsDocument(readUtf8(factsPath)) : EMPTY_PROJECT_FACTS;
    const { facts, contradictions } = mergeDetectedFacts(recorded, detected);

    writeText(factsPath, renderProjectFactsDocument(facts));
    this.artifacts.writeJson(artifactPath, fingerprints);

    return { facts, contradictions, changedSignals: signalsChanged(previousFingerprints, fingerprints) };
  }

  /** Quality-gate and start-command candidates derived from what the project declares. */
  projectGateCandidates(): Readonly<Record<string, readonly string[]>> {
    return deriveGateCandidates(detectProjectFacts(this.repositoryRoot).facts);
  }

  /**
   * What exists in the codebase, grouped by directory.
   *
   * Computed on demand, never stored: an inventory of a moving codebase is stale by definition. It
   * is material for a specification conversation and nothing else -- there is deliberately no code
   * path from here to a `feature.md`.
   */
  codeInventory(): readonly InventoryGroup[] {
    const facts = detectProjectFacts(this.repositoryRoot).facts;
    return buildCodeInventory(this.repositoryRoot, facts.sourceRoots?.value ?? ['src']);
  }

  /** The project's declared coverage checklist (024-specification-flow). */
  readDimensions(): readonly Dimension[] {
    return readDimensions(join(this.repositoryRoot, buildDimensionsPath(this.compassRoseRoot)));
  }

  /**
   * Records a human's decision about one dimension.
   *
   * The only way a dimension's state changes. An agent proposal is a proposal until it comes through
   * here, and a discard without a reason is refused by `decideDimension` -- six months later, an
   * unexplained discard is indistinguishable from an oversight.
   */
  decideDimension(name: string, state: DimensionState, reason: string | null, by: string): void {
    const path = join(this.repositoryRoot, buildDimensionsPath(this.compassRoseRoot));
    const updated = decideDimension(this.readDimensions(), name, {
      state,
      reason,
      by,
      at: new Date().toISOString().slice(0, 10),
    });

    writeText(path, renderDimensionsDocument(updated));
    this.commitDirtyWorktreeIfConfigured(`proto: record a coverage decision for "${name}"`);
  }

  /** Marks a dimension covered by a feature. Additive: a dimension can be covered by several. */
  markDimensionCovered(name: string, featureId: string, by: string): void {
    const path = join(this.repositoryRoot, buildDimensionsPath(this.compassRoseRoot));
    writeText(path, renderDimensionsDocument(markCovered(this.readDimensions(), name, featureId, by)));
    this.commitDirtyWorktreeIfConfigured(`proto: record ${featureId} covering "${name}"`);
  }

  /** What a specification session closes with. */
  buildCoverageReport(): CoverageReport {
    return buildCoverageReport(this.readDimensions());
  }

  /**
   * Flow 1's first stage (024-specification-flow): every work item that exists as a request but has
   * never been specified with a human.
   *
   * This is the set the old `brainstorm` command could not see. It looked only for items awaiting
   * *validation*, so a folder holding just `request.md` was invisible to it -- and this repository
   * had eighteen of them, built in code while their documents still said nothing.
   */
  listWorkItemsPendingSpecification(): readonly WorkItemContext[] {
    const featureIds = this.listFeatures()
      .filter((feature) => this.isPendingSpecificationKind(this.inspectFeature(feature).kind))
      .map((feature) => feature.id);
    const fixIds = this.listFixes()
      .filter((fix) => this.isPendingSpecificationKind(this.inspectFix(fix).kind))
      .map((fix) => fix.id);

    return [...featureIds, ...fixIds].map((id) => this.resolveWorkItemContext(id));
  }

  /**
   * "npm run acknowledge-blocker": every feature/fix inspectFeature()/inspectFix() currently
   * reports as `blocked_on_human` -- i.e. exactly the set both scheduler passes are silently
   * skipping until a human explicitly clears it via acknowledgeBlocker(). Mirrors
   * listFeaturesAwaitingValidation()'s shape.
   */
  listHumanBlockedWorkItems(): readonly WorkItemContext[] {
    const featureIds = this.listFeatures()
      .filter((feature) => this.inspectFeature(feature).kind === 'blocked_on_human')
      .map((feature) => feature.id);
    const fixIds = this.listFixes()
      .filter((fix) => this.inspectFix(fix).kind === 'blocked_on_human')
      .map((fix) => fix.id);

    return [...featureIds, ...fixIds].map((id) => this.resolveWorkItemContext(id));
  }

  /**
   * Decides how much back-and-forth `id`'s definition needs before a human can confirm it, via
   * the same 3-vote unanimous-required ensemble pattern as classifySystemicBlockerNextStepByEnsemble
   * (ADR-0036/38). Unlike that ensemble's tie-break-to-stop, disagreement or unavailability here
   * ties to `architectural` -- the heavier, more-scrutiny path -- because a human is already
   * present in Flow 1's loop and one extra round is cheap, matching the "when in doubt take the
   * heavier path" principle this feature was explicitly modeled on.
   */
  classifyValidationWeight(id: string): ValidationWeight {
    const owner = this.resolveWorkItemContext(id);
    const sourcePaths = [
      relativePath(this.repositoryRoot, owner.definitionPath),
      ...(owner.architecturePath ? [relativePath(this.repositoryRoot, owner.architecturePath)] : []),
    ];

    const prompt = [
      'Act as the CompassRose Validator.',
      '',
      `Classify how much back-and-forth \`${id}\`'s already-formalized definition needs before a human can confirm it: \`bounded\` or \`architectural\`.`,
      '',
      'Read only:',
      ...sourcePaths.map((path) => `- \`${path}\``),
      '',
      'Rules:',
      '- `bounded`: scope, interfaces, and approach are already concrete enough that at most 1-2 sharp confirmations are needed.',
      '- `architectural`: the definition leaves open cross-cutting structural choices (data model, integration boundaries, multi-component tradeoffs) that deserve deliberate confirmation.',
      '- Reason independently from the definition above only -- do not assume any other attempt\'s conclusion.',
      '- Return JSON only and do not modify files.',
    ].join('\n');

    const votes = this.runClassifierEnsemble<ValidationWeight>({
      size: BLOCKER_KIND_ENSEMBLE_SIZE,
      prompt,
      labelPrefix: `classifier:validation-weight:${id}`,
      invocationKind: 'feature_validation_weight',
      schemaId: 'feature_validation_weight',
      featureId: id,
      taskId: null,
      extractVote: (raw) => (raw.weight === 'bounded' || raw.weight === 'architectural' ? raw.weight : null),
    });

    if (!votes) {
      return 'architectural';
    }

    const resolved = resolveUnanimousVote(votes);
    return resolved.agreed ? resolved.value : 'architectural';
  }

  /**
   * One-shot Validator call proposing this round's decision points, grounded in `id`'s
   * already-written feature.md/architecture.md (never the raw request.md -- see
   * src/contracts/validator/feature-validation-prompt.md) and every prior round's answer, so the
   * model never re-raises something the human already settled. Returning `decision_points: []`
   * only changes what the CLI loop displays next; per that same contract, it is never by itself
   * sufficient to confirm validation -- only confirmFeatureValidation(), called exclusively from
   * the human's own "listo" keystroke, may do that.
   */
  runNextValidationRound(
    id: string,
    weight: ValidationWeight,
    priorRounds: readonly ValidationRoundRecord[],
  ): ValidationDecisionPointsOutput {
    const owner = this.resolveWorkItemContext(id);
    const sourcePaths = [
      'src/contracts/validator/feature-validation-prompt.md',
      relativePath(this.repositoryRoot, owner.definitionPath),
      ...(owner.architecturePath ? [relativePath(this.repositoryRoot, owner.architecturePath)] : []),
    ];

    const priorRoundsText = priorRounds.length > 0
      ? priorRounds.map((round, index) => {
          const question = round.decision_point?.question ?? '(human-provided clarification, no decision point)';
          const answer = round.chosen_option_id
            ? `chose option \`${round.chosen_option_id}\``
            : `answered: ${round.free_text ?? '(no answer recorded)'}`;
          return `${index + 1}. ${question} -> ${answer}`;
        }).join('\n')
      : '(none yet)';

    const label = `validator:decision-points:${id}:${priorRounds.length + 1}`;
    const prompt = [
      'Act as the CompassRose Validator.',
      '',
      `Feature/fix \`${id}\` is formalized (weight: ${weight}). Propose the concrete decisions a human should confirm before this is allowed into automated task planning.`,
      '',
      'Read only:',
      ...sourcePaths.map((path) => `- \`${path}\``),
      '',
      'Rounds already recorded this session (never re-raise one of these):',
      priorRoundsText,
      '',
      'Rules:',
      '- Propose at most 3 decision points this round, each with 0-3 labeled options, a recommended option id, and a one-line rationale.',
      '- Ground every decision point in what the definition document already states -- frame it as confirming or overriding an existing assumption, not inventing a new one.',
      '- If nothing further is worth raising, return `decision_points: []`.',
      '- Do not ask open-ended questions with no options.',
      '- Do not claim the human has approved anything.',
      '- Do not modify files.',
      '',
      'Return JSON only, matching the decision-points-output schema.',
    ].join('\n');

    this.recordAgentInvocationContext(this.buildAgentInvocationContext({
      role: 'validator',
      kind: 'feature_validation_decision_points',
      label,
      feature_id: id,
      task_id: null,
      source_paths: sourcePaths,
      prompt,
      tool: {
        name: 'codex',
        command: this.codexCommand,
        model: resolveCodexPlannerModel(),
        output_schema_id: 'feature_validation_decision_points',
      },
    }));

    return this.codex.runStructured<ValidationDecisionPointsOutput>(
      prompt,
      this.contracts.schema('feature_validation_decision_points'),
      [],
      label,
    );
  }

  /**
   * The only method allowed to flip `validation: confirmed` (ADR-0046) -- called exclusively from
   * the CLI loop's explicit "listo" branch, never from AI-response handling. Writes the full
   * transcript as a durable `## Validation Decisions` section on the definition document itself
   * (so every later Planner/task-planning prompt that already reads feature.md/fix.md sees it for
   * free), the deterministic state.md flag, and a full audit copy under
   * `.git/proto-compassrose/validation-decisions/<id>.json` (ADR-0003).
   */
  confirmFeatureValidation(id: string, transcript: readonly ValidationRoundRecord[]): void {
    const owner = this.resolveWorkItemContext(id);
    const updatedDefinition = setOrInsertSection(
      readUtf8(owner.definitionPath),
      'Validation Decisions',
      this.renderValidationDecisionsMarkdown(transcript),
    );
    writeText(owner.definitionPath, ensureTrailingNewline(updatedDefinition));

    const updatedState = replaceOperationalStatus(readUtf8(owner.statePath), { validation: 'confirmed' });
    writeText(owner.statePath, ensureTrailingNewline(updatedState));

    this.artifacts.writeJson(join('validation-decisions', `${id}.json`), transcript);

    if (this.options.commit) {
      this.git.commit(
        [
          relativePath(this.repositoryRoot, owner.definitionPath),
          relativePath(this.repositoryRoot, owner.statePath),
        ],
        `proto: confirm validation for ${id}`,
      );
    }
  }

  private renderValidationDecisionsMarkdown(transcript: readonly ValidationRoundRecord[]): string {
    const answered = transcript.filter((round) => round.decision_point !== null);
    if (answered.length === 0) {
      return '- No decision points were raised; confirmed as-is.';
    }

    return answered
      .map((round, index) => {
        const decisionPoint = round.decision_point;
        if (!decisionPoint) {
          return '';
        }

        const chosenOption = decisionPoint.options.find((option) => option.id === round.chosen_option_id);
        const answer = chosenOption
          ? `${chosenOption.label} (${chosenOption.detail})`
          : round.free_text ?? '(no answer recorded)';
        return `${index + 1}. **${decisionPoint.question}** -> ${answer}`;
      })
      .filter((line) => line.length > 0)
      .join('\n');
  }

  /**
   * Flow B ("npm run brainstorm", ADR-0007/0046): one open-ended proposal from the brainstormer
   * role, grounded in repo context and every already-existing feature, plus the running
   * conversation. Pure proposal -- writes nothing, commits nothing. `ready_to_draft` is advisory
   * only; only the human's own "crear" keystroke in the CLI loop may turn this into an actual
   * feature (see draftBrainstormedFeature()).
   */
  runBrainstormTurn(transcript: readonly BrainstormTurnRecord[], userMessage: string): BrainstormTurnOutput {
    const siblingFeatures = buildSiblingFeatureIndex(this.featuresRoot);
    const sourcePaths = [
      'src/contracts/brainstormer/brainstorm-turn-prompt.md',
      buildRoadmapPath(this.compassRoseRoot),
      buildSadPath(this.compassRoseRoot),
      buildAdrPath(this.compassRoseRoot),
      buildDmsPath(this.compassRoseRoot),
    ];

    const transcriptText = transcript.length > 0
      ? transcript.map((turn) => `${turn.role === 'human' ? 'Human' : 'Assistant'}: ${turn.text}`).join('\n')
      : '(none yet)';

    const label = `brainstormer:turn:${this.runId}:${transcript.length + 1}`;
    const prompt = [
      'Act as the CompassRose Brainstormer.',
      '',
      'Help a human discover and refine one candidate feature at a time from a free-form idea.',
      '',
      'Read only:',
      ...sourcePaths.map((path) => `- \`${path}\``),
      '',
      'Existing features (do not propose duplicates of these):',
      ...(siblingFeatures.length > 0
        ? siblingFeatures.map((sibling) => `- ${sibling.featureId}: ${sibling.title} — ${sibling.summary || 'no summary available'}`)
        : ['- none']),
      '',
      'Conversation so far:',
      transcriptText,
      '',
      `Human's latest message: ${userMessage}`,
      '',
      'Rules:',
      '- Reply conversationally: ask a clarifying question, or note when this idea sounds like several distinct features and suggest tackling them one at a time.',
      '- Respect the architecture-freedom stance declared in the conversation\'s first message: ask about language/framework/design-pattern preferences only if the human opted in and it is relevant to this idea; otherwise decide those independently.',
      '- Always gather business-logic requirements explicitly, regardless of that stance.',
      '- Set `ready_to_draft: true` only once business-logic requirements are concrete enough to formalize as one feature, and fill `proposed_title`/`proposed_summary` grounded only in what the human actually said.',
      '- Never claim the idea has been turned into a feature, or that the session is over -- both are exclusively human keystrokes in the CLI loop that this role never sees or infers.',
      '- Do not modify files.',
      '',
      'Return JSON only, matching the brainstorm-turn-output schema.',
    ].join('\n');

    this.recordAgentInvocationContext(this.buildAgentInvocationContext({
      role: 'brainstormer',
      kind: 'brainstorm_turn',
      label,
      feature_id: null,
      task_id: null,
      source_paths: sourcePaths,
      prompt,
      tool: {
        name: 'codex',
        command: this.codexCommand,
        model: resolveCodexPlannerModel(),
        output_schema_id: 'brainstorm_turn',
      },
    }));

    return this.codex.runStructured<BrainstormTurnOutput>(
      prompt,
      this.contracts.schema('brainstorm_turn'),
      [],
      label,
    );
  }

  private nextFeatureId(slug: string): string {
    const highestNumber = this.listFeatures().reduce((max, feature) => {
      const match = feature.id.match(/^(\d+)-/);
      const number = match?.[1] ? Number.parseInt(match[1], 10) : 0;
      return Math.max(max, number);
    }, 0);

    return `${String(highestNumber + 1).padStart(3, '0')}-${slug}`;
  }

  /**
   * Mints a new feature directory + `request.md` from the human side of a brainstorming
   * segment (never the assistant's own words -- `request.md` stays human-authored content, per
   * compassrose/DMS.md's Feature Intake Model, now transcribed by the CLI instead of hand-typed
   * into a file), commits it if configured, then formalizes it via the existing, unmodified
   * planFeature() -- the same path any hand-authored `request.md` already goes through. The
   * freshly-formalized feature lands exactly where every other formalized feature does --
   * `validation: not_started` -- ready for the same confirmation loop Flow 1 already drives.
   */
  draftBrainstormedFeature(
    segmentTranscript: readonly BrainstormTurnRecord[],
    proposedTitle: string,
  ): { featureId: string } {
    const featureId = this.nextFeatureId(slugify(proposedTitle));
    const featureDirectory = join(this.featuresRoot, featureId);
    mkdirSync(join(featureDirectory, 'tasks'), { recursive: true });

    const humanMessages = segmentTranscript
      .filter((turn) => turn.role === 'human')
      .map((turn) => turn.text.trim())
      .filter((text) => text.length > 0);

    const requestPath = join(featureDirectory, 'request.md');
    const requestMarkdown = `# Request: ${proposedTitle}\n\n${humanMessages.join('\n\n')}`;
    writeText(requestPath, ensureTrailingNewline(requestMarkdown));

    if (this.options.commit) {
      this.git.commit(
        [relativePath(this.repositoryRoot, requestPath)],
        `proto: capture brainstormed request for ${featureId}`,
      );
    }

    this.planFeature(featureId);

    return { featureId };
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

  /**
   * 024-specification-flow deliberately narrows this: `request_pending` and
   * `formalization_pending` used to be startable, which is how the loop came to author
   * specifications on its own -- an AI writing the document a human would then rubber-stamp. That
   * produced generic specifications describing components rather than the application, and left
   * whole dimensions of the product unspecified without anyone noticing.
   *
   * Specification is now exclusively a conversation (Flow 1). The loop consumes specifications and
   * can no longer create them.
   */
  private isStartableInspectionKind(kind: WorkItemInspectionKind): boolean {
    return kind === 'formalized' || kind === 'task_planning_pending';
  }

  private isPendingSpecificationKind(kind: WorkItemInspectionKind): boolean {
    return kind === 'request_pending' || kind === 'formalization_pending';
  }

  private isContinuingInspectionKind(kind: WorkItemInspectionKind): boolean {
    // 'blocked_on_fix', 'awaiting_validation', and 'blocked_on_human' are deliberately neither
    // startable nor continuing: each must be invisible to both scheduler passes while unresolved
    // (the blocking fix unresolved; a human hasn't confirmed the feature's definition, see
    // ADR-0046/Flow 1; a human hasn't acknowledged an exhausted/terminal blocker, see
    // acknowledgeBlocker()), so other features/fixes keep making progress instead of this one
    // being retried (and re-diagnosed) every run.
    return kind !== 'completed'
      && kind !== 'blocked_on_fix'
      && kind !== 'awaiting_validation'
      && kind !== 'blocked_on_human'
      && !this.isPendingSpecificationKind(kind)
      && !this.isStartableInspectionKind(kind);
  }

  private static readonly FIX_SEVERITY_RANK: Record<FixSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  /**
   * Two-pass scheduler so severity can affect what starts next without ever aborting
   * something already in flight (confirmed policy -- see compassrose/fixes/README.md):
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
    // Checked centrally, once per step, before any feature/fix is even inspected -- unlike
    // primaryTaskLimitReached() below (which only counts primary task completions),
    // agentInvocationCount already increments on every structured AI call this class makes
    // (recordAgentInvocationContext(), the one choke point every call site already passes
    // through) as of this call, so no new counter or per-call-site plumbing is needed. See
    // ADR-0041.
    if (this.agentInvocationCount >= this.maxAiCallsPerRun) {
      return {
        kind: 'stop',
        feature_id: null,
        task_id: null,
        correction_task_id: null,
        reason: `AI call budget reached for this run (${this.maxAiCallsPerRun} structured call(s)); stopping before spending another.`,
      };
    }

    // 025-automated-development-loop: both filters narrow the candidate set and never widen it.
    // `setAsideItemIds` holds what this run already blocked; `runTarget`, when set, restricts the
    // run to one named item. Neither can make the scheduler select something the gates below would
    // otherwise refuse -- notably neither bypasses the validation gate or resumes a blocked item.
    const selectable = (id: string): boolean =>
      !this.setAsideItemIds.has(id) && (this.runTarget === null || this.runTarget === id);

    const featureInspections = this.listFeatures()
      .filter((feature) => selectable(feature.id))
      .map((feature) => ({ feature, inspection: this.inspectFeature(feature) }));
    const fixInspections = this.listFixes()
      .filter((fix) => selectable(fix.id))
      .map((fix) => ({ fix, inspection: this.inspectFix(fix) }));

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

    const awaitingValidationIds = [
      ...featureInspections.filter(({ inspection }) => inspection.kind === 'awaiting_validation').map(({ feature }) => feature.id),
      ...fixInspections.filter(({ inspection }) => inspection.kind === 'awaiting_validation').map(({ fix }) => fix.id),
    ];

    const blockedOnHumanIds = [
      ...featureInspections.filter(({ inspection }) => inspection.kind === 'blocked_on_human').map(({ feature }) => feature.id),
      ...fixInspections.filter(({ inspection }) => inspection.kind === 'blocked_on_human').map(({ fix }) => fix.id),
    ];

    const pendingSpecificationIds = [
      ...featureInspections.filter(({ inspection }) => this.isPendingSpecificationKind(inspection.kind)).map(({ feature }) => feature.id),
      ...fixInspections.filter(({ inspection }) => this.isPendingSpecificationKind(inspection.kind)).map(({ fix }) => fix.id),
    ];

    const stopReasonSuffixes = [
      // Reported, never processed: an unspecified request is work for a human conversation, not
      // something the loop may write on its own (024-specification-flow).
      pendingSpecificationIds.length > 0
        ? `${pendingSpecificationIds.length} pending specification with you (${pendingSpecificationIds.join(', ')}) -- open a session and talk them through`
        : null,
      awaitingValidationIds.length > 0
        ? `${awaitingValidationIds.length} awaiting human validation (${awaitingValidationIds.join(', ')}) -- run "npm run feature-validation"`
        : null,
      blockedOnHumanIds.length > 0
        ? `${blockedOnHumanIds.length} blocked pending human acknowledgment (${blockedOnHumanIds.join(', ')}) -- run "npm run acknowledge-blocker"`
        : null,
    ].filter((suffix): suffix is string => suffix !== null);

    return {
      kind: 'stop',
      feature_id: null,
      task_id: null,
      correction_task_id: null,
      reason: stopReasonSuffixes.length > 0
        ? `No non-completed feature or fix remains ready for the autonomous pipeline; ${stopReasonSuffixes.join('; ')}.`
        : 'No non-completed feature or fix remains.',
    };
  }

  private selectStepForFeature(feature: FeatureRecord): StepDecision | null {
    const inspection = this.inspectFeature(feature);

    switch (inspection.kind) {
      case 'completed':
        return null;
      case 'request_pending':
      case 'formalization_pending':
        // Unreachable: 024-specification-flow removed these from both scheduler passes, because the
        // loop may no longer author a specification. A safety net, matching the guards below.
        throw new Error(
          `Feature ${feature.id} reached selectStepForFeature with kind '${inspection.kind}', which is pending specification and should never have been selected.`,
        );
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
      case 'awaiting_validation':
        throw new Error(
          `Feature ${feature.id} reached selectStepForFeature with kind 'awaiting_validation', which determineNextStep's continuing/startable filters should never allow through.`,
        );
      case 'blocked_on_human':
        throw new Error(
          `Feature ${feature.id} reached selectStepForFeature with kind 'blocked_on_human', which determineNextStep's continuing/startable filters should never allow through.`,
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
        if (snapshot.validationStatus !== 'confirmed') {
          return {
            kind: 'awaiting_validation',
            reason: `Feature ${feature.id} is formalized but not yet validated by a human; run "npm run feature-validation" before task planning.`,
            snapshot,
          };
        }
        return {
          kind: 'formalized',
          reason: `Feature ${feature.id} is formalized and its next deterministic action is task planning.`,
          snapshot,
        };
      case 'task_planning_pending':
        if (snapshot.validationStatus !== 'confirmed') {
          return {
            kind: 'awaiting_validation',
            reason: `Feature ${feature.id} is formalized but not yet validated by a human; run "npm run feature-validation" before task planning.`,
            snapshot,
          };
        }
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
      case 'implementation_running':
        return snapshot.activeTask !== 'none'
          ? {
              kind: 'implementation_running',
              reason: `Feature ${feature.id} is implementation_running for ${snapshot.activeTask} and should resume deterministically.`,
              snapshot,
            }
          : {
              kind: 'malformed',
              reason: `Feature ${feature.id} is implementation_running but active_task is missing, so diagnosis/autocorrection must decide whether to repair state or block for a recovery conversation.`,
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

        // Only set once diagnose_autocorrect's own bounded-retry machinery has already run this
        // to exhaustion (see requiresHumanAcknowledgment()'s doc comment) -- re-diagnosing it
        // every run would just spend an ensemble call to re-trip the same limit and re-print the
        // same card. Skip it, like blocked_on_fix, until acknowledgeBlocker() clears it.
        if (this.requiresHumanAcknowledgment(feature.statePath)) {
          return {
            kind: 'blocked_on_human',
            reason: `Feature ${feature.id} is blocked and automatic recovery is exhausted; skipping until a human runs "npm run acknowledge-blocker" instead of re-diagnosing every run.`,
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
      // Fail safe upward: an unset/unparsable severity is unknown, not ordinary -- treat it as
      // 'critical' until formalization narrows it, so a fresh defect competes for the
      // critical/high fast lane instead of quietly landing in FIFO backlog.
      const severity: FixSeverity = rawSeverity === 'critical' || rawSeverity === 'high' || rawSeverity === 'medium' || rawSeverity === 'low'
        ? rawSeverity
        : 'critical';
      const rawOwningFeature = stripTicks(parsePreferredStatusValue(operationalStatus, 'owning_feature') ?? 'none');
      const owningFeature = rawOwningFeature === 'none' || rawOwningFeature === '' ? null : rawOwningFeature;
      return { severity, owningFeature };
    } catch {
      return { severity: 'critical', owningFeature: null };
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
        return snapshot.validationStatus === 'confirmed'
          ? { kind: 'formalized', reason: `Fix ${fix.id} is formalized and its next deterministic action is task planning.`, snapshot, severity, owningFeature }
          : { kind: 'awaiting_validation', reason: `Fix ${fix.id} is formalized but not yet validated by a human; run "npm run feature-validation" before task planning.`, snapshot, severity, owningFeature };
      case 'task_planning_pending':
        return snapshot.validationStatus === 'confirmed'
          ? { kind: 'task_planning_pending', reason: `Fix ${fix.id} is waiting for exactly one next task to be planned.`, snapshot, severity, owningFeature }
          : { kind: 'awaiting_validation', reason: `Fix ${fix.id} is formalized but not yet validated by a human; run "npm run feature-validation" before task planning.`, snapshot, severity, owningFeature };
      case 'task_ready':
        return snapshot.activeTask !== 'none'
          ? { kind: 'task_ready', reason: `Fix ${fix.id} is task_ready with active task ${snapshot.activeTask}.`, snapshot, severity, owningFeature }
          : { kind: 'malformed', reason: `Fix ${fix.id} is task_ready but active_task is missing, so diagnosis/autocorrection must restore the execution anchor.`, snapshot, severity, owningFeature };
      case 'implementation_running':
        return snapshot.activeTask !== 'none'
          ? { kind: 'implementation_running', reason: `Fix ${fix.id} is implementation_running for ${snapshot.activeTask} and should resume deterministically.`, snapshot, severity, owningFeature }
          : { kind: 'malformed', reason: `Fix ${fix.id} is implementation_running but active_task is missing, so diagnosis/autocorrection must decide whether to repair state or block for a recovery conversation.`, snapshot, severity, owningFeature };
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

        if (this.requiresHumanAcknowledgment(fix.statePath)) {
          return {
            kind: 'blocked_on_human',
            reason: `Fix ${fix.id} is blocked and automatic recovery is exhausted; skipping until a human runs "npm run acknowledge-blocker" instead of re-diagnosing every run.`,
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
        // Unreachable: 024-specification-flow removed these from both scheduler passes. A bug or a
        // bug report is specified with a human, exactly like a feature.
        throw new Error(
          `Fix ${fix.id} reached selectStepForFix with kind '${inspection.kind}', which is pending specification and should never have been selected.`,
        );
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
      case 'awaiting_validation':
        throw new Error(
          `Fix ${fix.id} reached selectStepForFix with kind 'awaiting_validation', which determineNextStep's continuing/startable filters should never allow through.`,
        );
      case 'blocked_on_human':
        throw new Error(
          `Fix ${fix.id} reached selectStepForFix with kind 'blocked_on_human', which determineNextStep's continuing/startable filters should never allow through.`,
        );
      default:
        return assertNever(inspection.kind);
    }
  }

  /**
   * Runs an operation that may refuse via a bounded-retry limit error (StateCorrectionLimitReachedError)
   * and converts that refusal into a clean StepExecutionResult stop instead of letting it propagate as
   * an uncaught exception.
   *
   * Every call site that can trigger one of these errors must go through this helper rather than its
   * own inline try/catch. Before this existed, the same catch-and-convert logic was hand-copied at each
   * call site; one copy (diagnoseAndAutocorrect's own correct_state path) was missing it entirely and
   * crashed the whole CLI process on a second recovery cycle for the same anchor (see the regression
   * test in tests/stateCorrectionLimit.test.ts, fixed in commit 68e9801a). A shared helper means a future
   * call site inherits correct handling automatically instead of needing to remember to add it.
   *
   * Also fixes a second, previously silent gap (found dogfooding this exact path on
   * 003-doctor-command, 2026-08-21): reaching one of these limits used to leave `featureId`'s own
   * state completely untouched -- no blocker card printed, no `## Blocked By` written, so
   * `npm run doctor` had nothing to show either. Bounded-retry exhaustion IS a real blocker (the
   * only thing left that can resolve it is a human), so it now persists one via
   * `recordExhaustedRecoveryAsBlocked`, exactly like every other blocking path.
   */
  private runBoundedOperation(featureId: string, operation: () => void, onSuccess: () => StepExecutionResult): StepExecutionResult {
    try {
      operation();
      return onSuccess();
    } catch (error) {
      if (error instanceof StateCorrectionLimitReachedError) {
        this.recordExhaustedRecoveryAsBlocked(featureId, error.message);
        return { kind: 'blocked', exitCode: 2, continueLoop: false, summary: error.message };
      }
      throw error;
    }
  }

  /**
   * Persists a bounded-retry exhaustion (see runBoundedOperation) as a real blocked state instead
   * of silently doing nothing: reuses whatever blocker profile is already recorded for
   * `featureId` (kind/signature/evidence -- exactly what the automatic recovery was already
   * trying against), but overrides `recoverability` to `human`, since the runtime has now proven
   * automatic recovery is exhausted for this specific limit. Falls back to a generic `unknown`
   * blocker only when nothing was already recorded to reuse.
   */
  private recordExhaustedRecoveryAsBlocked(featureId: string, reason: string): void {
    const owner = this.resolveWorkItemContext(featureId);
    if (!statSafeIsFile(owner.statePath)) {
      // Nothing to persist against; this is the only case where the caller must still see the
      // reason printed directly, since no card can be built without a readable state.md.
      console.error(reason);
      return;
    }

    const snapshot = this.tryReadFeatureStateSnapshot(owner);
    const recorded = snapshot ? this.readRecordedBlockerProfile(snapshot) : null;
    const blocker: BlockerProfile = recorded
      ? { ...recorded, recoverability: 'human', evidence: uniqueStrings([...recorded.evidence, reason]) }
      : {
          kind: 'unknown',
          signature: buildBlockerSignature('unknown', snapshot?.lifecycleState ?? 'unknown', reason, [featureId]),
          recoverability: 'human',
          evidence: [reason],
          observed_state: `lifecycle=${snapshot?.lifecycleState ?? 'unknown'}`,
        };

    this.persistBlockedFeatureWithKnownBlocker(
      owner,
      featureId,
      null,
      reason,
      blocker,
      `Automatic recovery is exhausted for this blocker; a human must resolve it (see the printed card and this file's Blocked By evidence), then run \`npm run acknowledge-blocker\` to resume.`,
    );
    // The explicit, authoritative "diagnose_autocorrect already ran this to exhaustion" marker
    // inspectFeature()/inspectFix() check -- see requiresHumanAcknowledgment()'s own doc comment
    // for why this must NOT be inferred from `recoverability` alone.
    this.setRequiresHumanAcknowledgment(owner.statePath, true);
    // Every other blocking call site commits its own persisted state immediately afterward
    // (commitDirtyWorktreeIfConfigured) rather than leaving it dirty indefinitely; this path must
    // match, or the newly-written `blocked` state.md just sits as an uncommitted diff forever.
    this.commitDirtyWorktreeIfConfigured(`proto: record exhausted recovery block for feature ${featureId}`);
  }

  private executeStep(decision: StepDecision): StepExecutionResult {
    switch (decision.kind) {
      case 'plan_feature':
        this.planFeature(requireString(decision.feature_id, 'feature_id'));
        return { kind: 'advanced', exitCode: 0, continueLoop: true, summary: `Feature ${requireString(decision.feature_id, 'feature_id')} formalized.` };
      case 'plan_task':
        return this.planTask(requireString(decision.feature_id, 'feature_id'));
      case 'plan_fix':
        this.planFixRequest(requireString(decision.feature_id, 'feature_id'));
        return { kind: 'advanced', exitCode: 0, continueLoop: true, summary: `Fix ${requireString(decision.feature_id, 'feature_id')} formalized.` };
      case 'plan_fix_task':
        return this.planFixTask(requireString(decision.feature_id, 'feature_id'));
      case 'plan_subtask':
        this.planSubtask(requireString(decision.task_id, 'task_id'));
        return { kind: 'advanced', exitCode: 0, continueLoop: true, summary: `Subtask prepared for ${requireString(decision.task_id, 'task_id')}.` };
      case 'correct_state': {
        const correctionFeatureId = requireString(decision.feature_id, 'feature_id');
        return this.runBoundedOperation(
          correctionFeatureId,
          () => this.correctState(correctionFeatureId, decision.reason),
          () => ({ kind: 'advanced', exitCode: 0, continueLoop: true, summary: `State correction task created for feature ${correctionFeatureId}.` }),
        );
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
        this.recordBlockedFeature(requireString(decision.feature_id, 'feature_id'), decision.reason);
        return { kind: 'blocked', exitCode: 2, continueLoop: false, summary: decision.reason };
      case 'stop':
        // Was previously a hardcoded generic message regardless of why determineNextStep()
        // decided to stop -- silently swallowing the specific reason (e.g. "Primary task limit
        // reached...", or the new AI-call-budget message above) even though StepDecision already
        // carried it. Surface it instead of guessing at a one-size-fits-all string.
        console.log(decision.reason);
        return { kind: 'advanced', exitCode: 0, continueLoop: false, summary: decision.reason };
      default:
        return assertNever(decision.kind);
    }
  }

  private ensureCleanWorktreeIfRequired(featureId: string): void {
    if (this.skipCleanWorktreeCheck) {
      return;
    }

    this.git.ensureCleanWorktree([
      this.projectStateRelativePath(),
      // No trailing slash: isPathAllowedByPrefix (gitClient.ts) appends its own '/' when
      // checking a directory prefix, so a prefix that already ends in '/' never matches
      // anything inside it (a latent bug found and fixed alongside findDisallowedDirtyPaths()
      // below, which had the same mistake).
      this.featureRelativePath(featureId),
      // Both, because this precondition is shared by features and fixes and the caller's id is
      // only one of the two. Exactly one of these directories exists for any given id.
      this.fixRelativePath(featureId),
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

    const allowedPrefixes: string[] = [this.projectStateRelativePath()];
    if (decision.feature_id) {
      allowedPrefixes.push(this.featureRelativePath(decision.feature_id), this.fixRelativePath(decision.feature_id));
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
   * state correction whose scope is always just the state docs,
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
      this.projectStateRelativePath(),
      this.featureRelativePath(featureId),
      this.fixRelativePath(featureId),
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
      relativePath(this.repositoryRoot, this.projectStatePath),
      relativePath(this.repositoryRoot, this.configurationPath),
      buildFeaturesReadmePath(this.compassRoseRoot),
      buildTemplatePath(this.compassRoseRoot, 'feature.md'),
      buildTemplatePath(this.compassRoseRoot, 'architecture.md'),
      buildTemplatePath(this.compassRoseRoot, 'state.md'),
      'src/contracts/state/feature-state.md',
      'src/contracts/planner/feature-scope-guard.md',
      buildRoadmapPath(this.compassRoseRoot),
      buildSadPath(this.compassRoseRoot),
      buildAdrPath(this.compassRoseRoot),
      buildDmsPath(this.compassRoseRoot),
    ];
    const prompt = [
      'Act as the CompassRose Planner.',
      '',
      `Formalize feature \`${featureId}\`.`,
      '',
      'Read only:',
      '- `src/contracts/planner/feature-planning-prompt.md`',
      `- \`${relativePath(this.repositoryRoot, feature.requestPath)}\``,
      `- \`${relativePath(this.repositoryRoot, this.projectStatePath)}\``,
      `- \`${relativePath(this.repositoryRoot, this.configurationPath)}\``,
      `- \`${buildFeaturesReadmePath(this.compassRoseRoot)}\``,
      `- \`${buildTemplatePath(this.compassRoseRoot, 'feature.md')}\``,
      `- \`${buildTemplatePath(this.compassRoseRoot, 'architecture.md')}\``,
      `- \`${buildTemplatePath(this.compassRoseRoot, 'state.md')}\``,
      '- `src/contracts/state/feature-state.md`',
      '- `src/contracts/planner/feature-scope-guard.md`',
      `- \`${buildRoadmapPath(this.compassRoseRoot)}\``,
      `- \`${buildSadPath(this.compassRoseRoot)}\``,
      `- \`${buildAdrPath(this.compassRoseRoot)}\``,
      `- \`${buildDmsPath(this.compassRoseRoot)}\``,
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
    // Declared here, deterministically, not left to the Planner's own prose (ADR-0034/0046):
    // every freshly-formalized feature starts genuinely unvalidated, regardless of what (if
    // anything) the AI wrote for this key -- only "npm run feature-validation"'s explicit
    // human confirmation may ever flip it.
    const stateMarkdownWithValidation = replaceOperationalStatus(planned.state_md, { validation: 'not_started' });
    writeText(feature.statePath, ensureTrailingNewline(stateMarkdownWithValidation));
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
   * Mirrors planFeature(), narrower: no compassrose/ROADMAP.md/SAD.md/ADR.md/DMS.md reads (a fix
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
      relativePath(this.repositoryRoot, this.projectStatePath),
      relativePath(this.repositoryRoot, this.configurationPath),
      buildFixesReadmePath(this.compassRoseRoot),
      buildTemplatePath(this.compassRoseRoot, 'fix.md'),
      buildTemplatePath(this.compassRoseRoot, 'state.md'),
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
      `- \`${relativePath(this.repositoryRoot, this.projectStatePath)}\``,
      `- \`${relativePath(this.repositoryRoot, this.configurationPath)}\``,
      `- \`${buildFixesReadmePath(this.compassRoseRoot)}\``,
      `- \`${buildTemplatePath(this.compassRoseRoot, 'fix.md')}\``,
      `- \`${buildTemplatePath(this.compassRoseRoot, 'state.md')}\``,
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
    // See planFeature()'s identical fix: declared deterministically here (ADR-0034/0046), not
    // left to the Planner's own prose.
    const fixStateMarkdownWithValidation = replaceOperationalStatus(planned.state_md, { validation: 'not_started' });
    writeText(fix.statePath, ensureTrailingNewline(fixStateMarkdownWithValidation));

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
      // An *empty* outline and an *exhausted* one are different situations, and only the second can
      // possibly mean "finished". A feature that never declared a task request has not completed
      // anything; asking whether its acceptance criteria are met would be asking the wrong
      // question, and would spend an AI call to do it.
      if (taskRequests.length === 0) {
        const reason = `Task planning for feature \`${featureId}\` was invoked, but no task requests are declared at all. Formalize additional task requests before continuing.`;
        this.recordBlockedFeature(featureId, reason, null, {
          kind: 'task_interface_gap',
          nextPlanningHint: `Formalize additional task requests for feature \`${featureId}\`; none are declared.`,
        });
        this.commitDirtyWorktreeIfConfigured(`proto: record exhausted task requests block for feature ${featureId}`);
        return { kind: 'blocked', exitCode: 2, continueLoop: false, summary: reason };
      }

      // An exhausted outline has two possible meanings, and the runtime used to only know one of
      // them: "a task request was forgotten" (block and ask for more) versus "the work is actually
      // finished" (close the feature). 025-automated-development-loop adds the second reading,
      // decided against the feature's own acceptance criteria rather than by assumption.
      return this.attemptFeatureCompletion(featureId, feature);
    }

    return this.planTaskFromRequest(featureId, feature, nextRequest, taskRequests);
  }

  /**
   * The path from "the outline is exhausted" to `completed` (025-automated-development-loop).
   *
   * Before this, there was no such path: an exhausted outline could only ever produce "formalize
   * additional task requests", which is the right call when a task request was genuinely forgotten
   * and the wrong one when the work is actually finished. Both features ever completed in this
   * repository were closed by hand, and that gap was recorded in `002-configuration-model`'s own
   * Known Gaps for months.
   *
   * Four conditions must all hold, and they are checked in cost order -- the cheap deterministic
   * ones first, the AI call last, so a feature that obviously is not finished never pays for one.
   */
  private attemptFeatureCompletion(featureId: string, feature: FeatureRecord): StepExecutionResult {
    const owner = this.resolveWorkItemContext(featureId);
    const snapshot = this.tryReadFeatureStateSnapshot(owner);

    const blockIncomplete = (reason: string, hint: string): StepExecutionResult => {
      this.recordBlockedFeature(featureId, reason, null, { kind: 'task_interface_gap', nextPlanningHint: hint });
      this.commitDirtyWorktreeIfConfigured(`proto: record exhausted task requests block for feature ${featureId}`);
      return { kind: 'blocked', exitCode: 2, continueLoop: false, summary: reason };
    };

    if (!snapshot) {
      return blockIncomplete(
        `Feature \`${featureId}\` has an exhausted outline but no readable state document, so the runtime cannot tell whether it is finished.`,
        `Repair \`${featureId}\`'s state document before it can be closed.`,
      );
    }

    const pendingPointers = [
      snapshot.activeTask,
      snapshot.activeCorrectionTask,
    ].filter((pointer) => pointer && pointer !== 'none');

    if (pendingPointers.length > 0) {
      return blockIncomplete(
        `Feature \`${featureId}\` has an exhausted outline but still points at unfinished work (${pendingPointers.join(', ')}).`,
        `Finish or clear ${pendingPointers.join(', ')} before \`${featureId}\` can be closed.`,
      );
    }

    // Read straight from the document rather than widening FeatureStateSnapshot: these two fields
    // matter only here, and the snapshot is deliberately the compact shape the scheduler needs.
    const operationalStatus = parseStatusMap(requireSection(readUtf8(owner.statePath), 'Operational Status'));
    const gateResult = operationalStatus.last_quality_gate_result ?? 'unknown';
    const reviewResult = operationalStatus.last_review_result ?? 'not_run';

    if (gateResult === 'failed' || reviewResult === 'blocked' || reviewResult === 'changes_required') {
      return blockIncomplete(
        `Feature \`${featureId}\` has an exhausted outline but its last quality gate or review did not pass (gates: ${gateResult}, review: ${reviewResult}).`,
        `Resolve the failing gate or review for \`${featureId}\` before it can be closed.`,
      );
    }

    const criteria = parseBulletSection(optionalSection(readUtf8(feature.featurePath), 'Acceptance Criteria')) ?? [];
    if (criteria.length === 0) {
      return blockIncomplete(
        `Feature \`${featureId}\` has an exhausted outline but declares no acceptance criteria, so there is nothing to verify it against.`,
        `Add acceptance criteria to \`${featureId}\`'s feature.md before it can be closed.`,
      );
    }

    const verification = this.verifyAcceptanceCriteria(featureId, feature, criteria);
    const unmet = unmetCriteria(verification);

    if (!allCriteriaMet(verification)) {
      const reason = `Feature \`${featureId}\`'s outline is exhausted but ${unmet.length} of ${verification.verdicts.length} acceptance criteria are not met: ${unmet.map((verdict: AcceptanceCriterionVerdict) => verdict.criterion).join('; ')}`;
      // A blocked outcome, not a failed one: the run sets this feature aside and carries on.
      this.recordBlockedFeature(featureId, reason, null, {
        kind: 'task_interface_gap',
        nextPlanningHint: `Feature \`${featureId}\` cannot be closed until these acceptance criteria are met: ${unmet.map((verdict: AcceptanceCriterionVerdict) => verdict.criterion).join('; ')}`,
      });
      this.commitDirtyWorktreeIfConfigured(`proto: record unmet acceptance criteria for feature ${featureId}`);
      return { kind: 'blocked', exitCode: 2, continueLoop: false, summary: reason };
    }

    // 029-runnable-application-gate: the last condition before closing, and the only one that
    // observes the application rather than reading about it. Typecheck, tests, lint and build all
    // pass happily on something that does not start.
    const smoke = runSmokeGate({ smoke: this.projectConfiguration.smoke, cwd: this.repositoryRoot });
    if (smoke.outcome === 'failed') {
      // The captured output goes into the reason rather than a separate evidence channel: the
      // blocker card and `## Blocked By` both read from it, and this is what a human needs to see.
      const reason = [
        `Feature \`${featureId}\` meets its acceptance criteria but the application does not start.`,
        `\`${smoke.command}\`: ${smoke.unmet.join('; ')}`,
        ...(smoke.output.length > 0 ? ['', smoke.output] : []),
      ].join('\n');
      this.recordBlockedFeature(featureId, reason, null, {
        kind: 'smoke_failure',
        nextPlanningHint: `Make the application start again before \`${featureId}\` can be closed: \`${smoke.command}\` -- ${smoke.unmet.join('; ')}`,
      });
      this.commitDirtyWorktreeIfConfigured(`proto: record smoke failure for feature ${featureId}`);
      return { kind: 'blocked', exitCode: 2, continueLoop: false, summary: reason };
    }

    writeText(owner.statePath, this.updateFeatureStateAfterCompletion(owner.statePath, verification, smoke));
    writeText(this.projectStatePath, this.updateProjectStateAfterCompletion(featureId, verification));
    this.commitDirtyWorktreeIfConfigured(`proto: complete feature ${featureId}`);

    const summary = `Feature ${featureId} is complete: every task request is done, all ${verification.verdicts.length} acceptance criteria are met, and the application ${smoke.outcome === 'skipped' ? 'declares no start check' : 'starts'}.`;
    console.log(summary);
    return { kind: 'advanced', exitCode: 0, continueLoop: true, summary };
  }

  /**
   * Asks the reviewer role whether each of a feature's own acceptance criteria is actually
   * satisfied by the repository, returning a per-criterion verdict with evidence rather than one
   * boolean -- so a refusal to close names exactly which criteria stand in the way.
   */
  private verifyAcceptanceCriteria(
    featureId: string,
    feature: FeatureRecord,
    criteria: readonly string[],
  ): AcceptanceCriteriaVerification {
    const sourcePaths = [
      relativePath(this.repositoryRoot, feature.featurePath).split('\\').join('/'),
      relativePath(this.repositoryRoot, feature.architecturePath).split('\\').join('/'),
      relativePath(this.repositoryRoot, feature.statePath).split('\\').join('/'),
    ];

    const label = `acceptance-criteria:${featureId}`;
    const prompt = [
      'Act as the CompassRose Acceptance Verifier.',
      '',
      `Decide, for each acceptance criterion of feature \`${featureId}\`, whether the repository actually satisfies it.`,
      '',
      'Read:',
      ...sourcePaths.map((path) => `- \`${path}\``),
      '- the source and test files those documents name',
      '',
      'Acceptance criteria to verify, verbatim:',
      ...criteria.map((criterion, index) => `${index + 1}. ${criterion}`),
      '',
      'Rules:',
      '- Return exactly one verdict per criterion, in the same order, quoting the criterion verbatim.',
      '- `evidence` must be concrete -- a path, a symbol, a test name -- never a restatement of the criterion.',
      '- Use `unverifiable` when the evidence you would need is not present in what you read. Do not guess.',
      '- `unverifiable` counts as unmet. Closing a feature is irreversible bookkeeping; the default is always to leave it open.',
      '- Do not modify files.',
      '',
      'Return JSON only, matching the acceptance-criteria-verification schema.',
    ].join('\n');

    this.recordAgentInvocationContext(this.buildAgentInvocationContext({
      role: 'reviewer',
      kind: 'acceptance_criteria_verification',
      label,
      feature_id: featureId,
      task_id: null,
      source_paths: sourcePaths,
      prompt,
      tool: {
        name: 'codex',
        command: this.codexCommand,
        model: resolveCodexPlannerModel(),
        output_schema_id: 'acceptance_criteria_verification',
      },
    }));

    return this.codex.runStructured<AcceptanceCriteriaVerification>(
      prompt,
      this.contracts.schema('acceptance_criteria_verification'),
      sourcePaths,
      label,
    );
  }

  private updateFeatureStateAfterCompletion(
    featureStatePath: string,
    verification: AcceptanceCriteriaVerification,
    smoke: SmokeResult,
  ): string {
    let markdown = readUtf8(featureStatePath);
    markdown = replaceSection(markdown, 'Lifecycle State', 'completed');
    markdown = replaceOperationalStatus(markdown, {
      active_task: 'none',
      active_correction_task: 'none',
    });
    markdown = replaceSection(markdown, 'Remaining Deliverables', '- None');
    markdown = replaceSection(markdown, 'Blocked By', '- None');
    // The verdicts are the record of *why* this feature was closed, which is the one thing a
    // reader will want six months from now and the one thing a bare `completed` never says.
    markdown = replaceSection(
      markdown,
      'Last Approved Change',
      [
        verification.summary,
        '',
        ...verification.verdicts.map((verdict: AcceptanceCriterionVerdict) => `- ${verdict.criterion} — ${verdict.status} (${verdict.evidence})`),
        '',
        // A skip is recorded rather than left silent: "we did not check" and "we checked and it
        // started" must not read the same way six months from now.
        smoke.outcome === 'skipped'
          ? `- start check: skipped (${smoke.command})`
          : `- start check: passed (\`${smoke.command}\`)`,
      ].join('\n'),
    );
    markdown = replaceSection(
      markdown,
      'Next Planning Hint',
      `Feature \`${verification.feature_id}\` is complete; select the next feature by the deterministic priority order.`,
    );
    return markdown;
  }

  private updateProjectStateAfterCompletion(
    featureId: string,
    verification: AcceptanceCriteriaVerification,
  ): string {
    let markdown = readUtf8(this.projectStatePath);
    markdown = upsertBulletInSection(
      markdown,
      'Implemented',
      `- Feature \`${featureId}\` is complete`,
      `- Feature \`${featureId}\` is complete: all ${verification.verdicts.length} acceptance criteria verified.`,
    );
    markdown = replaceSection(
      markdown,
      'Last Approved Change',
      `Feature \`${featureId}\` was completed after every acceptance criterion was verified as met.`,
    );
    markdown = replaceSection(
      markdown,
      'Next Planning Hint',
      `Feature \`${featureId}\` is complete; select the next feature by the deterministic priority order.`,
    );
    return markdown;
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
      this.recordBlockedFeature(featureId, reason);
      this.commitDirtyWorktreeIfConfigured(`proto: record task-request backfill block for feature ${featureId}`);
      return { kind: 'blocked', exitCode: 2, continueLoop: false, summary: reason };
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
    // Explicit, not guessed: this call site already knows the sibling-feature cause firsthand.
    // classifyBlockerKind's regex matches the word "scope" in `reason` today and happens to land
    // on task_interface_gap by accident -- fragile against any future rewording -- and its hint
    // always says "recover the blocker", never naming the sibling feature that actually
    // needs attention. See fix 001-blocked-feature-scope-misclassification.
    this.recordBlockedFeature(featureId, reason, null, {
      kind: 'task_interface_gap',
      nextPlanningHint: `Formalize or advance feature \`${belongsToOtherFeature}\`; the previously proposed task for \`${featureId}\` belongs to that feature's own scope, not this one's.`,
    });
    this.commitDirtyWorktreeIfConfigured(`proto: record scope-guard block for feature ${featureId}`);
    return { kind: 'blocked', exitCode: 2, continueLoop: false, summary: reason };
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

  private taskTrailArtifactPath(taskId: string): string {
    return join('task-trails', `${taskId}.json`);
  }

  /**
   * Records what a step did, for the body of the one commit this task will eventually produce.
   *
   * Recorded unconditionally, including under `--no-commit`: the trail is the runtime's own record
   * of the task's arc, and a run that isn't committing is exactly the run whose steps would
   * otherwise leave no trace at all. Writing it is cheap and never fails a step -- an unwritable
   * artifact store is not a reason to abandon work that already happened.
   */
  private recordTaskTrail(taskId: string, step: string, detail: string): void {
    try {
      const existing = this.artifacts.readJson<TaskCommitTrailEntry[]>(this.taskTrailArtifactPath(taskId)) ?? [];
      this.artifacts.writeJson(this.taskTrailArtifactPath(taskId), [
        ...existing,
        { step, detail, at: new Date().toISOString() },
      ]);
    } catch {
      // The commit body degrades to its subject line; see renderTaskCommitMessage.
    }
  }

  /**
   * Commits everything the task touched as one commit, with the accumulated bookkeeping as its
   * body, and clears the trail so a later task never inherits it.
   *
   * `diffNameOnly()` sweeps the whole worktree deliberately: by this point the tree holds the task
   * document, both state documents, and the implementer's own diff, all written across several
   * steps that no longer commit for themselves. Sweeping is also what the terminal outcomes
   * already did before this existed.
   */
  private commitTaskArc(taskId: string, subject: string): void {
    const trail = this.artifacts.readJson<TaskCommitTrailEntry[]>(this.taskTrailArtifactPath(taskId)) ?? [];
    // Cleared before the commit, not after: the trail belongs to the arc that is ending, and a
    // commit that throws must not leave the next attempt inheriting this one's history.
    this.artifacts.writeJson(this.taskTrailArtifactPath(taskId), []);

    if (!this.options.commit) {
      return;
    }

    const changedFiles = this.git.diffNameOnly();
    if (changedFiles.length === 0) {
      return;
    }

    this.git.commit(changedFiles, renderTaskCommitMessage(subject, trail));
  }

  private finalizeTaskPlan(
    featureId: string,
    feature: FeatureRecord,
    planned: PlannerOutput,
    taskRequestLink: { featureId: string; taskRequestId: string } | null = null,
  ): StepExecutionResult {
    const scopeSanitization = sanitizeAllowedPaths(planned.task.scope.allowed_paths);
    this.logScopeSanitizationNotices(scopeSanitization.notices);
    const task: PlannedTask = {
      ...planned.task,
      scope: { ...planned.task.scope, allowed_paths: scopeSanitization.allowedPaths },
    };
    const sanitizedPlanned: PlannerOutput = { ...planned, task };
    validateTaskDeliverables(task, 'task');
    this.assertTaskIdIsUnused(feature.tasksDirectory, task.task_id, 'Task planning');

    const taskPath = join(feature.tasksDirectory, buildTaskFileName(task.task_id, task.title));
    const taskMarkdown = renderTaskMarkdown(task);

    // 027-bounded-work-item-context: check the budget before writing anything. If a task's declared
    // context does not fit, the problem is the size of the task, not the context -- and catching it
    // here costs one planning call rather than an implementation call that half-writes something.
    const overflow = this.checkPlannedTaskContextBudget(featureId, task.task_id, taskPath, task.context.relevant_paths, feature);
    if (overflow) {
      return overflow;
    }

    this.writeTaskDocument(taskPath, taskMarkdown);
    this.artifacts.writeJson(join('tasks', `${task.task_id}.json`), sanitizedPlanned);

    const updatedFeatureState = this.updateFeatureStateForTaskPlan(feature.statePath, task.task_id, task.title, taskRequestLink);
    const updatedProjectState = this.updateProjectStateForTaskPlan(featureId, task.task_id);

    writeText(feature.statePath, updatedFeatureState);
    writeText(this.projectStatePath, updatedProjectState);

    this.recordTaskTrail(
      task.task_id,
      'planned',
      taskRequestLink
        ? `${task.title} (task request ${taskRequestLink.taskRequestId})`
        : task.title,
    );

    return { kind: 'advanced', exitCode: 0, continueLoop: true, summary: `Next task planned for feature ${featureId}.` };
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
      relativePath(this.repositoryRoot, this.projectStatePath),
      relativePath(this.repositoryRoot, this.configurationPath),
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
      `- \`${relativePath(this.repositoryRoot, this.projectStatePath)}\``,
      `- \`${relativePath(this.repositoryRoot, this.configurationPath)}\``,
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
      relativePath(this.repositoryRoot, this.projectStatePath),
      relativePath(this.repositoryRoot, this.configurationPath),
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
      `- \`${relativePath(this.repositoryRoot, this.projectStatePath)}\``,
      `- \`${relativePath(this.repositoryRoot, this.configurationPath)}\``,
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
        this.recordBlockedFeature(featureId, reason);
        this.commitDirtyWorktreeIfConfigured(`proto: record scope-boundary block for feature ${featureId}`);
        return { kind: 'blocked', exitCode: 2, continueLoop: false, summary: reason };
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
   * check -- that mechanism stays feature-only in v1 (see compassrose/fixes/README.md and the plan).
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
      relativePath(this.repositoryRoot, this.projectStatePath),
      relativePath(this.repositoryRoot, this.configurationPath),
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
      `- \`${relativePath(this.repositoryRoot, this.projectStatePath)}\``,
      `- \`${relativePath(this.repositoryRoot, this.configurationPath)}\``,
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
    const scopeSanitization = sanitizeAllowedPaths(rawPlanned.task.scope.allowed_paths);
    this.logScopeSanitizationNotices(scopeSanitization.notices);
    // Deterministic, not trusted from the LLM's own echo -- fixes never have task requests.
    const planned: PlannerOutput = {
      task: {
        ...rawPlanned.task,
        source_task_request_id: null,
        scope: { ...rawPlanned.task.scope, allowed_paths: scopeSanitization.allowedPaths },
      },
    };
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

    this.recordTaskTrail(task.task_id, 'planned', `${task.title} (fix ${fixId})`);

    return { kind: 'advanced', exitCode: 0, continueLoop: true, summary: `Next task planned for fix ${fixId}.` };
  }

  private planSubtask(taskId: string): void {
    const task = this.loadTask(taskId);
    this.ensureCleanWorktreeIfRequired(task.featureId);
    const owner = this.resolveWorkItemContext(task.featureId);

    writeText(owner.statePath, this.updateFeatureStateDuringImplementation(owner.statePath, task.taskId));
    writeText(this.projectStatePath, this.updateProjectStateDuringImplementation(task.featureId, task.taskId));

    this.recordTaskTrail(task.taskId, 'prepared', 'task_ready -> implementation_running');
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
    };
  }

  private diagnoseAndAutocorrect(featureId: string, reason: string): StepExecutionResult {
    const owner = this.resolveWorkItemContext(featureId);
    const decision = this.runDiagnosticAutocorrection(owner, reason);
    this.writeDiagnosticArtifact(decision);

    if (decision.next_step === 'correct_state') {
      if (!statSafeIsFile(owner.statePath)) {
        return {
          kind: 'blocked',
          exitCode: 2,
          continueLoop: false,
          summary: `${decision.next_step_reason} The current runtime cannot generate a deterministic state-correction artifact because ${relativePath(this.repositoryRoot, owner.statePath)} is missing.`,
        };
      }

      return this.runBoundedOperation(
        featureId,
        () => this.correctState(featureId, decision.next_step_reason),
        () => ({
          kind: 'advanced',
          exitCode: 0,
          continueLoop: true,
          summary: `Diagnostic/autocorrection applied a state correction for feature ${featureId}.`,
        }),
      );
    }

    if (decision.next_step === 'block_for_conversation') {
      // 026-conversational-doctor-recovery: this used to plan and execute a repair task, and chain
      // into another when that failed. Feature 003-doctor-command accumulated nine of them without
      // ever unblocking, and not one asked a human anything -- while the information that would
      // have resolved it existed only in a human's head.
      //
      // The item is blocked instead, and the way out is `/desbloquear`: a diagnosis with two or
      // three ordered hypotheses, each with the evidence supporting it and the one question the
      // human can answer that the repository cannot. The blocked outcome means the run sets this
      // item aside and carries on rather than grinding here.
      const reason = `${decision.next_step_reason} Automatic repair is no longer attempted for this; run \`/desbloquear ${featureId}\` and we will work out the root cause together.`;
      this.recordBlockedFeature(featureId, reason, null, {
        kind: decision.blocker.kind,
        nextPlanningHint: `Feature \`${featureId}\` needs a human: open a session and run \`/desbloquear ${featureId}\`.`,
      });
      // Marks it `blocked_on_human`, so both scheduler passes skip it until the conversation
      // resolves it -- rather than re-diagnosing and re-blocking it on every subsequent run.
      this.setRequiresHumanAcknowledgment(owner.statePath, true);
      this.commitDirtyWorktreeIfConfigured(`proto: block ${featureId} for a recovery conversation`);
      return { kind: 'blocked', exitCode: 2, continueLoop: false, summary: reason };
    }

    if (decision.next_step === 'file_blocking_fix' && decision.systemic_blocker) {
      const systemicBlocker = decision.systemic_blocker;
      const fixId = this.fileOrReuseBlockingFix({
        signature: this.computeSystemicBlockerSignature(featureId, systemicBlocker),
        titleSubject: systemicBlocker.title,
        severity: systemicBlocker.severity,
        whatHappened: systemicBlocker.evidence_summary,
        evidenceLines: [`- ${systemicBlocker.evidence_summary}`, `- Diagnosed while resolving: ${featureId}.`],
        outlineStep: `Diagnosing and repairing: ${systemicBlocker.title}.`,
        scopeExcludes: systemicBlocker.scope_note,
        problem: systemicBlocker.evidence_summary,
        acceptanceCriterion: `The systemic defect described in \`${systemicBlocker.title}\` no longer reproduces.`,
        completionCriterion: `The defect is repaired, and every feature/fix blocked on this fix id can resume.`,
        currentReality: systemicBlocker.evidence_summary,
        nextPlanningHint: `diagnose and repair: ${systemicBlocker.title}.`,
      });
      const reason =
        `Diagnostic/autocorrection classified the blocker on ${featureId} as systemic rather than a bounded `
        + `implementation issue; filed/reused fix \`${fixId}\` and stopped instead of blocking it for a recovery conversation.`;

      // recordBlockedFeature() already prints the blocker card (persistBlockedFeature's single
      // choke point) whenever state.md exists to persist against; the fallback print below only
      // ever fires for the malformed-state edge case, where there is no BlockerProfile to render.
      let cardPrinted = false;
      if (statSafeIsFile(owner.statePath)) {
        this.recordBlockedFeature(featureId, reason);
        this.setBlockedOnFix(owner, fixId);
        cardPrinted = true;
      }

      if (this.options.commit) {
        this.git.commit(
          [
            relativePath(this.repositoryRoot, owner.statePath),
            relativePath(this.repositoryRoot, this.projectStatePath),
            relativePath(this.repositoryRoot, join(this.fixesRoot, fixId)),
          ],
          `proto: file blocking fix ${fixId} for ${featureId}`,
        );
      }

      if (!cardPrinted) {
        console.error(reason);
      }
      return {
        kind: 'blocked',
        exitCode: 2,
        continueLoop: false,
        summary: reason,
      };
    }

    let cardPrinted = false;
    if (statSafeIsFile(owner.statePath)) {
      try {
        this.recordBlockedFeature(featureId, decision.next_step_reason);
        cardPrinted = true;
      } catch {
        // Keep the diagnostic artifact even when the malformed state cannot be persisted as blocked state.
      }
    }

    if (!cardPrinted) {
      console.error(decision.diagnosis_summary);
    }
    return {
      kind: 'blocked',
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

          return this.buildDeterministicRecoveryConversationDecision(feature, snapshot, blocker, reason, [
            relativePath(this.repositoryRoot, feature.statePath),
            relativePath(this.repositoryRoot, this.projectStatePath),
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

      // A state_corruption blocker unconditionally proposed correct_state here, with no check
      // for whether this anchor had already exhausted its correction limit -- so once
      // correctState() refused (StateCorrectionLimitReachedError), every subsequent
      // diagnose_autocorrect run for this feature deterministically re-proposed the same doomed
      // correction and immediately hit the same limit again, forever, with no escape but manual
      // intervention. Observed live on feature 003-doctor-command's F003-T01 anchor. Escalate to
      // a recovery conversation instead, exactly like the analogous `blocked` branch above.
      const correctionAnchor = snapshot.activeTask !== 'none'
        ? snapshot.activeTask
        : this.resolveStateCorrectionActiveTaskFromArtifacts(feature.id);
      if (correctionAnchor && this.buildStateCorrectionTaskId(feature.tasksDirectory, correctionAnchor) === null) {
        const taskPath = this.tryFindTaskDocumentPath(correctionAnchor, feature.tasksDirectory);
        return this.buildDeterministicRecoveryConversationDecision(feature, snapshot, blocker, reason, [
          relativePath(this.repositoryRoot, feature.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
          'src/contracts/runtime/operation-loop.md',
          taskPath ? relativePath(this.repositoryRoot, taskPath) : null,
        ]);
      }

      return this.buildDeterministicStateCorrectionDecision(feature, blocker, reason);
    }

    if (snapshot.lifecycleState === 'implementation_failed') {
      const activeTask = this.resolveImplementationFailureActiveTask(feature, snapshot);
      if (activeTask) {
        return this.buildDeterministicRecoveryConversationDecision(feature, snapshot, blocker, reason, [
          relativePath(this.repositoryRoot, feature.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
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
        'The implementation failed, and the runtime could not recover a trusted active task anchor to name in a recovery conversation.',
      );
    }

    if (snapshot.lifecycleState === 'quality_failed' || snapshot.lifecycleState === 'review_failed' || snapshot.lifecycleState === 'blocked') {
      if (blocker.recoverability === 'terminal' || blocker.recoverability === 'human') {
        return this.consultDoctorOnSystemicBlocker(feature, blocker, reason, null);
      }

      const recoveryAnchor = snapshot.activeTask !== 'none'
        ? snapshot.activeTask
        : snapshot.blockedFrom?.active_task && snapshot.blockedFrom.active_task !== 'none'
          ? snapshot.blockedFrom.active_task
          : this.resolveStateCorrectionActiveTaskFromArtifacts(feature.id);

      if (recoveryAnchor) {
        const taskPath = this.tryFindTaskDocumentPath(recoveryAnchor, feature.tasksDirectory);
        return this.buildDeterministicRecoveryConversationDecision(feature, snapshot, blocker, reason, [
          relativePath(this.repositoryRoot, feature.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
          'src/contracts/runtime/operation-loop.md',
          taskPath ? relativePath(this.repositoryRoot, taskPath) : null,
        ]);
      }

      return this.consultDoctorOnSystemicBlocker(feature, blocker, reason, null);
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

  /**
   * The one place diagnostic/autocorrection consults a model instead of deciding
   * deterministically: reached only when a quality_failed/review_failed/blocked rejection
   * cannot be resolved into block_for_conversation by the deterministic checks above (terminal/
   * human recoverability, or no safe recovery anchor) -- i.e. exactly where the runtime would
   * otherwise stop the whole run. Filing file_blocking_fix is expensive and hard to reverse (a
   * new tracked work item, visible throughout the project's docs), so per ADR-0038 the choice
   * itself is cross-checked by a 3-vote ensemble (classifySystemicBlockerNextStepByEnsemble)
   * before this single-call, full-detail consultation is trusted -- either as the source of the
   * file_blocking_fix payload once the ensemble agrees, or as the unchanged fallback when the
   * ensemble can't run at all. Any malformed/untrusted response still falls back to the same
   * stop_with_diagnostic halt the deterministic path would have produced anyway, via
   * ensureDiagnosticAutocorrectionDecision -- never a worse outcome than before this feature
   * existed.
   */
  private consultDoctorOnSystemicBlocker(
    feature: WorkItemContext,
    blocker: BlockerProfile,
    reason: string,
    taskId: string | null,
  ): DiagnosticAutocorrectionDecision {
    const votes = this.classifySystemicBlockerNextStepByEnsemble(feature, blocker, reason, taskId);
    if (!votes) {
      // Ensemble unavailable (e.g. no codex binary) -- fall back to the single-call consultation
      // exactly as it behaved before this feature existed.
      return this.consultDoctorOnSystemicBlockerSingleVote(feature, blocker, reason, taskId);
    }

    const resolved = resolveUnanimousVote(votes);
    if (!resolved.agreed) {
      return this.buildDiagnosticFallbackDecision(
        feature,
        reason,
        `The systemic-blocker ensemble disagreed on next_step (votes: ${votes.join(', ')}); refusing to trust a single vote.`,
      );
    }

    if (resolved.value === 'block_for_conversation') {
      // No further call needed: block_for_conversation carries no extra payload to generate, and
      // `blocker` is already the caller's own trusted profile -- reuse it rather than asking the
      // model to restate it.
      return {
        feature_id: feature.id,
        diagnosis_summary: `The blocker-kind classification ensemble agreed this defect is bounded to ${feature.id}'s own frame; blocking it for a recovery conversation.`,
        blocker,
        next_step: 'block_for_conversation',
        next_step_reason: reason,
        interface_response: {
          mode: 'recovery_conversation',
          summary: 'Ensemble-confirmed bounded recovery; no systemic fix required.',
          target_paths: [],
        },
        systemic_blocker: null,
      };
    }

    // resolved.value === 'file_blocking_fix': the ensemble only settles *whether* to file a fix,
    // not the fix's own title/evidence/scope wording -- voting on free text would just relocate
    // the ADR-0031 prose-guessing problem one level up (three independently-phrased payloads
    // have no meaningful "agreement" to check). A single further call generates that payload now
    // that the decision itself is validated; if it contradicts the ensemble by returning
    // block_for_conversation anyway, that is treated as an untrustworthy response, not silently
    // accepted over the ensemble's consensus.
    const detail = this.consultDoctorOnSystemicBlockerSingleVote(feature, blocker, reason, taskId);
    if (detail.next_step !== 'file_blocking_fix') {
      return this.buildDiagnosticFallbackDecision(
        feature,
        reason,
        'The systemic-blocker ensemble agreed on file_blocking_fix, but the detail call contradicted it; refusing to trust either.',
      );
    }

    return detail;
  }

  /**
   * Shared ensemble harness behind classifySystemicBlockerNextStepByEnsemble() and
   * classifyReviewBlockerKindByEnsemble(): fires `size` independent, fresh-context structured
   * calls with no shared history between them, each recorded through the same invocation-context
   * choke point. Returns null the instant any single call throws or `extractVote` rejects its
   * raw response, signaling the caller to fall back to its own single-call/regex path entirely --
   * an incomplete vote set is never a basis for either trusting agreement or detecting
   * disagreement. See ADR-0036/ADR-0038.
   */
  private runClassifierEnsemble<T>(options: {
    readonly size: number;
    readonly prompt: string;
    readonly labelPrefix: string;
    readonly invocationKind: AgentInvocationKind;
    readonly schemaId: StructuredSchemaId;
    readonly featureId: string | null;
    readonly taskId: string | null;
    readonly extractVote: (raw: Record<string, unknown>) => T | null;
  }): readonly T[] | null {
    const votes: T[] = [];
    for (let attempt = 1; attempt <= options.size; attempt += 1) {
      const label = `${options.labelPrefix}:${attempt}`;
      this.recordAgentInvocationContext(this.buildAgentInvocationContext({
        role: 'classifier',
        kind: options.invocationKind,
        label,
        feature_id: options.featureId,
        task_id: options.taskId,
        source_paths: [],
        prompt: options.prompt,
        tool: {
          name: 'codex',
          command: this.codexCommand,
          model: resolveCodexPlannerModel(),
          output_schema_id: options.schemaId,
        },
      }));

      let raw: Record<string, unknown>;
      try {
        raw = this.codex.runStructured<Record<string, unknown>>(
          options.prompt,
          this.contracts.schema(options.schemaId),
          [],
          label,
        );
      } catch {
        return null;
      }

      const vote = options.extractVote(raw);
      if (vote === null) {
        return null;
      }

      votes.push(vote);
    }

    return votes;
  }

  /**
   * Fires BLOCKER_KIND_ENSEMBLE_SIZE independent, fresh-context votes on next_step only (a
   * cheap, closed two-value question) -- no shared history between calls, each seeing the same
   * declared minimal blocker context. Returns null if the ensemble could not run at all (codex
   * unavailable, or any single call returned a malformed response), signaling the caller to fall
   * back to the single-call consultation entirely. See ADR-0038.
   */
  private classifySystemicBlockerNextStepByEnsemble(
    feature: WorkItemContext,
    blocker: BlockerProfile,
    reason: string,
    taskId: string | null,
  ): readonly ('block_for_conversation' | 'file_blocking_fix')[] | null {
    const prompt = [
      'Act as the CompassRose Systemic Blocker Triage role.',
      '',
      `Decide only whether \`${feature.id}\`'s blocker is bounded to its own frame or a systemic defect outside it. Do not describe the fix itself.`,
      '',
      'Blocker context:',
      `- kind: ${blocker.kind}`,
      `- signature: ${blocker.signature}`,
      `- recoverability: ${blocker.recoverability}`,
      `- observed_state: ${blocker.observed_state}`,
      ...blocker.evidence.map((item) => `- evidence: ${item}`),
      '',
      `Reason this diagnosis was triggered: ${reason}`,
      '',
      'Rules:',
      '- Choose exactly one next_step: `block_for_conversation` or `file_blocking_fix`. No other value is valid.',
      "- Choose `block_for_conversation` only if the evidence shows a bounded gap (stale anchor, prompt/scope tightening, missing evidence) confined to this feature/fix's own frame, which a human could resolve by answering one question about it.",
      "- Choose `file_blocking_fix` if the defect is outside this feature/fix's own frame entirely -- architectural, framework-level, or otherwise systemic -- so no bounded recovery task confined to it could resolve the root cause.",
      '- Reason independently from the evidence above only -- do not assume any other attempt\'s conclusion.',
      '- Return JSON only and do not modify files.',
    ].join('\n');

    return this.runClassifierEnsemble<'block_for_conversation' | 'file_blocking_fix'>({
      size: BLOCKER_KIND_ENSEMBLE_SIZE,
      prompt,
      labelPrefix: `classifier:systemic-blocker-next-step:${feature.id}`,
      invocationKind: 'systemic_blocker_next_step',
      schemaId: 'systemic_blocker_next_step',
      featureId: feature.id,
      taskId,
      extractVote: (raw) => (raw.next_step === 'block_for_conversation' || raw.next_step === 'file_blocking_fix' ? raw.next_step : null),
    });
  }

  private consultDoctorOnSystemicBlockerSingleVote(
    feature: WorkItemContext,
    blocker: BlockerProfile,
    reason: string,
    taskId: string | null,
  ): DiagnosticAutocorrectionDecision {
    const sourcePaths = [
      'src/contracts/runtime/diagnostic-autocorrection.md',
      relativePath(this.repositoryRoot, feature.statePath),
      relativePath(this.repositoryRoot, this.projectStatePath),
    ];

    const prompt = [
      'Act as the CompassRose Diagnostic/Autocorrection role.',
      '',
      `Decide the next step for \`${feature.id}\`, which is blocked and could not be resolved by deterministic classification alone.`,
      '',
      'Read only:',
      '- `src/contracts/runtime/diagnostic-autocorrection.md`',
      `- \`${relativePath(this.repositoryRoot, feature.statePath)}\``,
      `- \`${relativePath(this.repositoryRoot, this.projectStatePath)}\``,
      '',
      'Blocker context:',
      `- kind: ${blocker.kind}`,
      `- signature: ${blocker.signature}`,
      `- recoverability: ${blocker.recoverability}`,
      `- observed_state: ${blocker.observed_state}`,
      ...blocker.evidence.map((item) => `- evidence: ${item}`),
      '',
      `Reason this diagnosis was triggered: ${reason}`,
      '',
      'Rules:',
      '- Choose exactly one next_step: `block_for_conversation` or `file_blocking_fix`. No other value is valid from this call.',
      "- Choose `block_for_conversation` only if the evidence shows a bounded gap (stale anchor, prompt/scope tightening, missing evidence) confined to this feature/fix's own frame, which a human could resolve by answering one question about it.",
      "- Choose `file_blocking_fix` if the defect is outside this feature/fix's own frame entirely -- architectural, framework-level, or otherwise systemic -- so no bounded recovery task confined to it could resolve the root cause.",
      '- When choosing `file_blocking_fix`, populate `systemic_blocker` with `title` (short, specific, becomes the new fix\'s slug), `evidence_summary`, `scope_note` (must state the new fix excludes this feature/fix\'s own remaining work), and `severity` fixed to `"critical"`.',
      '- When choosing `block_for_conversation`, set `systemic_blocker` to `null`.',
      '- Never let a `file_blocking_fix` scope include any of this feature/fix\'s own remaining work.',
      '- `diagnosis_summary`, `next_step_reason`, and every `evidence`/`evidence_summary`/`scope_note`/`interface_response.summary` value are read directly by a human at the console, not only by the next AI call -- keep each to one short, plain sentence.',
      '- Return JSON only and do not modify files.',
    ].join('\n');

    const label = `doctor:diagnostic-autocorrection:${feature.id}`;
    this.recordAgentInvocationContext(this.buildAgentInvocationContext({
      role: 'doctor',
      kind: 'diagnostic_autocorrection',
      label,
      feature_id: feature.id,
      task_id: taskId,
      source_paths: sourcePaths,
      prompt,
      tool: {
        name: 'codex',
        command: this.codexCommand,
        model: resolveCodexPlannerModel(),
        output_schema_id: 'diagnostic_autocorrection',
      },
    }));

    const raw = this.codex.runStructured<DiagnosticAutocorrectionDecision>(
      prompt,
      this.contracts.schema('diagnostic_autocorrection'),
      [],
      label,
    );

    return this.ensureDiagnosticAutocorrectionDecision(feature, reason, raw);
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
      systemic_blocker: null,
    };
  }

  private buildDeterministicRecoveryConversationDecision(
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
      diagnosis_summary: 'The blocker needs something only a human can supply, so the runtime blocks this item for a recovery conversation instead of guessing or stopping the whole run.',
      blocker,
      next_step: 'block_for_conversation',
      next_step_reason: reason,
      interface_response: {
        mode: 'recovery_conversation',
        summary: activeTask
          ? `Work out the root cause with a human, starting from the recorded task anchor ${activeTask}.`
          : 'Work out the root cause with a human, starting from the current recovery evidence and re-entry target.',
        target_paths: uniqueStrings([
          ...targetPaths.filter((item): item is string => typeof item === 'string' && item.length > 0),
          relativePath(this.repositoryRoot, feature.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
        ]),
      },
      systemic_blocker: null,
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
      systemic_blocker: null,
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

    if (decision.next_step === 'file_blocking_fix') {
      const systemicBlocker = decision.systemic_blocker;
      if (
        !systemicBlocker ||
        typeof systemicBlocker.title !== 'string' || systemicBlocker.title.trim().length === 0 ||
        typeof systemicBlocker.evidence_summary !== 'string' || systemicBlocker.evidence_summary.trim().length === 0 ||
        typeof systemicBlocker.scope_note !== 'string' || systemicBlocker.scope_note.trim().length === 0 ||
        systemicBlocker.severity !== 'critical'
      ) {
        return this.buildDiagnosticFallbackDecision(
          feature,
          reason,
          'Diagnostic/autocorrection chose file_blocking_fix without a valid systemic_blocker payload.',
        );
      }
    }

    return this.normalizeDiagnosticAutocorrectionDecision(decision);
  }

  private normalizeDiagnosticAutocorrectionDecision(
    decision: DiagnosticAutocorrectionDecision,
  ): DiagnosticAutocorrectionDecision {
    const legacyNextSteps = new Set(['plan_unblock_task', 'plan_doctor_recovery']);
    const nextStep = legacyNextSteps.has(decision.next_step as string)
      ? 'block_for_conversation'
      : decision.next_step;
    const legacyModes = new Set(['apply_in_unblock_task', 'apply_in_doctor_recovery']);
    const interfaceMode = legacyModes.has(decision.interface_response.mode as string)
      ? 'recovery_conversation'
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
        ],
      },
      systemic_blocker: null,
    };
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
          kind: 'advanced',
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
          kind: 'advanced',
          exitCode: 0,
          continueLoop: true,
          summary: `Correction implementation completed for ${correctionTaskId}.`,
        };
  }

  /**
   * By the time reviewTask() calls the reviewer, runQualityGates() has already run
   * deterministically and every result is guaranteed not 'failed' (see executeImplementation's
   * `passed` check) -- ground truth for `quality_gate_check` at this call site is always
   * `'passed'` (there were gates and none failed) or `'skipped'` (there were no gates at all),
   * with `failed_gates` always empty. The reviewer AI is handed that exact objective result as a
   * file to read and asked to relay it back in `quality_gate_check`, but nothing downstream ever
   * verified it did so correctly (see ADR-0039) -- an approval built on a misrelayed fact was
   * trusted outright.
   *
   * This does not re-judge the review; it only refuses to trust an `approved` status when the
   * reviewer's own relay of an already-known, verifiable fact contradicts that fact. Any
   * deviation is disqualifying (a real failure cannot reach this call site, so there is no
   * legitimately-different reading of the data to weigh) -- downgrade to `blocked` and reuse the
   * exact handling every other blocked review already gets, rather than inventing a new path.
   */
  private verifyReviewerQualityGateRelay(
    review: ReviewerOutput,
    qualityResults: readonly QualityGateResult[],
  ): ReviewerOutput {
    if (review.status !== 'approved') {
      return review;
    }

    // Ground truth here is always "nothing failed" -- there were gates and none failed, or there
    // were no gates at all. The reviewer contract (src/contracts/reviewer/output.md) documents
    // `skipped` as the status for gates explicitly waived by policy, not specifically for "no
    // gates were configured"; a reviewer reporting `passed` for zero applicable gates is an
    // equally reasonable, truthful reading and must not be treated as a misrelay.
    const acceptableStatuses: readonly ReviewerOutput['quality_gate_check']['status'][] =
      qualityResults.length === 0 ? ['passed', 'skipped'] : ['passed'];
    const relayIsTrustworthy = acceptableStatuses.includes(review.quality_gate_check.status)
      && review.quality_gate_check.failed_gates.length === 0;
    if (relayIsTrustworthy) {
      return review;
    }

    return {
      ...review,
      status: 'blocked',
      findings: [
        ...review.findings,
        {
          severity: 'blocker',
          message: `Reviewer approved, but its quality_gate_check (status: ${review.quality_gate_check.status}, failed_gates: ${review.quality_gate_check.failed_gates.join(', ') || 'none'}) does not match the actual quality-gate results computed for this task (expected one of: ${acceptableStatuses.join(', ')}, no failures). The approval is not trusted.`,
          path: null,
          related_acceptance_criterion: null,
        },
      ],
    };
  }

  private reviewTask(taskId: string): StepExecutionResult {
    const task = this.loadTask(taskId);
    const artifact = this.loadTaskArtifact(taskId);
    const stateCorrection = artifact?.state_correction ?? null;
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
      ...reviewContextPaths,
      ...implementationContextPaths,
      relativePath(this.repositoryRoot, task.path),
      relativePath(this.repositoryRoot, owner.definitionPath),
      ...(owner.architecturePath ? [relativePath(this.repositoryRoot, owner.architecturePath)] : []),
      relativePath(this.repositoryRoot, owner.statePath),
      relativePath(this.repositoryRoot, this.configurationPath),
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
      `- \`${relativePath(this.repositoryRoot, this.configurationPath)}\``,
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
      ...this.buildRecoveryLessonPromptLines(task.featureId, task.taskId),
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
      '- Return JSON only.',
      '- `summary` and every `findings[].message` are read directly by a human at the console when the task ends up blocked, not only by the next AI call -- keep each to one short, plain sentence; put any longer diagnostic detail in the correction task instead.',
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

    const rawReview = this.codex.runStructured<ReviewerOutput>(
      prompt,
      this.contracts.schema('reviewer_output'),
      [tempDir],
      `reviewer:subtask:${taskId}`,
    );
    const review = this.verifyReviewerQualityGateRelay(rawReview, qualityResults);
    this.artifacts.writeJson(join('reviews', `${taskId}.json`), review);
    const taskInterfaceAnalysis = this.shouldAnalyzeTaskInterface(review)
      ? this.analyzeTaskInterface(task, owner, review, implementation, qualityResults, tempDir, stateCorrection)
      : null;

    if (taskInterfaceAnalysis && review.status !== 'approved') {
      this.recordRecoveryLesson(task, review, implementation, qualityResults, taskInterfaceAnalysis, review.correction_task?.correction_task_id ?? null);
    }

    if (review.status === 'approved') {
    const updatedFeatureState = stateCorrection
        ? this.updateFeatureStateAfterStateCorrection(owner.statePath, task.taskId, stateCorrection)
        : this.updateFeatureStateAfterApprovedReview(owner.statePath, task);
      const updatedProjectState = stateCorrection
        ? this.updateProjectStateAfterStateCorrection(task.featureId, stateCorrection)
        : this.updateProjectStateAfterApprovedReview(task.featureId, task.taskId);
      writeText(owner.statePath, updatedFeatureState);
      writeText(this.projectStatePath, updatedProjectState);

      if (!stateCorrection) {
        this.completedPrimaryTaskAnchors.add(this.primaryTaskAnchor(task.taskId));
      }

      this.recordTaskTrail(task.taskId, 'review', 'approved');
      this.commitTaskArc(task.taskId, `proto: complete task ${task.taskId}`);

      return {
        kind: 'advanced',
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

      const rawCorrection = review.correction_task;
      const correctionScopeSanitization = sanitizeAllowedPaths(rawCorrection.scope.allowed_paths);
      this.logScopeSanitizationNotices(correctionScopeSanitization.notices);
      // A correction task IS by definition a correction/recovery of the task under review --
      // unlike that original task's own gates, a bare-HEAD `git diff --exit-code` here can only
      // ever pass by leaving the very thing this correction exists to undo untouched.
      validateQualityGateRefs(rawCorrection.quality_gates.before_review, 'correction task');
      const correction: CorrectionTask = {
        ...rawCorrection,
        scope: { ...rawCorrection.scope, allowed_paths: correctionScopeSanitization.allowedPaths },
      };
      this.assertTaskIdIsUnused(owner.tasksDirectory, correction.correction_task_id, 'Review correction-task authoring');
      const correctionPath = this.writeCorrectionTask(correction);
      this.artifacts.writeJson(join('tasks', `${correction.correction_task_id}.json`), {
        task: correctionTaskToTask(correction),
      });

      const updatedFeatureState = this.updateFeatureStateForCorrection(owner.statePath, task.taskId, correction.correction_task_id);
      const updatedProjectState = this.updateProjectStateForCorrection(task.featureId, correction.correction_task_id);
      writeText(owner.statePath, updatedFeatureState);
      writeText(this.projectStatePath, updatedProjectState);

      // Still a commit boundary, unlike the bookkeeping steps: the rejected implementer diff is
      // live in the worktree here, and carrying it into the correction task would put paths
      // outside that task's own declared scope in front of its review-time scope check.
      this.recordTaskTrail(task.taskId, 'review', `correction requested (${correction.correction_task_id})`);
      this.commitTaskArc(task.taskId, `proto: request correction ${correction.correction_task_id}`);
      console.log(`Review requested correction task ${correction.correction_task_id} at ${relativePath(this.repositoryRoot, correctionPath)}.`);
      return {
        kind: 'advanced',
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

      // Same reasoning as the changes_required branch above.
      this.recordTaskTrail(task.taskId, 'review', `blocked (${blocker.signature})`);
      this.commitTaskArc(task.taskId, `proto: record blocked review for ${task.taskId}`);

      if (this.options.loop) {
        const blockedSummary = recoverable
          ? `Recoverable blocker ${blocker.signature} recorded; diagnostic/autocorrection will continue.`
          : `Terminal blocker ${blocker.signature} recorded; diagnostic/autocorrection will stop the run with a bounded diagnostic.`;

        if (recoverable) {
          console.log(blockedSummary);
        } else {
          console.error(blockedSummary);
        }

        return {
          kind: 'advanced',
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
        kind: diagnosticResult.kind,
        exitCode: diagnosticResult.exitCode,
        continueLoop: diagnosticResult.continueLoop,
        summary: `${review.summary} ${blockedSummary} ${diagnosticResult.summary}${analysisSuffix}`,
      };
    }

    if (review.status === 'failed') {
      const blocker = this.recordFailedReview(task, review, implementation, qualityResults);
      const analysisSuffix = taskInterfaceAnalysis
        ? ' Task-interface analysis and a recovery lesson were recorded.'
        : '';

      // Same reasoning as the changes_required/blocked branches above.
      this.recordTaskTrail(task.taskId, 'review', `failed (${blocker.signature})`);
      this.commitTaskArc(task.taskId, `proto: record failed review for ${task.taskId}`);

      const failedSummary = `Review found the attempt invalid or unusable (blocker ${blocker.signature}); recorded review_failed instead of a silent stop.`;

      if (this.options.loop) {
        console.error(failedSummary);
        return {
          kind: 'advanced',
          exitCode: 0,
          continueLoop: true,
          summary: `${review.summary} ${failedSummary}${analysisSuffix}`,
        };
      }

      const diagnosticResult = this.diagnoseAndAutocorrect(task.featureId, failedSummary);
      return {
        kind: diagnosticResult.kind,
        exitCode: diagnosticResult.exitCode,
        continueLoop: diagnosticResult.continueLoop,
        summary: `${review.summary} ${failedSummary} ${diagnosticResult.summary}${analysisSuffix}`,
      };
    }

    console.error(review.summary);
    return {
      kind: 'failed',
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
        kind: 'blocked',
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

    this.recordTaskTrail(task.taskId, 'scope check', `out of scope; correction requested (${correction.correction_task_id})`);
    this.commitTaskArc(task.taskId, `proto: request correction ${correction.correction_task_id}`);

    console.log(`Deterministic scope check requested correction task ${correction.correction_task_id} at ${relativePath(this.repositoryRoot, correctionPath)}.`);
    return {
      kind: 'advanced',
      exitCode: 0,
      continueLoop: true,
      summary: `Deterministic scope check found out-of-scope paths (${outOfScopeList}) in the diff for ${task.taskId}; requested correction task ${correction.correction_task_id} without invoking the reviewer.`,
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
  ): TaskInterfaceAnalysis {
    const reviewPath = join(tempDir, 'review.json');
    writeFileSync(reviewPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
    const sourcePaths = [
      'src/contracts/task/task.md',
      ...(stateCorrection ? ['src/contracts/task/state-correction-task.md'] : []),
      'src/contracts/implementer/task-execution-prompt.md',
      'src/contracts/adapters/implementer-adapter.md',
      'src/contracts/reviewer/review-prompt.md',
      'src/contracts/reviewer/output.md',
      'src/contracts/runtime/task-interface-analysis.md',
      relativePath(this.repositoryRoot, task.path),
      relativePath(this.repositoryRoot, owner.definitionPath),
      ...(owner.architecturePath ? [relativePath(this.repositoryRoot, owner.architecturePath)] : []),
      relativePath(this.repositoryRoot, owner.statePath),
      relativePath(this.repositoryRoot, this.configurationPath),
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
      '- `src/contracts/implementer/task-execution-prompt.md`',
      '- `src/contracts/adapters/implementer-adapter.md`',
      '- `src/contracts/reviewer/review-prompt.md`',
      '- `src/contracts/reviewer/output.md`',
      '- `src/contracts/runtime/task-interface-analysis.md`',
      `- \`${relativePath(this.repositoryRoot, task.path)}\``,
      `- \`${relativePath(this.repositoryRoot, owner.definitionPath)}\``,
      ...(owner.architecturePath ? [`- \`${relativePath(this.repositoryRoot, owner.architecturePath)}\``] : []),
      `- \`${relativePath(this.repositoryRoot, owner.statePath)}\``,
      `- \`${relativePath(this.repositoryRoot, this.configurationPath)}\``,
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
   * The planning-time budget check (027-bounded-work-item-context).
   *
   * Inverts the shape of the old failure. `context_overflow` was discovered by an implementer call
   * that had already been paid for and had already half-written something; moving the check here
   * means an oversized task costs one planning call and is caught before any file is written.
   *
   * Returns `null` when the task fits, or a `blocked` outcome naming the overflow when it does not.
   * A feature whose smallest sensible task still does not fit is a specification problem, and
   * 026-conversational-doctor-recovery's specification-correction exit is where that belongs.
   */
  private checkPlannedTaskContextBudget(
    featureId: string,
    taskId: string,
    taskPath: string,
    likelyAffectedFiles: readonly string[],
    owner: { readonly featurePath: string; readonly statePath: string },
  ): StepExecutionResult | null {
    if (this.contextBudgetCharacters <= 0) {
      return null;
    }

    const manifest = buildManifest({
      repositoryRoot: this.repositoryRoot,
      taskId,
      role: 'implementer',
      entries: [
        manifestEntry('contract', 'src/contracts/implementer/task-execution-prompt.md', 'the implementer contract'),
        manifestEntry('task', relativePath(this.repositoryRoot, taskPath), 'the task under execution'),
        manifestEntry('specification', relativePath(this.repositoryRoot, owner.featurePath), 'what this work item is for'),
        manifestEntry('state', relativePath(this.repositoryRoot, owner.statePath), 'what previous tasks recorded'),
        ...likelyAffectedFiles.map((path) => manifestEntry('code', path, 'declared by the task as likely affected')),
      ],
      budget: this.contextBudgetCharacters,
    });

    if (manifestFitsBudget(manifest)) {
      return null;
    }

    const reason = `Planned task \`${taskId}\` declares a context of ${manifest.measuredSize} characters, over the configured budget of ${manifest.budget}. The task covers too much; plan a smaller one.`;
    this.recordBlockedFeature(featureId, reason, null, {
      kind: 'task_interface_gap',
      nextPlanningHint: `Plan \`${featureId}\`'s next task in smaller units: the last attempt needed ${manifest.measuredSize} characters of context against a budget of ${manifest.budget}.`,
    });
    this.commitDirtyWorktreeIfConfigured(`proto: record context budget overflow for feature ${featureId}`);
    return { kind: 'blocked', exitCode: 2, continueLoop: false, summary: reason };
  }

  /**
   * The declared context for one implementation attempt (027-bounded-work-item-context).
   *
   * Built from what the task already decided -- the planner knows what a task touches; declaring it
   * makes an existing decision explicit rather than adding a new one. Files an earlier attempt at
   * this same task read beyond its manifest are folded in, so a retry does not repeat the first
   * attempt's discovery. Never files another task's exploration: that would let one task's reading
   * silently inflate every later one.
   */
  private buildImplementerManifest(task: ParsedTaskDocument, stateCorrection: StateCorrectionTask | null): ContextManifest {
    const owner = this.resolveWorkItemContext(task.featureId);
    const baseEntries: ManifestEntry[] = [
      manifestEntry('contract', 'src/contracts/implementer/task-execution-prompt.md', 'the implementer contract'),
      ...(stateCorrection
        ? [manifestEntry('contract', 'src/contracts/task/state-correction-task.md', 'this is a state repair task')]
        : []),
      manifestEntry('task', relativePath(this.repositoryRoot, task.path), 'the task under execution'),
      manifestEntry('specification', relativePath(this.repositoryRoot, owner.definitionPath), 'what this work item is for'),
      manifestEntry('state', relativePath(this.repositoryRoot, owner.statePath), 'what previous tasks recorded for this one'),
      ...task.likelyAffectedFiles.map((path) => manifestEntry('code', path, 'declared by the task as likely affected')),
    ];

    const exploration = this.artifacts.readJson<ExplorationRecord>(join('exploration', `${task.taskId}.json`));

    return buildManifest({
      repositoryRoot: this.repositoryRoot,
      taskId: task.taskId,
      role: 'implementer',
      entries: mergeExploration(baseEntries, exploration),
      budget: this.contextBudgetCharacters,
    });
  }

  /**
   * Returns `null` on ordinary success (caller builds its own success StepExecutionResult).
   * Returns a `StepExecutionResult` directly for every terminal outcome that needs its own
   * distinct handling: implementation failure (diagnosis continues), or a confirmed
   * unrelated/pre-existing quality-gate failure (blocked on a newly filed or reused fix instead).
   */
  private executeImplementation(task: ParsedTaskDocument, correction: boolean, stateCorrection: StateCorrectionTask | null): StepExecutionResult | null {
    const recoveryLessonLines = this.buildRecoveryLessonPromptLines(task.featureId, task.taskId);
    const manifest = this.buildImplementerManifest(task, stateCorrection);
    const prompt = buildImplementerPrompt(task, correction, stateCorrection, recoveryLessonLines, manifest);
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
      this.recordTaskTrail(
        task.taskId,
        correction ? 'corrected' : 'implemented',
        `${this.options.implementer} failed (${finalAttempt.diagnostics.classification})`,
      );
      writeText(owner.statePath, this.updateFeatureStateAfterImplementationFailure(owner.statePath, task.taskId, failureReason));
      writeText(this.projectStatePath, this.updateProjectStateAfterImplementationFailure(task.featureId, task.taskId, failureReason));
      this.writeRefinementFeedback(failureReason, {
        kind: correction ? 'correct_task' : 'implement_subtask',
        feature_id: task.featureId,
        task_id: task.taskId,
        correction_task_id: correction ? task.taskId : null,
        reason: failureReason,
      });
      console.error(`Implementation for ${task.taskId} failed; the next step will diagnose it.`);
      return {
        kind: 'advanced',
        exitCode: 0,
        continueLoop: true,
        summary: correction
          ? `Correction implementation for ${task.taskId} failed; diagnosis will continue.`
          : `Implementation for ${task.taskId} failed; diagnosis will continue.`,
      };
    }

    this.recordTaskTrail(
      task.taskId,
      correction ? 'corrected' : 'implemented',
      `${this.options.implementer}, ${finalAttempt.changed_files.length} file(s) changed${retriedAfterPartialChanges ? ', after one retry' : ''}`,
    );

    const qualityResults = this.runQualityGates(task);
    this.throwIfControlledStopRequested();
    this.artifacts.writeJson(join('quality-gates', `${task.taskId}.json`), qualityResults);
    this.recordTaskTrail(
      task.taskId,
      'quality gates',
      qualityResults.length === 0
        ? 'none configured'
        : qualityResults.map((result) => `${result.name} ${result.status}`).join(', '),
    );

    if (qualityResults.some((result) => result.status === 'waived')) {
      return this.blockOnUnrelatedFixFailure(owner, task, qualityResults);
    }

    const passed = qualityResults.every((result) => result.status !== 'failed');
    let featureState = this.updateFeatureStateAfterImplementation(
      owner.statePath,
      task.taskId,
      passed ? 'review_pending' : 'quality_failed',
      passed ? 'passed' : 'failed',
      qualityResults,
    );
    let projectState = this.updateProjectStateAfterImplementation(task.featureId, task.taskId, passed);
    if (passed) {
      // Reaching review_pending is the point that proves accumulated Recovery History narration
      // is no longer live troubleshooting context (see ADR-0037) -- compact both documents' own
      // sections here, the only deterministic write site this transition has.
      featureState = compactRecoveryHistorySection(featureState);
      projectState = compactRecoveryHistorySection(projectState);
    }
    writeText(owner.statePath, featureState);
    writeText(this.projectStatePath, projectState);

    if (!passed) {
      const failureReason = this.buildQualityFailureReason(task.taskId, qualityResults);
      this.writeRefinementFeedback(failureReason, {
        kind: correction ? 'correct_task' : 'implement_subtask',
        feature_id: task.featureId,
        task_id: task.taskId,
        correction_task_id: correction ? task.taskId : null,
        reason: failureReason,
      });
      console.error(`Quality gates failed after implementing ${task.taskId}; the next step will diagnose it.`);
      return {
        kind: 'advanced',
        exitCode: 0,
        continueLoop: true,
        summary: correction
          ? `Correction implementation for ${task.taskId} failed; diagnosis will continue.`
          : `Implementation for ${task.taskId} failed; diagnosis will continue.`,
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
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });

    if (result.signal === 'SIGINT' || result.signal === 'SIGTERM') {
      throw new ControlledStopError(
        `Controlled stop requested while running quality gate ${command}.`,
        stopExitCodeForSignal(result.signal),
        result.signal,
      );
    }

    // Some tools (observed: vitest's default reporter on this platform) ignore NO_COLOR/
    // FORCE_COLOR and still emit ANSI escape codes when their own TTY-detection heuristic decides
    // to. Left unstripped, those raw control codes get captured verbatim by summarizeCommandOutput
    // and persisted into a feature's state.md as "evidence" -- unreadable garbage in a plain-text
    // markdown file, found live while trying to read a real blocked feature's full detail.
    return { status: result.status, stdout: stripAnsiCodes(result.stdout), stderr: stripAnsiCodes(result.stderr) };
  }

  private runQualityGates(task: ParsedTaskDocument): QualityGateResult[] {
    const commands = [...task.qualityGates, ...this.coreRuntimeSmokeGateCommands()];
    return commands.map((command) => {
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
   * Standard gate injected deterministically -- never something the task itself declares --
   * whenever the diff touches core runtime code (src/orchestrator/, src/cli/, src/task/). vitest
   * tolerates CommonJS-style `require()` inside an ESM module through its own CJS interop; a
   * real ESM loader does not (see scripts/runtimeSmokeTest.mjs, which imports src/cli/main.ts --
   * and therefore its whole transitive module graph -- under tsx's real loader). That gap let a
   * `require('node:fs')` regression pass every vitest-based gate this session and crash
   * correctState() under the real CLI; this closes it without relying on any task author (LLM or
   * human) to remember to ask for it.
   *
   * Invoked through `npx`, not a direct `node_modules/.bin/tsx` path: runShellCommand() runs this
   * with `shell: true`, which on Windows means cmd.exe -- and cmd.exe (unlike a POSIX shell) will
   * not execute an extension-less relative path directly, so the bin shim path only ever worked
   * on POSIX. `npx` resolves the locally-installed `tsx` through the same platform-specific shim
   * (`tsx.cmd` on Windows, the plain script elsewhere) that PATH-based lookup already relies on
   * everywhere else in this codebase, so this gate now runs identically on both platforms. This
   * blocked every task touching core runtime code on Windows until caught by hand while
   * dogfooding via `npm run dev`.
   */
  private coreRuntimeSmokeGateCommands(): readonly string[] {
    const coreRuntimePrefixes = ['src/orchestrator/', 'src/cli/', 'src/task/'];
    const changedFiles = this.git.diffNameOnly();
    const touchesCoreRuntime = changedFiles.some((path) => isPathAllowedByPrefix(path, coreRuntimePrefixes));
    return touchesCoreRuntime ? ['npx tsx scripts/runtimeSmokeTest.mjs src/cli/main.ts'] : [];
  }

  /**
   * Reclassifies a failing quality-gate command as `waived` when the failure is confirmed to be
   * unrelated to this task: none of the paths its output references fall within this task's own
   * `allowedPaths` or its actual changed files, AND the same command still fails against a clean
   * checkout of `HEAD` (i.e. it already failed before this task's diff existed). This is what
   * stops a narrowly-scoped correction task from being rejected by an unrelated,
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
      referenced_paths: referencedPaths,
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

    // Read the structured field the waiver already computed rather than re-parsing
    // output_summary: that message also quotes the task's own allowed_paths/changed files (for
    // human context) before the actually-referenced paths, so re-extracting from it picks up the
    // task's own files first and misattributes the failure to them. The output_summary fallback
    // only matters for a waived result that didn't come through tryWaiveUnrelatedGateFailure().
    const referencedPaths = waived.referenced_paths ?? extractReferencedPaths(waived.output_summary);
    const primaryPath = referencedPaths[0] ?? 'the system';
    const fixId = this.fileOrReuseBlockingFix({
      signature: this.computeGateFailureSignature(waived.command, referencedPaths),
      titleSubject: `Pre-existing failure in \`${primaryPath}\``,
      severity: 'high',
      whatHappened:
        `While executing an unrelated task, the quality-gate command \`${waived.command}\` failed. The `
        + 'failure was confirmed to be pre-existing and unrelated to that task: none of the paths '
        + "its output referenced fell within the task's own allowed scope or changed files, and "
        + 'the same command still fails the same way on a clean checkout of the repository (i.e. '
        + "before that task's own diff existed).",
      evidenceLines: [
        `- Command: \`${waived.command}\``,
        `- Referenced path(s): ${referencedPaths.length > 0 ? referencedPaths.map((path) => `\`${path}\``).join(', ') : 'none extracted'}`,
        '- Reproduces against a clean checkout of HEAD (confirmed via a stash/rerun/restore baseline check).',
      ],
      outlineStep: `Diagnosing and repairing the root cause of \`${waived.command}\` failing.`,
      scopeExcludes: 'Any work belonging to the task that first surfaced this failure; that task is unrelated and unblocks automatically once this fix reaches `completed`.',
      problem:
        `\`${waived.command}\` fails on a clean checkout of the repository, unrelated to any task currently in progress. `
        + `Referenced path(s): ${referencedPaths.length > 0 ? referencedPaths.map((path) => `\`${path}\``).join(', ') : 'none extracted'}.`,
      acceptanceCriterion: `\`${waived.command}\` passes on a clean checkout of the repository.`,
      completionCriterion: `\`${waived.command}\` passes cleanly, and every feature/fix blocked on this fix id can resume.`,
      currentReality: `\`${waived.command}\` fails on a clean checkout of the repository, confirmed unrelated to any single task.`,
      nextPlanningHint: `diagnose and repair \`${waived.command}\`.`,
    });
    const reason =
      `Task ${task.taskId} hit a quality-gate failure (\`${waived.command}\`) confirmed unrelated to and preexisting `
      + `its own scope; filed/reused fix \`${fixId}\` and stopped instead of continuing to review or generating a `
      + 'correction for it.';

    this.recordBlockedFeature(task.featureId, reason, task.taskId);
    this.setBlockedOnFix(owner, fixId);
    // This task's own attempt is abandoned for good (nothing will ever
    // plan a follow-up task scoped to its allowed_paths), so its dirty diff -- already archived
    // under .git/proto-compassrose/diffs/ by the quality-gate run that led here -- must be
    // discarded now. Left in the tree, it would permanently fail every future run's
    // require_clean_worktree_before_task preflight (findDisallowedDirtyPaths in this class),
    // since the next deterministic decision is always a fresh plan_fix_task for the newly filed
    // fix, which requires a fully clean tree. See reconcileDirtyPathsForNewScope's own docs.
    this.reconcileDirtyPathsForNewScope(task.featureId, task.taskId, []);

    // The explicit path list this used was correct while planning committed for itself: the only
    // uncommitted things left here were the two state documents and the new fix. The task document
    // is now uncommitted too, and it is under neither -- left behind it would be a dangling dirty
    // path failing the clean-worktree precondition of the fix task planned next. Sweeping is safe
    // precisely because reconcileDirtyPathsForNewScope just discarded the abandoned diff.
    this.recordTaskTrail(task.taskId, 'quality gates', `pre-existing failure outside this task; filed/reused fix ${fixId}`);
    this.commitTaskArc(task.taskId, `proto: file blocking fix ${fixId} for ${task.taskId}`);

    return {
      kind: 'blocked',
      exitCode: 2,
      continueLoop: false,
      summary: reason,
    };
  }

  /**
   * Deterministically scaffolds a new fix (request.md + fix.md + state.md, no LLM call -- the
   * caller already knows precisely what happened) describing a confirmed blocking defect, or
   * returns the id of an existing fix already filed for the same signature so repeated hits of
   * the same defect never spawn duplicates. Left in `task_planning_pending` with no tasks/ yet:
   * diagnosing and actually fixing an arbitrary defect needs real reasoning, so the normal
   * fix-task planning flow takes it from here. Shared by the quality-gate waiver path
   * (blockOnUnrelatedFixFailure, severity 'high', a *proven* pre-existing/unrelated defect) and
   * the doctor's systemic-blocker path (severity 'critical', an *unproven, ambiguous* defect --
   * see readFixSeverityAndOwnership's fail-safe-upward rationale).
   */
  private fileOrReuseBlockingFix(scaffold: {
    readonly signature: string;
    readonly titleSubject: string;
    readonly severity: FixSeverity;
    readonly whatHappened: string;
    readonly evidenceLines: readonly string[];
    readonly outlineStep: string;
    readonly scopeExcludes: string;
    readonly problem: string;
    readonly acceptanceCriterion: string;
    readonly completionCriterion: string;
    readonly currentReality: string;
    readonly nextPlanningHint: string;
  }): string {
    const { signature } = scaffold;
    const existing = this.findExistingFixForSignature(signature);
    if (existing) {
      return existing;
    }

    const fixId = this.nextFixId(slugify(scaffold.titleSubject));
    const fixDirectory = join(this.fixesRoot, fixId);

    const requestMarkdown = [
      `# Request: ${scaffold.titleSubject}`,
      '',
      `Signature: \`${signature}\``,
      '',
      '## What happened',
      '',
      scaffold.whatHappened,
      '',
      '## Evidence',
      '',
      ...scaffold.evidenceLines,
      '',
      '## Scope',
      '',
      'This fix includes:',
      '',
      `- ${scaffold.outlineStep}`,
      '',
      'This fix does not include:',
      '',
      `- ${scaffold.scopeExcludes}`,
    ].join('\n');

    const fixMarkdown = [
      `# Fix: ${scaffold.titleSubject}`,
      '',
      '## Status',
      '',
      'Planned',
      '',
      '## Severity',
      '',
      scaffold.severity,
      '',
      '## Owning Feature',
      '',
      'none',
      '',
      '## Purpose',
      '',
      `Repair the blocking defect: ${scaffold.titleSubject}.`,
      '',
      '## Problem',
      '',
      scaffold.problem,
      '',
      '## Scope',
      '',
      'This fix includes:',
      '',
      `- ${scaffold.outlineStep}`,
      '',
      'This fix does not include:',
      '',
      `- ${scaffold.scopeExcludes}`,
      '',
      '## Acceptance Criteria',
      '',
      `- ${scaffold.acceptanceCriterion}`,
      '',
      '## Implementation Deliverables',
      '',
      '- A code or configuration change that repairs the root cause.',
      '',
      '## Completion Criteria',
      '',
      'This fix is considered resolved when:',
      '',
      `- ${scaffold.completionCriterion}`,
      '',
      '## Implementation Outline',
      '',
      `1. ${scaffold.outlineStep}`,
      '',
      '## Related Documents',
      '',
      '- `state.md`',
    ].join('\n');

    const stateMarkdown = [
      `# State: ${scaffold.titleSubject}`,
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
      `- severity: ${scaffold.severity}`,
      '- owning_feature: none',
      '- last_implementation_result: not_run',
      '- last_quality_gate_result: unknown',
      '- last_review_result: not_run',
      '',
      '## Current Reality',
      '',
      scaffold.currentReality,
      '',
      '## Implemented Deliverables',
      '',
      '- None yet.',
      '',
      '## Remaining Deliverables',
      '',
      `- ${scaffold.outlineStep}`,
      '',
      '## Outline Progress',
      '',
      `- ${scaffold.outlineStep}: not started`,
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
      `Plan the first task for fix \`${fixId}\`: ${scaffold.nextPlanningHint}`,
    ].join('\n');

    writeText(join(fixDirectory, 'request.md'), requestMarkdown);
    writeText(join(fixDirectory, 'fix.md'), fixMarkdown);
    writeText(join(fixDirectory, 'state.md'), stateMarkdown);

    return fixId;
  }

  private setBlockedOnFix(owner: Pick<WorkItemContext, 'statePath'>, fixId: string): void {
    writeText(owner.statePath, replaceOperationalStatus(readUtf8(owner.statePath), { blocked_on_fix: fixId }));
  }

  /**
   * Marks that automatic recovery has been proven exhausted for this specific blocker (set only
   * by recordExhaustedRecoveryAsBlocked) -- deliberately NOT derived from `recoverability` alone,
   * because a freshly-classified 'human'/'terminal' blocker (e.g. an ensemble disagreement, or a
   * review-time classification) still needs its first pass through diagnose_autocorrect, which
   * is exactly where consultDoctorOnSystemicBlocker decides whether to file a systemic fix
   * (blocked_on_fix, already excluded and self-resolving) -- excluding it before that pass ever
   * runs would silently break that existing, working path (see tests/protoBlockerFlows.test.ts's
   * 'terminal-review-blocked' scenario). This marker is only ever true for a blocker that has
   * ALREADY been through that machinery and come back exhausted.
   */
  private requiresHumanAcknowledgment(statePath: string): boolean {
    try {
      const markdown = readUtf8(statePath);
      const operationalStatus = requireSection(markdown, 'Operational Status');
      return stripTicks(parsePreferredStatusValue(operationalStatus, 'human_ack_required') ?? 'none') === 'true';
    } catch {
      return false;
    }
  }

  private setRequiresHumanAcknowledgment(statePath: string, value: boolean): void {
    writeText(statePath, replaceOperationalStatus(readUtf8(statePath), { human_ack_required: value ? 'true' : 'none' }));
  }

  private computeGateFailureSignature(command: string, referencedPaths: readonly string[]): string {
    return createHash('sha1').update(`${command}::${referencedPaths[0] ?? ''}`).digest('hex').slice(0, 12);
  }

  private computeSystemicBlockerSignature(featureId: string, systemicBlocker: SystemicBlockerRequest): string {
    return createHash('sha1').update(`systemic::${featureId}::${systemicBlocker.title}`).digest('hex').slice(0, 12);
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
      blocked_on_fix: 'none',
    });
    markdown = replaceSection(markdown, 'Blocked By', '- None');
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
    ].join('\n'));
    markdown = replaceSection(markdown, 'Last Approved Change', `Fix \`${fixId}\` reached completed; resumed automatically.`);
    markdown = replaceSection(markdown, 'Next Planning Hint', restorationTargetNextPlanningHint(restorationTarget, restorationTarget.active_task));
    return markdown;
  }

  private updateProjectStateAfterFixResolved(ownerId: string, fixId: string, restorationTarget: RestorationTarget): string {
    let markdown = readUtf8(this.projectStatePath);
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${ownerId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList(restorationTargetProjectPendingLines(restorationTarget, restorationTarget.active_task)));
    markdown = replaceSection(markdown, 'Last Approved Change', `Fix \`${fixId}\` reached completed; \`${ownerId}\` resumed automatically.`);
    markdown = replaceSection(markdown, 'Next Planning Hint', restorationTargetNextPlanningHint(restorationTarget, restorationTarget.active_task));
    markdown = upsertBulletInSection(
      markdown,
      'Current Reality',
      `- \`${ownerId}\` resumed after a blocking fix`,
      `- \`${ownerId}\` resumed after fix \`${fixId}\` reached completed; the active task pointer was restored to \`${restorationTarget.active_task}\`.`,
    );
    return markdown;
  }

  /**
   * "npm run acknowledge-blocker" (ADR-0007): the ONLY method allowed to clear a
   * `blocked_on_human` exclusion, called exclusively from that CLI's own explicit "listo"
   * branch, never from AI-response handling. No AI call, no re-diagnosis of whether the
   * underlying issue is actually fixed -- the human's explicit action is the sole authority here,
   * exactly like confirmFeatureValidation() is the sole authority to flip `validation: confirmed`.
   * Mirrors resumeWorkItemBlockedOnFix()'s restoration shape (same RestorationTarget-driven
   * write), minus the `blocked_on_fix` field, which is irrelevant to this path.
   */
  /**
   * The diagnosis that opens a recovery conversation (026-conversational-doctor-recovery).
   *
   * Generated once, when a human first sits down with a blocked item, and stored. Resuming reloads
   * it rather than re-deriving it: a second call would spend another AI call to produce a
   * *different* set of hypotheses, and the human would find themselves answering a different
   * question than the one they left.
   *
   * A new diagnosis is generated only when the item's blocker signature has changed -- i.e. it is
   * blocked on something else now, so the old hypotheses are about a problem that no longer exists.
   */
  diagnoseBlockage(id: string): RecoveryDiagnosis {
    const owner = this.resolveWorkItemContext(id);
    const snapshot = this.tryReadFeatureStateSnapshot(owner);
    if (!snapshot) {
      throw new Error(`Cannot diagnose ${id}: its state document is missing or unreadable.`);
    }

    const blocker = this.readRecordedBlockerProfile(snapshot);
    if (!blocker) {
      throw new Error(`Cannot diagnose ${id}: no blocker is recorded in its Blocked By section.`);
    }

    const artifactPath = join('recovery-diagnoses', `${id}.json`);
    const stored = this.artifacts.readJson<StoredRecoveryDiagnosis>(artifactPath);
    if (stored && stored.blocker_signature === blocker.signature) {
      return stored.diagnosis;
    }

    const diagnosis = this.generateRecoveryDiagnosis(id, owner, blocker);
    this.artifacts.writeJson(artifactPath, {
      diagnosis,
      generated_at: new Date().toISOString(),
      blocker_signature: blocker.signature,
    } satisfies StoredRecoveryDiagnosis);

    return diagnosis;
  }

  private generateRecoveryDiagnosis(
    id: string,
    owner: WorkItemContext,
    blocker: BlockerProfile,
  ): RecoveryDiagnosis {
    const sourcePaths = [
      relativePath(this.repositoryRoot, owner.statePath).split('\\').join('/'),
      relativePath(this.repositoryRoot, owner.definitionPath).split('\\').join('/'),
      relativePath(this.repositoryRoot, this.projectStatePath).split('\\').join('/'),
    ];

    const label = `recovery-diagnosis:${id}`;
    const prompt = [
      'Act as the CompassRose Recovery Diagnostician.',
      '',
      `Work item \`${id}\` is blocked and a human is about to sit down with you to unblock it.`,
      'Your job is to bring them what you can read, and to ask them only for what you cannot.',
      '',
      'Read:',
      ...sourcePaths.map((path) => `- \`${path}\``),
      '- the source and test files those documents name',
      '',
      'Recorded blocker:',
      `- kind: ${blocker.kind}`,
      `- recoverability: ${blocker.recoverability}`,
      `- signature: ${blocker.signature}`,
      ...blocker.evidence.map((item) => `- evidence: ${item}`),
      '',
      'Rules:',
      '- Give two or three possible root causes, ordered by likelihood, most likely first.',
      '- `evidence` must be facts you actually read in the repository. Never speculation, and never something only the human could know.',
      '- `discriminating_question` must be something the human knows and the repository does not say. Never ask what you could have read -- that is the whole point of the division of labor.',
      '- `suggested_exit` orders how the exits are offered. It never selects one; only the human does.',
      '- Do not modify files.',
      '',
      'Return JSON only, matching the recovery-diagnosis schema.',
    ].join('\n');

    this.recordAgentInvocationContext(this.buildAgentInvocationContext({
      role: 'reviewer',
      kind: 'recovery_diagnosis',
      label,
      feature_id: id,
      task_id: null,
      source_paths: sourcePaths,
      prompt,
      tool: {
        name: 'codex',
        command: this.codexCommand,
        model: resolveCodexPlannerModel(),
        output_schema_id: 'recovery_diagnosis',
      },
    }));

    return this.codex.runStructured<RecoveryDiagnosis>(
      prompt,
      this.contracts.schema('recovery_diagnosis'),
      sourcePaths,
      label,
    );
  }

  /**
   * The `retry` exit: what the human said in the conversation becomes bounded context for a fresh
   * attempt at the failed step.
   *
   * The item is restored to its recorded pre-block state and the human's account is written into
   * `Current Reality` as a fact -- which is how it reaches the next attempt, since that document is
   * part of every subsequent prompt. Nothing is carried in memory: if it is not written, it does not
   * exist.
   */
  retryWithContext(id: string, humanContext: string): void {
    const owner = this.resolveWorkItemContext(id);
    const snapshot = this.tryReadFeatureStateSnapshot(owner);
    if (!snapshot) {
      throw new Error(`Cannot retry ${id}: its state document is missing or unreadable.`);
    }

    const restorationTarget = this.preferredRestorationTarget(snapshot);
    let markdown = this.updateFeatureStateAfterHumanAcknowledged(owner.statePath, restorationTarget);
    markdown = upsertParagraphInSection(
      markdown,
      'Current Reality',
      'Recovery conversation',
      `Recovery conversation (${new Date().toISOString().slice(0, 10)}): ${humanContext}`,
    );
    writeText(owner.statePath, markdown);
    writeText(this.projectStatePath, this.updateProjectStateAfterHumanAcknowledged(id, restorationTarget));
    this.artifacts.writeJson(join('recovery-diagnoses', `${id}.json`), null);

    if (this.options.commit) {
      this.git.commit(
        [
          relativePath(this.repositoryRoot, owner.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
        ],
        `proto: retry ${id} with context from a recovery conversation`,
      );
    }
  }

  /**
   * The `correct_specification` exit: the blockage revealed a wrong or incomplete specification.
   *
   * The only exit that destroys planned work, and therefore the only one the CLI gates behind an
   * explicit confirmation. Nothing is deleted from git -- the history of what was tried is the one
   * artifact worth keeping -- and what was invalidated is recorded with the human's reason, never
   * silently dropped.
   *
   * Also the exit that closes the circuit between the two flows. Without it, specification feeds
   * execution one way and a wrong specification is a permanent dead end, which is exactly what
   * happened to 003-doctor-command.
   */
  invalidatedWorkFor(id: string): readonly string[] {
    const owner = this.resolveWorkItemContext(id);
    const taskRequests = this.artifacts.readJson<TaskRequest[]>(join('task-requests', `${id}.json`)) ?? [];
    const snapshot = this.tryReadFeatureStateSnapshot(owner);

    return [
      ...taskRequests
        .filter((request) => request.status !== 'complete')
        .map((request) => `task request ${request.id}: ${request.title}`),
      ...(snapshot && snapshot.activeTask !== 'none' ? [`active task ${snapshot.activeTask}`] : []),
      ...(snapshot && snapshot.activeCorrectionTask !== 'none' ? [`correction task ${snapshot.activeCorrectionTask}`] : []),
    ];
  }

  correctSpecification(id: string, reason: string): void {
    const owner = this.resolveWorkItemContext(id);
    const invalidated = this.invalidatedWorkFor(id);

    let markdown = readUtf8(owner.statePath);
    markdown = replaceSection(markdown, 'Lifecycle State', 'formalization_pending');
    markdown = replaceOperationalStatus(markdown, {
      active_task: 'none',
      active_correction_task: 'none',
      validation: 'not_started',
      human_ack_required: 'none',
    });
    markdown = replaceSection(markdown, 'Blocked By', '- None');
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
    ].join('\n'));
    markdown = upsertParagraphInSection(
      markdown,
      'Current Reality',
      'Specification invalidated',
      [
        `Specification invalidated (${new Date().toISOString().slice(0, 10)}): ${reason}`,
        '',
        ...(invalidated.length > 0
          ? ['Superseded by that correction:', ...invalidated.map((item) => `- ${item}`)]
          : ['No planned work was outstanding at the time.']),
      ].join('\n'),
    );
    markdown = replaceSection(
      markdown,
      'Next Planning Hint',
      `Specify \`${id}\` again with a human; its previous specification was invalidated and it cannot be planned until the corrected one is validated.`,
    );
    writeText(owner.statePath, markdown);

    // Every remaining task request goes with the specification that declared it.
    const taskRequests = this.artifacts.readJson<TaskRequest[]>(join('task-requests', `${id}.json`));
    if (taskRequests) {
      this.artifacts.writeJson(
        join('task-requests', `${id}.json`),
        taskRequests.map((request) => (request.status === 'complete' ? request : { ...request, status: 'superseded' })),
      );
    }

    this.artifacts.writeJson(join('recovery-diagnoses', `${id}.json`), null);
    this.commitDirtyWorktreeIfConfigured(`proto: invalidate the specification for ${id} after a recovery conversation`);
  }

  acknowledgeBlocker(id: string): void {
    const owner = this.resolveWorkItemContext(id);
    const feature = this.tryLoadFeature(id);
    const inspection = feature ? this.inspectFeature(feature) : this.inspectFix(this.loadFix(id));

    if (inspection.kind !== 'blocked_on_human') {
      throw new Error(`Cannot acknowledge ${id}: it is not currently blocked_on_human (inspected kind: ${inspection.kind}).`);
    }

    const snapshot = inspection.snapshot!;
    const restorationTarget = this.preferredRestorationTarget(snapshot);
    writeText(owner.statePath, this.updateFeatureStateAfterHumanAcknowledged(owner.statePath, restorationTarget));
    writeText(this.projectStatePath, this.updateProjectStateAfterHumanAcknowledged(id, restorationTarget));

    if (this.options.commit) {
      this.git.commit(
        [
          relativePath(this.repositoryRoot, owner.statePath),
          relativePath(this.repositoryRoot, this.projectStatePath),
        ],
        `proto: acknowledge human blocker for ${id}`,
      );
    }
  }

  private updateFeatureStateAfterHumanAcknowledged(featureStatePath: string, restorationTarget: RestorationTarget): string {
    let markdown = readUtf8(featureStatePath);
    markdown = replaceSection(markdown, 'Lifecycle State', restorationTarget.lifecycle_state);
    markdown = replaceOperationalStatus(markdown, {
      active_task: restorationTarget.active_task,
      active_correction_task: restorationTarget.active_correction_task,
      human_ack_required: 'none',
    });
    markdown = replaceSection(markdown, 'Blocked By', '- None');
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
    ].join('\n'));
    markdown = replaceSection(markdown, 'Last Approved Change', 'Blocker acknowledged by a human; resumed automatically.');
    markdown = replaceSection(markdown, 'Next Planning Hint', restorationTargetNextPlanningHint(restorationTarget, restorationTarget.active_task));
    return markdown;
  }

  private updateProjectStateAfterHumanAcknowledged(ownerId: string, restorationTarget: RestorationTarget): string {
    let markdown = readUtf8(this.projectStatePath);
    markdown = setOrInsertSection(markdown, 'Active Feature', `\`${ownerId}\``);
    markdown = replaceSection(markdown, 'Pending', bulletList(restorationTargetProjectPendingLines(restorationTarget, restorationTarget.active_task)));
    markdown = replaceSection(markdown, 'Last Approved Change', `Blocker acknowledged by a human; \`${ownerId}\` resumed automatically.`);
    markdown = replaceSection(markdown, 'Next Planning Hint', restorationTargetNextPlanningHint(restorationTarget, restorationTarget.active_task));
    markdown = upsertBulletInSection(
      markdown,
      'Current Reality',
      `- \`${ownerId}\` resumed after a human-acknowledged blocker`,
      `- \`${ownerId}\` resumed after a human acknowledged its blocker; the active task pointer was restored to \`${restorationTarget.active_task}\`.`,
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

  private logScopeSanitizationNotices(notices: readonly string[]): void {
    for (const notice of notices) {
      console.warn(`[task-content-validation] ${notice}`);
    }
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

    // Enforce the configured correction depth limit before allocating a new correction ID.
    // At the limit, refuse to create any correction artifact or mutate state.
    // Use the same restoredActiveTask anchor that buildStateCorrectionTask receives.
    const correctionId = this.buildStateCorrectionTaskId(owner.tasksDirectory, restoredActiveTask);
    if (correctionId === null) {
      throw new StateCorrectionLimitReachedError(
        `Correction iteration limit reached for feature ${featureId} after ${this.maxReviewIterations} correction(s) for anchor ${restoredActiveTask}; refusing to create another near-duplicate state-correction task.`,
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
          relativePath(this.repositoryRoot, this.projectStatePath),
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
          this.featureRelativePath(feature.id, 'feature.md'),
          this.featureRelativePath(feature.id, 'architecture.md'),
          relativePath(this.repositoryRoot, this.configurationPath),
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
        }
      : null;

    return {
      lifecycleState: stripTicks(requireSection(markdown, 'Lifecycle State').trim()),
      activeTask: stripTicks(parsePreferredStatusValue(operationalStatus, 'active_task') ?? 'none'),
      activeCorrectionTask: stripTicks(parsePreferredStatusValue(operationalStatus, 'active_correction_task') ?? 'none'),
      blockedBy: parseBulletSection(blockedBySection) ?? [],
      blockedFrom,
      // 'confirmed' when absent (NOT 'not_started'): this field is only genuinely absent from a
      // state.md formalized before ADR-0046/Flow 1 existed -- grandfathered in, never
      // retroactively blocked, matching ADR-0040/41's precedent. A freshly-formalized
      // feature/fix always has this key explicitly written by planFeature()/planFixRequest().
      validationStatus: stripTicks(parsePreferredStatusValue(operationalStatus, 'validation') ?? 'confirmed'),
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

  /**
   * When the caller already knows the blocker's kind (e.g. a sibling-feature scope conflict or
   * an exhausted task-request list -- both deterministic facts the call site established itself,
   * not something to guess), pass explicitKind so it is recorded as-is instead of being
   * reconstructed by regex-matching `reason` text. See fix 001-blocked-feature-scope-misclassification
   * and ADR-0031: classifyBlockerKind remains the fallback for callers that genuinely don't know
   * the cause up front.
   */
  private buildBlockerProfile(snapshot: FeatureStateSnapshot, reason: string, explicitKind?: BlockerKind): BlockerProfile {
    const blockerKind = explicitKind
      ? finalizeBlockerProfile(explicitKind, reason, snapshot.blockedBy, snapshot.lifecycleState)
      : classifyBlockerKind(reason, snapshot.blockedBy, snapshot.lifecycleState);
    return {
      kind: blockerKind.kind,
      signature: blockerKind.signature,
      evidence: blockerKind.evidence,
      recoverability: blockerKind.recoverability,
      observed_state: `lifecycle=${snapshot.lifecycleState}; active_task=${snapshot.activeTask}; active_correction_task=${snapshot.activeCorrectionTask}`,
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

  private recordBlockedFeature(
    featureId: string,
    reason: string,
    taskId: string | null = null,
    explicitBlocker?: { readonly kind: BlockerKind; readonly nextPlanningHint: string },
  ): BlockerProfile {
    const owner = this.resolveWorkItemContext(featureId);
    const snapshot = this.readFeatureStateSnapshot(owner);
    const blocker = this.buildBlockerProfile(snapshot, reason, explicitBlocker?.kind);
    const restorationTarget = this.preferredRestorationTarget(snapshot);
    this.persistBlockedFeature(
      featureId,
      taskId ?? (snapshot.activeTask === 'none' ? null : snapshot.activeTask),
      reason,
      blocker,
      restorationTarget,
      owner,
      'blocked',
      explicitBlocker?.nextPlanningHint,
    );
    return blocker;
  }

  /**
   * Persists a blocker whose kind/recoverability/evidence are already fully known (e.g. carried
   * forward from an existing DoctorRecoveryTaskMetadata.blocker) instead of re-deriving one from
   * `reason` text via classifyBlockerKind/finalizeBlockerProfile.
   */
  private persistBlockedFeatureWithKnownBlocker(
    owner: WorkItemContext,
    featureId: string,
    taskId: string | null,
    reason: string,
    blocker: BlockerProfile,
    explicitNextPlanningHint?: string,
  ): void {
    const snapshot = this.readFeatureStateSnapshot(owner);
    const restorationTarget = this.preferredRestorationTarget(snapshot);
    this.persistBlockedFeature(
      featureId,
      taskId ?? (snapshot.activeTask === 'none' ? null : snapshot.activeTask),
      reason,
      blocker,
      restorationTarget,
      owner,
      'blocked',
      explicitNextPlanningHint,
    );
  }

  private recordBlockedReview(
    task: ParsedTaskDocument,
    review: ReviewerOutput,
    implementation: ImplementationAttempt,
    qualityResults: readonly QualityGateResult[],
  ): BlockerProfile {
    const owner = this.resolveWorkItemContext(task.featureId);
    const snapshot = this.readFeatureStateSnapshot(owner);
    const blocker = this.buildReviewBlockerProfile(task, review, implementation, qualityResults, snapshot);
    const restorationTarget = this.preferredRestorationTarget(snapshot);
    const reason = this.buildReviewBlockerReason(review, implementation, qualityResults);

    this.persistBlockedFeature(task.featureId, task.taskId, reason, blocker, restorationTarget, owner);
    return blocker;
  }

  /**
   * Mirrors recordBlockedReview() exactly, except the persisted lifecycle is `review_failed`,
   * not `blocked` -- closing the gap where reviewer `failed` used to hard-stop with no persisted
   * state at all. The routing this enables (review_failed -> diagnose_autocorrect ->
   * runDiagnosticAutocorrection) already existed and was dormant; this is what finally writes
   * that lifecycle state.
   */
  private recordFailedReview(
    task: ParsedTaskDocument,
    review: ReviewerOutput,
    implementation: ImplementationAttempt,
    qualityResults: readonly QualityGateResult[],
  ): BlockerProfile {
    const owner = this.resolveWorkItemContext(task.featureId);
    const snapshot = this.readFeatureStateSnapshot(owner);
    const blocker = this.buildReviewBlockerProfile(task, review, implementation, qualityResults, snapshot);
    const restorationTarget = this.preferredRestorationTarget(snapshot);
    const reason = this.buildReviewBlockerReason(review, implementation, qualityResults);

    this.persistBlockedFeature(task.featureId, task.taskId, reason, blocker, restorationTarget, owner, 'review_failed');
    return blocker;
  }

  private persistBlockedFeature(
    featureId: string,
    taskId: string | null,
    reason: string,
    blocker: BlockerProfile,
    restorationTarget: RestorationTarget,
    feature: WorkItemContext,
    lifecycleState: 'blocked' | 'review_failed' = 'blocked',
    explicitNextPlanningHint?: string,
  ): void {
    const blockedByLines = this.buildBlockedByLines(blocker, reason);
    // blockedNextPlanningHint() only branches on recoverability, never on kind, and always
    // returns a generic "a person needs to look at this" hint for the non-terminal/human case -- so
    // a caller whose blocker has an explicit, known correct next action (see recordBlockedFeature)
    // must be able to override it, or fixing `kind` alone changes nothing a human/planner reads.
    const nextPlanningHint = explicitNextPlanningHint ?? this.blockedNextPlanningHint(blocker, restorationTarget);
    const updatedFeatureState = this.updateFeatureStateForBlocked(
      feature.statePath,
      blocker,
      restorationTarget,
      blockedByLines,
      nextPlanningHint,
      lifecycleState,
    );
    const updatedProjectState = this.updateProjectStateForBlocked(
      featureId,
      taskId,
      blocker,
      restorationTarget,
      this.blockedProjectPendingLines(blocker, restorationTarget, taskId),
      nextPlanningHint,
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

    // Single choke point every blocking path (recordBlockedFeature/recordBlockedReview/
    // recordFailedReview/persistBlockedFeatureWithKnownBlocker) funnels through -- printing the
    // card here, once, means no call site has to remember to render it, and every blocked
    // feature/fix gets the identical bounded, human-legible shape `listBlockedWorkItems()` also
    // reconstructs later for `npm run doctor`.
    console.error(renderBlockerCard({
      itemId: featureId,
      itemPathRelative: relativePath(this.repositoryRoot, feature.statePath),
      kind: blocker.kind,
      recoverability: blocker.recoverability,
      reason,
      evidence: blocker.evidence,
    }).join('\n'));
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
    task: ParsedTaskDocument,
    review: ReviewerOutput,
    implementation: ImplementationAttempt,
    qualityResults: readonly QualityGateResult[],
    snapshot: FeatureStateSnapshot,
  ): BlockerProfile {
    const reason = this.buildReviewBlockerReason(review, implementation, qualityResults);
    const blockedBy = [
      review.summary,
      ...review.findings.map((finding) => finding.message),
      implementation.error ?? '',
      implementation.diagnostics.classification,
      ...qualityResults.map((result) => `${result.name}: ${result.status}`),
    ].filter((item) => item.trim().length > 0);

    // Prefer structured facts this attempt already computed over guessing from prose (see
    // ADR-0031/ADR-0034). classifyImplementation() already diagnosed *why* the implementation
    // struggled -- that must not be re-derived by regex-matching whatever wording
    // buildImplementationErrorMessage() happened to compose around it.
    const diagnosticKind = classifyDiagnosticKind(implementation.diagnostics.classification);
    if (diagnosticKind) {
      return finalizeBlockerProfile(diagnosticKind, reason, blockedBy, snapshot.lifecycleState);
    }

    // No implementation-side diagnostic fired, but an objective, non-AI quality gate did fail --
    // that alone is exactly what `review_failure` means, with nothing left to guess.
    if (qualityResults.some((result) => result.status === 'failed')) {
      return finalizeBlockerProfile('review_failure', reason, blockedBy, snapshot.lifecycleState);
    }

    // Nothing structured to go on: this is a genuine reviewer-only rejection, and findings are
    // free text by nature. Rather than trust a single fragile regex guess, ask independently
    // several times and require agreement (see ADR-0036) -- a deterministic, locally-cheap
    // stand-in for a fresh-context verifier subagent, triggered by fixed orchestrator rule, not
    // by a model deciding to delegate. Falls back to the regex guess untouched if the ensemble
    // itself is unavailable (e.g. no codex binary in this environment), so behavior is identical
    // to before whenever the ensemble can't run.
    const ensemble = this.classifyReviewBlockerKindByEnsemble(task, review, snapshot.lifecycleState);
    if (!ensemble) {
      return classifyBlockerKind(reason, blockedBy, snapshot.lifecycleState);
    }

    const { kind, agreed } = resolveBlockerKindEnsemble(ensemble);
    if (!agreed) {
      return buildEnsembleDisagreementProfile(ensemble, reason, blockedBy, snapshot.lifecycleState);
    }

    return finalizeBlockerProfile(kind, reason, blockedBy, snapshot.lifecycleState);
  }

  /**
   * Fires BLOCKER_KIND_ENSEMBLE_SIZE independent, fresh-context classification calls -- no
   * shared history between them, each seeing only the same declared minimal input (reviewer
   * summary + findings + lifecycle state) -- and returns their raw votes, or null if the
   * ensemble could not run at all (codex unavailable, or any single call returned a malformed
   * response). A null result signals the caller to fall back to classifyBlockerKind() entirely;
   * this method never returns a partial/short ensemble, since an incomplete vote set is not a
   * basis for either trusting agreement or detecting disagreement. See ADR-0036.
   */
  private classifyReviewBlockerKindByEnsemble(
    task: ParsedTaskDocument,
    review: ReviewerOutput,
    lifecycleState: string,
  ): readonly BlockerKind[] | null {
    const prompt = [
      'Act as the CompassRose Blocker Classifier.',
      '',
      'Classify why this review rejected the implementation into exactly one blocker kind.',
      'Reason independently from the evidence below only -- do not assume any other attempt\'s conclusion.',
      '',
      'Reviewer summary:',
      review.summary,
      '',
      'Reviewer findings:',
      ...(review.findings.length > 0 ? review.findings.map((finding) => `- ${finding.message}`) : ['(none)']),
      '',
      `Feature lifecycle state: ${lifecycleState}`,
      '',
      'Valid kinds:',
      '- state_corruption: the project/feature state documents themselves are stale or inconsistent.',
      '- task_interface_gap: the task definition, scope, or acceptance criteria were unclear or insufficient.',
      '- cli_mismatch: a tool required a permission/approval it did not get, or otherwise misbehaved procedurally.',
      '- environment: a missing binary, command, or external dependency caused the failure.',
      '- implementation_failure: the produced change itself is wrong, incomplete, or does not do what the task asked.',
      '- review_failure: the change is plausible but did not meet the review/acceptance bar.',
      '- unknown: none of the above clearly applies.',
      '',
      '`rationale` is read directly by a human at the console, not only by the next AI call -- keep it to one short, plain sentence.',
      '',
      'Return JSON only and do not modify files.',
    ].join('\n');

    return this.runClassifierEnsemble<BlockerKind>({
      size: BLOCKER_KIND_ENSEMBLE_SIZE,
      prompt,
      labelPrefix: `classifier:blocker-kind:${task.taskId}`,
      invocationKind: 'blocker_kind_classification',
      schemaId: 'blocker_kind_classification',
      featureId: task.featureId,
      taskId: task.taskId,
      extractVote: (raw) => (typeof raw.kind === 'string' && isBlockerKind(raw.kind) ? raw.kind : null),
    });
  }

  private blockedNextPlanningHint(blocker: BlockerProfile, restorationTarget: RestorationTarget): string {
    if (blocker.recoverability === 'terminal') {
      return `The active feature is blocked by a terminal blocker (${blocker.signature}); stop and document the limitation.`;
    }

    if (blocker.recoverability === 'human') {
      return `The active feature is blocked by a blocker that requires human intervention (${blocker.signature}); stop and document the limitation.`;
    }

    return `Run \`/desbloquear\` to work out blocker \`${blocker.signature}\` with a person, then restore \`${restorationTarget.lifecycle_state}\`.`;
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
      'Run `/desbloquear` on the active feature to work out its blocker with a person.',
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
    lifecycleState: 'blocked' | 'review_failed' = 'blocked',
  ): string {
    let markdown = readUtf8(featureStatePath);
    markdown = replaceSection(markdown, 'Lifecycle State', lifecycleState);
    markdown = replaceOperationalStatus(markdown, {
      active_task: restorationTarget.active_task,
      active_correction_task: restorationTarget.active_correction_task,
      last_review_result: lifecycleState === 'review_failed' ? 'failed' : 'blocked',
    });
    // blockedByLines is already a list of "- key: value" bullet lines (buildBlockedByLines);
    // wrapping it in bulletList() here double-bulleted every "Blocked By" entry ("- - kind: ...")
    // for every feature/fix this codebase has ever blocked. readRecordedBlockerProfile() already
    // works around it with a defensive `(?:-\s*)+` strip, but blockerCard.ts's parseBlockedByBullets
    // did not, so npm run doctor's blocked-work card misread every one of these as kind: unknown.
    markdown = replaceSection(markdown, 'Blocked By', blockedByLines.join('\n'));
    markdown = replaceSection(markdown, 'Blocked From', [
      `- lifecycle_state: \`${restorationTarget.lifecycle_state}\``,
      `- active_task: \`${restorationTarget.active_task}\``,
      `- active_correction_task: \`${restorationTarget.active_correction_task}\``,
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
    const restoredTask = artifact?.state_correction?.state_target.restored_active_task ?? 'none';
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

  // Repo-relative path under this.featuresRoot/this.fixesRoot (which already respect an
  // explicit documentation.features_root/fixes_root override, unlike compassRoseRoot alone) --
  // every prompt "Read only" bullet and allowed-path entry that names a specific feature/fix
  // document must go through these, not re-derive the root itself.
  private featureRelativePath(featureId: string, ...segments: readonly string[]): string {
    // node:path's relative() returns OS-native separators -- backslashes on Windows -- but every
    // other path in this codebase, and every path git status/diff report, is forward-slash. A
    // mixed-separator result here silently breaks isPathAllowedByPrefix's string comparison
    // against those reports (e.g. ensureCleanWorktreeIfRequired's allowed-dirty-prefix check).
    const base = relativePath(this.repositoryRoot, this.featuresRoot).split('\\').join('/');
    return [base, featureId, ...segments].filter((segment) => segment.length > 0).join('/');
  }

  private fixRelativePath(fixId: string, ...segments: readonly string[]): string {
    const base = relativePath(this.repositoryRoot, this.fixesRoot).split('\\').join('/');
    return [base, fixId, ...segments].filter((segment) => segment.length > 0).join('/');
  }

  // Same backslash-vs-forward-slash hazard as featureRelativePath/fixRelativePath above, for the
  // one other path that's compared against git status output via isPathAllowedByPrefix (the
  // dirty-worktree allowlist checks). Found live: on Windows, path.relative()'s raw backslash
  // result never matched git's always-forward-slash dirty-path list, so PROJECT_STATE.md was
  // reported as a disallowed dirty path even though it's always meant to be allowed.
  private projectStateRelativePath(): string {
    return relativePath(this.repositoryRoot, this.projectStatePath).split('\\').join('/');
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
      `- The active feature pointer currently targets \`${featureId}\`; the detailed task and lifecycle state for that feature lives in \`${this.featureRelativePath(featureId, 'state.md')}\`.`,
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
      `- The active work-item pointer currently targets fix \`${fixId}\`; the detailed task and lifecycle state for that fix lives in \`${this.fixRelativePath(fixId, 'state.md')}\`.`,
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
      `The active feature is \`${featureId}\`, but implementation of \`${taskId}\` failed; diagnose it before continuing.`,
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
    });
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
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

  /**
   * The `quality_failed` branch used to leave `Blocked By` empty -- unlike every other blocked
   * transition (implementation_failed, review_failed, blocked), which all persist a full blocker
   * profile with concrete evidence. That asymmetry meant a later diagnose_autocorrect run had
   * nothing but a bare "stop and recover" hint to go on, since the real failed-gate output only
   * ever reached a transient console.error() and an explicitly "advisory, unverified" refinement
   * artifact -- diagnosed live when it produced a fix filed on the vague grounds of "lacks
   * concrete failed-gate evidence" (fix 004-orchestration-quality-failure-attribution-and-
   * recovery-state-transition-defect), a defect in this function's own omission, not a genuine
   * systemic defect elsewhere.
   */
  private updateFeatureStateAfterImplementation(
    featureStatePath: string,
    taskId: string,
    lifecycleState: 'review_pending' | 'quality_failed',
    qualityResult: 'passed' | 'failed',
    qualityResults: readonly QualityGateResult[] = [],
  ): string {
    let markdown = readUtf8(featureStatePath);
    markdown = replaceSection(markdown, 'Lifecycle State', lifecycleState);
    markdown = replaceOperationalStatus(markdown, {
      active_task: taskId,
      last_implementation_result: 'passed',
      last_quality_gate_result: qualityResult,
      last_review_result: 'not_run',
      active_correction_task: 'none',
      // Quality gates actually passing is the only point that proves a prior recovery attempt
      // (if any) produced real forward progress rather than just re-entering the same failing
    });

    if (lifecycleState === 'quality_failed') {
      const reason = this.buildQualityFailureReason(taskId, qualityResults);
      // This branch is only reached when lifecycleState === 'quality_failed', which the call site
      // above only passes when `qualityResults.every(r => r.status !== 'failed')` is false -- i.e.
      // at least one quality gate having failed is a guaranteed structural fact here, not
      // something to guess at by regex-matching the failure text. That is exactly what
      // `review_failure` means, so use it directly instead of classifyBlockerKind(). See
      // ADR-0031/ADR-0034.
      const blocker = finalizeBlockerProfile(
        'review_failure',
        reason,
        qualityResults.map((result) => `${result.name}: ${result.status}: ${result.output_summary}`),
        'implementation_running',
      );
      const restorationTarget: RestorationTarget = {
        lifecycle_state: 'implementation_running',
        active_task: taskId,
        active_correction_task: 'none',
      };
      // Same double-bulleting fix as updateFeatureStateForBlocked below -- buildBlockedByLines()
      // already returns "- key: value" lines.
      markdown = replaceSection(markdown, 'Blocked By', this.buildBlockedByLines(blocker, reason).join('\n'));
      markdown = replaceSection(markdown, 'Blocked From', [
        `- lifecycle_state: \`${restorationTarget.lifecycle_state}\``,
        `- active_task: \`${restorationTarget.active_task}\``,
        `- active_correction_task: \`${restorationTarget.active_correction_task}\``,
        `- recoverability: ${blocker.recoverability}`,
      ].join('\n'));
      markdown = replaceSection(markdown, 'Next Planning Hint', this.blockedNextPlanningHint(blocker, restorationTarget));
      return markdown;
    }

    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
    ].join('\n'));
    markdown = replaceSection(markdown, 'Next Planning Hint', `Review subtask \`${taskId}\` next.`);
    return markdown;
  }

  private buildQualityFailureReason(taskId: string, qualityResults: readonly QualityGateResult[]): string {
    const failedGates = qualityResults
      .filter((result) => result.status === 'failed')
      .map((result) => `${result.name}: ${result.output_summary}`);
    return [`Quality gates failed after implementing ${taskId}.`, ...failedGates]
      .filter((item) => item.trim().length > 0)
      .join('\n');
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
    });
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
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
    });
    markdown = replaceSection(markdown, 'Blocked By', [
      '- kind: implementation_failure',
      `- signature: implementation-failure-${taskId}`,
      '- recoverability: agent',
      `- observed_state: lifecycle=implementation_failed; active_task=${taskId}; active_correction_task=none`,
      `- evidence: ${reason}`,
    ].join('\n'));
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: `task_ready`',
      `- active_task: \`${taskId}\``,
      '- active_correction_task: `none`',
      '- recoverability: agent',
    ].join('\n'));
    markdown = replaceSection(
      markdown,
      'Next Planning Hint',
      `Diagnose the failed implementation of \`${taskId}\` and restore task readiness before continuing.`,
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

  /**
   * A task request is only ever satisfied once, but the task that finally gets approved for it
   * is frequently not the task task-planning originally created from that request: a correction
   * (`F002-T17-C1`) or a further correction of that correction (`F002-T17-C1-CORRECTION-R1`)
   * carries no `source_task_request_id` of its own -- only the original planned task does. Found
   * live: F002-TR05's status stayed `in_progress` forever after its correction chain was fully
   * approved, because this lookup only ever checked the just-approved task's own stored JSON.
   * primaryTaskAnchorFromId strips every `-C<n>`/`-CORRECTION-*`/`-DOCTOR-RECOVERY-*` suffix back
   * to the original `F<feature>-T<n>` anchor regardless of how many correction/recovery rounds
   * separate the two, so this falls back to that anchor's own stored task JSON when the approved
   * task itself doesn't carry the field.
   */
  private resolveSourceTaskRequestId(taskId: string): string | null {
    const direct = this.artifacts.readJson<PlannerOutput>(join('tasks', `${taskId}.json`))?.task?.source_task_request_id ?? null;
    if (direct) {
      return direct;
    }

    const anchor = primaryTaskAnchorFromId(taskId);
    if (anchor === taskId) {
      return null;
    }

    return this.artifacts.readJson<PlannerOutput>(join('tasks', `${anchor}.json`))?.task?.source_task_request_id ?? null;
  }

  private updateFeatureStateAfterApprovedReview(featureStatePath: string, task: ParsedTaskDocument): string {
    let markdown = readUtf8(featureStatePath);
    markdown = replaceSection(markdown, 'Lifecycle State', 'formalized');
    markdown = replaceOperationalStatus(markdown, {
      active_task: 'none',
      active_correction_task: 'none',
      last_implementation_result: 'passed',
      last_quality_gate_result: 'passed',
      last_review_result: 'approved',
    });
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
    ].join('\n'));
    markdown = replaceSection(markdown, 'Last Approved Change', `Subtask \`${task.taskId}\` was approved by the prototype orchestrator.`);
    markdown = replaceSection(markdown, 'Next Planning Hint', 'Plan the next task that advances this feature from the remaining gap.');

    const sourceTaskRequestId = this.resolveSourceTaskRequestId(task.taskId);
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
      last_review_result: 'changes_required',
    });
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
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
    });
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
    ].join('\n'));
    markdown = replaceSection(markdown, 'Next Planning Hint', `Execute correction task \`${correctionTaskId}\` next.`);
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
      last_implementation_result: 'passed',
      last_quality_gate_result: 'passed',
      last_review_result: 'approved',
    });
    markdown = replaceSection(markdown, 'Blocked From', [
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
    ].join('\n'));
    markdown = replaceSection(markdown, 'Last Approved Change', `State correction artifact \`${taskId}\` was applied by the prototype orchestrator.`);
    markdown = replaceSection(markdown, 'Next Planning Hint', stateCorrectionNextPlanningHint(stateCorrection));
    return markdown;
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
    this.artifacts.writeText(join('recovery-lessons', `${task.taskId}.md`), this.renderRecoveryLessonMarkdown(lesson));
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

    const category = classifyRecoveryLessonCategory({
      scopeIsolationNotes,
      qualityGateFailures,
      implementerLimitations: analysis.implementer_limitations,
      recommendedAction: analysis.recommended_action,
    });

    return {
      run_id: this.runId,
      created_at: new Date().toISOString(),
      feature_id: task.featureId,
      task_id: task.taskId,
      correction_task_id: correctionTaskId,
      review_status: review.status,
      category,
      summary: review.summary,
      implementation_notes: boundRecoveryLessonNotes(implementation.implementation_notes),
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
   * Reads every recorded lesson for `featureId` (not just the single most-recently-written one),
   * across every task anchor, and returns the most recent `limit`. This is what lets a lesson
   * learned on one task chain inform a later, unrelated chain instead of only ever being visible
   * while its own anchor is active -- real evidence in this repository's own recovery-lessons
   * history shows the same defect (implementer context artifacts missing at the supplied paths)
   * recurring verbatim across four distinct, unrelated anchors (F002-T09, T10, T12, T16) because
   * the old single-overwritten-file design could only ever surface whichever one was most recent.
   *
   * When `activeTaskId` is given, lessons about that SAME anchor (see primaryTaskAnchorFromId)
   * are sorted first -- still the most directly relevant lesson for a correction task fixing
   * one specific active task -- but unlike the old design, a same-anchor match is a sort
   * preference now, not an exclusive filter that discards every other lesson.
   */
  private loadRecentRecoveryLessons(featureId: string, activeTaskId?: string | null, limit = 5): RecoveryLesson[] {
    const lessons = this.artifacts
      .listFiles('recovery-lessons')
      .filter((entry) => entry.name.endsWith('.json'))
      .map((entry) => this.artifacts.readJson<RecoveryLesson>(join('recovery-lessons', entry.name)))
      .filter((lesson): lesson is RecoveryLesson => lesson !== null && lesson.feature_id === featureId);

    const sameAnchor = activeTaskId ? primaryTaskAnchorFromId(activeTaskId) : null;
    lessons.sort((a, b) => {
      if (sameAnchor) {
        const aMatches = primaryTaskAnchorFromId(a.task_id) === sameAnchor;
        const bMatches = primaryTaskAnchorFromId(b.task_id) === sameAnchor;
        if (aMatches !== bMatches) {
          return aMatches ? -1 : 1;
        }
      }

      return b.created_at.localeCompare(a.created_at);
    });

    return lessons.slice(0, limit);
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
    const lessons = this.loadRecentRecoveryLessons(featureId, activeTaskId);
    if (lessons.length === 0) {
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
      `Recent recovery lessons for this feature (${lessons.length} shown, most relevant first — advisory only, produced by prior review/analysis model calls and not independently verified; treat each as a hypothesis to check against the contracts listed above, not a confirmed requirement):`,
      ...this.describeRecurringRecoveryLessonCategories(lessons),
    ];

    for (const lesson of lessons) {
      lines.push('', `- lesson for task_id ${lesson.task_id} (category: ${lesson.category}):`);
      lines.push(...this.renderRecoveryLessonDetailLines(lesson));
    }

    return lines;
  }

  /**
   * Surfaces, as an explicit callout, when 2+ of the shown lessons share the same primary
   * defect category -- the concrete signal causa E's redesign exists to expose (this
   * repository's own recovery-lessons history has a real recurring defect spanning four
   * unrelated task anchors that the old single-lesson design never once surfaced together).
   */
  private describeRecurringRecoveryLessonCategories(lessons: readonly RecoveryLesson[]): string[] {
    const countByCategory = new Map<string, number>();
    for (const lesson of lessons) {
      countByCategory.set(lesson.category, (countByCategory.get(lesson.category) ?? 0) + 1);
    }

    const recurring = [...countByCategory.entries()].filter(([, count]) => count > 1);
    if (recurring.length === 0) {
      return [];
    }

    return recurring.map(
      ([category, count]) => `- recurring_category: ${count} of the last ${lessons.length} lessons for this feature are categorized "${category}" -- consider whether this is a systemic gap rather than a one-off mistake.`,
    );
  }

  private renderRecoveryLessonDetailLines(lesson: RecoveryLesson): string[] {
    const lines = [
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
      `- category: ${lesson.category}`,
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
      likely_sources: inferLikelySources(trigger, selectedStep, this.compassRoseRoot),
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
