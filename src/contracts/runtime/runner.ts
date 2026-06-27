import type { FeatureInfo, State } from "../state/systemState.ts";

export enum RunType {
    MANUAL = "manual",
    AUTOMATIC = "automatic",
}

export interface RunnerInterface {
    runType: RunType;
    createState(): Promise<void>;
    loadState(): Promise<void>;
    updateState(state: State): Promise<void>;
    findNextChild(currentChildPath: string): Promise<RunnerInterface | undefined>;
    run(): Promise<State>;
}


export abstract class Runner implements RunnerInterface {

    currentChildPath?: string| undefined;

    currentChild: RunnerInterface | undefined;

    runType: RunType;

    constructor(runType: RunType) {
        this.runType = runType;
    }
    abstract createState(): Promise<void>;

    abstract loadState(): Promise<void>;

    abstract updateState(state: State): Promise<void>;

    abstract findNextChild(): Promise<RunnerInterface | undefined>;

    async run(): Promise<State> {

        this.currentChild = await this.findNextChild();
        let state: State = {};
        while (this.currentChild) {
            state = await this.currentChild.run();
            await this.updateState(state);
        }
        return state;
    }
}
