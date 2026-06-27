import { Runner, RunType, type RunnerInterface } from "./contracts/runtime/runner.js";
import type { StateHandlerInterface } from "./contracts/state/stateHandler.js";
import type { SystemState } from "./contracts/state/systemState.js";

class SubtaskRunner extends Runner {
    stateHandler!: StateHandlerInterface;

    prepareNextChild(state: SystemState): RunnerInterface | undefined {
        throw new Error("Method not implemented.");
    }
    
    executeStateAction(state: SystemState): SystemState {
        throw new Error("Method not implemented.");
    }
}