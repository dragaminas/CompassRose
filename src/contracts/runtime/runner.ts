import type { StateHandlerInterface } from "../state/stateHandler.js";
import { ImplementationState } from "../state/implementationMachine.js";
import type { SystemState } from "../state/workflowState.js";

export enum RunType {

    MANUAL = "manual",

    AUTOMATIC = "automatic",
}
export interface RunnerInterface {

    runType: RunType;

    stateHandler: StateHandlerInterface;

    executeStateAction(state: SystemState | undefined): SystemState;

    run(): SystemState;
}

export abstract class Runner implements RunnerInterface {
    abstract runType: RunType;

    abstract stateHandler: StateHandlerInterface;

    abstract executeStateAction(state: SystemState | undefined): SystemState;

    abstract run(): SystemState;
}
