import type { SystemState } from "../state/systemState.js";
import type {
    DiagnosticAutocorrectionDecision,
    DoctorRecoveryTaskMetadata,
    FeatureStateSnapshot,
    ImplementationAttempt,
    ParsedTaskDocument,
    PlannedFeatureDocs,
    RecoveryLesson,
    ReviewableDiffHandoff,
    RestorationTarget,
    StateCorrectionTask,
} from "../types.js";

export enum ActionType {
    DIAGNOSE_REPO = "diagnose_repo",
    // Searches the pending request queue for the next feature request.
    FIND_NEXT_FEATURE_REQUEST = "find_next_feature_request",
    // Formalizes a found feature request into the canonical feature documents and task request backlog.
    PLAN_FEATURE = "plan_feature",
    // Creates one bounded implementation task from the feature backlog.
    PLAN_TASK = "plan_task",
    // Breaks a task into the subtask that will actually be executed.
    PLAN_SUBTASK = "plan_subtask",
    // Sends a subtask for implementation.
    IMPLEMENT_SUBTASK = "implement_subtask",
    // Runs the configured quality gates before review.
    RUN_QUALITY_GATES = "run_quality_gates",
    // Sends the implementation of a subtask for review.
    REVIEW_SUBTASK = "review_subtask",
    // Applies a direct state or documentation repair.
    CORRECT_STATE = "correct_state",
    // Plans one bounded doctor recovery task.
    PLAN_DOCTOR_RECOVERY = "plan_doctor_recovery",
    // Executes the recorded doctor recovery task.
    EXECUTE_DOCTOR_RECOVERY = "execute_doctor_recovery",
    // Stops with a diagnostic instead of silently choosing a path.
    STOP_WITH_DIAGNOSTIC = "stop_with_diagnostic",
    // Exits the runtime with a diagnostic instead of silently choosing a path.
    EXIT = "exit",
}

// Each action gets a dedicated context so we avoid one giant bag of optionals.
export interface ActionContextBase {
    readonly runId: string;
    readonly repositoryRoot: string;
    readonly projectStatePath: string;
    readonly state: SystemState;
}

export interface DiagnoseRepoActionContext extends ActionContextBase {
    readonly featureStateSnapshot: FeatureStateSnapshot;
    readonly latestRunPath: string | null;
    readonly latestImplementationAttempt: ImplementationAttempt | null;
    readonly repositorySummary: string;
}

export interface FindNextFeatureRequestActionContext extends ActionContextBase {
    readonly requestRootPath: string;
    readonly featureRootPath: string;
    readonly pendingRequestPaths: readonly string[];
}

export interface PlanFeatureActionContext extends ActionContextBase {
    readonly requestPath: string;
    readonly featurePath: string;
    readonly architecturePath: string;
    readonly statePath: string;
    readonly featureId: string;
    readonly featureName: string;
    readonly referenceDocumentPaths: readonly string[];
    readonly relevantRepositoryPaths: readonly string[];
    readonly planningHint: string | null;
}

export interface PlanTaskActionContext extends ActionContextBase {
    readonly featurePath: string;
    readonly featureStatePath: string;
    readonly featureDocs: PlannedFeatureDocs;
    readonly featureStateSnapshot: FeatureStateSnapshot;
    readonly recoveryLessons: readonly RecoveryLesson[];
    readonly projectSummary: string;
}

export interface PlanSubtaskActionContext extends ActionContextBase {
    readonly task: ParsedTaskDocument;
}

export interface ImplementSubtaskActionContext extends ActionContextBase {
    readonly task: ParsedTaskDocument;
}

export interface RunQualityGatesActionContext extends ActionContextBase {
    readonly task: ParsedTaskDocument;
    readonly qualityGates: readonly string[];
}

export interface ReviewSubtaskActionContext extends ActionContextBase {
    readonly task: ParsedTaskDocument;
    readonly implementationAttempt: ImplementationAttempt;
    readonly reviewableDiffHandoff: ReviewableDiffHandoff;
}

export interface CorrectStateActionContext extends ActionContextBase {
    readonly stateCorrectionTask: StateCorrectionTask;
}

export interface PlanDoctorRecoveryActionContext extends ActionContextBase {
    readonly diagnostic: DiagnosticAutocorrectionDecision;
    readonly blockerTarget: RestorationTarget;
    readonly recoveryLessons: readonly RecoveryLesson[];
}

export interface ExecuteDoctorRecoveryActionContext extends ActionContextBase {
    readonly task: ParsedTaskDocument;
    readonly doctorRecovery: DoctorRecoveryTaskMetadata;
}

export interface StopWithDiagnosticActionContext extends ActionContextBase {
    readonly diagnostic: DiagnosticAutocorrectionDecision;
}

export interface ExitActionContext extends ActionContextBase {
    readonly exitCode: number;
    readonly reason: string;
}

export interface ActionContextByType {
    [ActionType.DIAGNOSE_REPO]: DiagnoseRepoActionContext;
    [ActionType.FIND_NEXT_FEATURE_REQUEST]: FindNextFeatureRequestActionContext;
    [ActionType.PLAN_FEATURE]: PlanFeatureActionContext;
    [ActionType.PLAN_TASK]: PlanTaskActionContext;
    [ActionType.PLAN_SUBTASK]: PlanSubtaskActionContext;
    [ActionType.IMPLEMENT_SUBTASK]: ImplementSubtaskActionContext;
    [ActionType.RUN_QUALITY_GATES]: RunQualityGatesActionContext;
    [ActionType.REVIEW_SUBTASK]: ReviewSubtaskActionContext;
    [ActionType.CORRECT_STATE]: CorrectStateActionContext;
    [ActionType.PLAN_DOCTOR_RECOVERY]: PlanDoctorRecoveryActionContext;
    [ActionType.EXECUTE_DOCTOR_RECOVERY]: ExecuteDoctorRecoveryActionContext;
    [ActionType.STOP_WITH_DIAGNOSTIC]: StopWithDiagnosticActionContext;
    [ActionType.EXIT]: ExitActionContext;
}

export type ActionContext<T extends ActionType = ActionType> = ActionContextByType[T];

export interface ActionExecutor {
    execute<T extends ActionType>(action: SystemAction<T>): SystemState;
}

export interface SystemAction<T extends ActionType = ActionType> {
    actionType: T;
    actionContext: ActionContext<T>;
}

export interface ActionFactory {
    createAction<T extends ActionType>(actionType: T, actionContext: ActionContext<T>): SystemAction<T>;
}
