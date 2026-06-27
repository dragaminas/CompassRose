import { Runner, RunType, type RunnerInterface } from "./contracts/runtime/runner.js";
import type { State } from "./contracts/state/systemState.js";

class SystemRunner extends Runner {
    constructor(runType: RunType) {
        super(runType);
    }

    async createState(): Promise<void> {
        // Implementation for creating state
    }

    async loadState(): Promise<void> {
        // Implementation for loading state
    }

    async updateState(state: State): Promise<void> {
        // Implementation for updating state
    }

    async findNextChild(): Promise<RunnerInterface | undefined> {
        // Implementation for finding the next child
        return undefined;
    }
}
