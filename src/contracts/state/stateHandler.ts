import type { SystemState } from "./systemState.js";

export interface StateHandlerInterface {
    createState(): SystemState;
    loadState(): SystemState;
    updateState(state: SystemState): SystemState;
    handleState(state: SystemState): SystemState;
}



