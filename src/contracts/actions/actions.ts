import type { SystemState } from "../state/systemState.js";

export enum ActionType {
    DIAGNOSE_REPO = "diagnose_repo",
    REQUEST_FEATURE = "request_feature",
    // Creates cannonical documentation (architecture, description and Task Requests) for the requested functionality
    PLAN_FEATURE = "plan_feature",
    // Creates a request for a task that should implement some functionality
    PLAN_TASK = "plan_task",
    // Creates cannonical documentation (architecture and description) for the requested functionality
    PLAN_SUBTASK = "plan_subtask",
    // Sends a subtask for implementation.
    IMPLEMENT_SUBTASK = "implement_subtask",
    // Sends the implementation of a subtask for review.
    REVIEW_SUBTASK = "review_subtask",
    //Rejects the implementation of a subtask marking it as rejected 
    //and creates a new subtask that corrects/completes the rejected one.
    REJECT_SUBTASK = "reject_subtask",
    //Aproves the implementation of a subtask and its curresponding task marking both as approved
    APPROVE_SUBTASK = "approve_subtask",
}

export interface ActionContext {
}

export interface ActionExecutor {
    execute(action:SystemAction): SystemState;
}

export interface SystemAction {
    actionType: ActionType;
    actionContext: ActionContext;    
}

export interface ActionFactory {
    createAction(actionType: ActionType, actionContext: ActionContext): SystemAction;
}