import type { StateHandlerInterface } from "../state/stateHandler.js";
import { ImplementationState, type SystemState } from "../state/systemState.js";

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