import type { StepDecision } from './stepDecision.js';

export interface StepOutcomeRecord {
  readonly exitCode: number;
  readonly continueLoop: boolean;
  readonly summary: string;
}

/**
 * How a caller watches a run as it happens, rather than reading what it did afterwards.
 *
 * `run()` is otherwise a black box that returns an exit code minutes later. The interactive session
 * (`src/session/`) needs to draw each step as it starts and lands; non-interactive callers pass
 * nothing and behave exactly as before.
 *
 * Observers are for display only. An observer must never mutate repository state, and the runtime
 * must never change what it does based on whether one is attached -- an observed run and an
 * unobserved run take identical steps.
 */
export interface RunObserver {
  onStepStart(decision: StepDecision): void;
  onStepEnd(decision: StepDecision, outcome: StepOutcomeRecord): void;
}
