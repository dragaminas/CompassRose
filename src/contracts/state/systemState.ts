
export enum FeatureState {
    REQUESTED = "requested",
    FORMALIZED = "formalized",
    IN_PROGRESS = "in_progress",
    DONE = "done",
}

export interface State {
    lastChildPath?: string | undefined;
    currentChildPath?: string | undefined;
}

export interface FeatureInfo extends State {
    status: FeatureState;
    requestPath?: string | undefined;
    featureDescriptionPath?: string | undefined;
    architecturePath?: string | undefined;
}

export enum TaskState {
    REQUESTED = "requested",
    PLANNED = "planned",
    IN_PROGRESS = "in_progress",
    IN_REVIEW = "in_review",
    REJECTED = "rejected",
    REPLANNED = "replanned",
    DONE = "done",
}

export interface TaskInfo extends State {
    status: TaskState;
    taskType: string;
    descriptionPath?: string | undefined;
}
