import type { StateHandlerInterface } from "../state/stateHandler.ts";
import { ImplementationState, type SystemState } from "../state/systemState.ts";

export enum RunType {

    MANUAL = "manual",

    AUTOMATIC = "automatic",
}

export enum RunLevel {

    SYSTEM = "system",

    FEATURE = "feature",

    TASK = "task",

    SUBTASK = "subtask",
}
export interface RunnerInterface {

    runType: RunType;

    runLevel: RunLevel;

    stateHandler: StateHandlerInterface;

    executeStateAction(state: SystemState): SystemState;

    prepareNextChild(state: SystemState): RunnerInterface | undefined;

    run(): SystemState;
}


export abstract class Runner implements RunnerInterface {

    currentChild: RunnerInterface | undefined;

    runType: RunType;

    runLevel: RunLevel;

    currentState: SystemState | undefined;

    constructor(runType: RunType, runLevel: RunLevel = RunLevel.SYSTEM) {

        this.runType = runType;

        this.runLevel = runLevel;

        this.currentState = undefined;

    }

    abstract stateHandler: StateHandlerInterface;

    abstract prepareNextChild(state: SystemState): RunnerInterface | undefined;

    executeStateAction(state: SystemState): SystemState {

        switch (state.implementationState) {
            case ImplementationState.REQUESTED:
                return this.planAction();
            case ImplementationState.PLANNED:
                return this.implementAction();
            case ImplementationState.IN_PROGRESS:
                return this.implementAction();
            case ImplementationState.COMPLETED:
                return this.reviewAction();
            case ImplementationState.IN_REVIEW:
                return this.reviewAction();
            case ImplementationState.REJECTED:
                return this.planAction();
            case ImplementationState.APPROVED:
                return this.planAction();
            default:
                throw new Error(`Unknown implementation state: ${state.implementationState}`);
        }
    }

    run(): SystemState {

        let state: SystemState =  this.stateHandler.loadState();

        if (!state) {
            state = this.stateHandler.createState();
        }

        this.executeStateAction(state);

        this.currentChild = this.prepareNextChild(state);

        while (this.currentChild) {

            const result = this.currentChild.run();

            state = this.stateHandler.updateState(result);

            if (this.runType === RunType.MANUAL) return state;        

            this.currentChild = this.prepareNextChild(state);       
        }
        return state;
    }

    abstract requestAction(): SystemState;

    abstract planAction(): SystemState;

    abstract implementAction(): SystemState;

    abstract reviewAction(): SystemState;

    abstract rejectAction(): SystemState;

    abstract completeAction(): SystemState;
}
