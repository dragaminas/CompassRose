import type { ActionContext, ActionType, SystemAction } from "../actions/actions.js";
import type { ImplementationEvent, SystemState } from "../state/systemState.js";

export interface StateStoreInterface {
    createState(): SystemState;
    loadState(): SystemState;
    updateState(state: SystemState): SystemState;
}

export interface StateMachineInterface {
    transition(currentState: SystemState, event: ImplementationEvent): SystemState;
}

export interface ActionSelectorInterface {
    select(state: SystemState): ActionType | undefined;
}

export interface ActionContextFactoryInterface {
    create<T extends ActionType>(actionType: T, state: SystemState): ActionContext<T>;
}

export interface ActionDispatcherInterface {
    dispatch<T extends ActionType>(action: SystemAction<T>): ImplementationEvent;
}

export interface ActionExecutorInterface {
    execute<T extends ActionType>(action: SystemAction<T>): ImplementationEvent;
}

export interface OrchestratorInterface {
    run(): SystemState;
}
