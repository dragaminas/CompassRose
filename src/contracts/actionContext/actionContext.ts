import type { RunLevel } from "../runtime/runner.js";
import type { StateAction, SystemState } from "../state/systemState.js";

export interface ActionContext{
    request?: string;
    description?: string;
    architecture?: string;  
}

export interface ActionContextConstructor {
    new (runLevel: RunLevel, stateAction: StateAction, state: SystemState): ActionContext;
}



