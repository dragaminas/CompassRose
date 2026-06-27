
export enum ImplementationState {
    REQUESTED = "requested",
    PLANNED = "planned",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
    IN_REVIEW = "in_review",
    REJECTED = "rejected",
    APPROVED = "approved",
}

export interface SystemState {
    requestPath?: string | undefined;
    implementationState?: ImplementationState | undefined;
    lastFeaturePath?: string | undefined;
    currentFeaturePath?: string | undefined;
    currentFeatureState?: FeatureState| undefined;
}

export interface FeatureState {
    requestPath?: string | undefined;
    implementationState?: ImplementationState | undefined;
    lastTaskPath?: string | undefined;
    currentTaskPath?: string | undefined;
    currentTaskState?: TaskState| undefined;
}

export interface TaskState {
    implementationState: ImplementationState;
    lastSubtaskPath?: string | undefined;
    currentSubtaskPath?: string | undefined;
    currentSubtaskState?: SubtaskState | undefined;
}

export interface SubtaskState {
    implementationState: ImplementationState;
}

export enum StateAction {
    /**
     * Creates cannonical documentation (architecture and description) for the requested functionality
     * And creates request for child features or tasks.
     */
    PLAN_REQUEST = "plan_request",    
    //Implements a subtask, described in the cannonical documentation
    IMPLEMENT_PLAN = "implement_plan",
    //Reviews the implementation of a subtask.
    REVIEW_IMPLEMENTATION = "review_implementation",
    //Rejects the implementation of a subtask marking it as rejected 
    // and creates a new subtask that corrects/completes the rejected one.
    REJECT_IMPLEMENTATION = "reject_implementation",
    APROVE_IMPLEMENTATION = "approve_implementation",
}