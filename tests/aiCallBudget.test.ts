import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { AgentInvocationContext } from '../src/contracts/runtime/agentContext.js';
import type { StepDecision } from '../src/contracts/runtime/stepDecision.js';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { copyContractsIntoWorkspace, createTempWorkspace, readFixtureConfigMarkdown, type TempWorkspace } from './testUtils.js';

// Covers the run-wide AI call budget (see ADR-0041): checked centrally in determineNextStep()
// against agentInvocationCount, the counter every structured AI call already increments via
// recordAgentInvocationContext() -- no new per-call-site plumbing.

const PROJECT_STATE_SEED = `# CompassRose Project State

## Status

active

## Active Feature

\`none\`

## Current Reality

- Fixture workspace for AI call budget tests.

## Pending

- Nothing pending.

## Blocked

- Nothing blocked.

## Last Approved Change

None yet.

## Known Gaps

None.

## Next Planning Hint

None.
`;

function createWorkspace(configOverride?: (config: string) => string): TempWorkspace {
  const baseConfig = readFixtureConfigMarkdown();
  const workspace = createTempWorkspace({
    files: {
      'docs/compassrose/CONFIG.md': configOverride ? configOverride(baseConfig) : baseConfig,
      'docs/compassrose/PROJECT_STATE.md': PROJECT_STATE_SEED,
    },
  });
  copyContractsIntoWorkspace(workspace.root);
  mkdirSync(join(workspace.root, 'src'), { recursive: true });

  execFileSync('git', ['init', '--quiet'], { cwd: workspace.root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspace.root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspace.root });
  execFileSync('git', ['add', '-A'], { cwd: workspace.root });
  execFileSync('git', ['commit', '--quiet', '-m', 'initial commit'], { cwd: workspace.root });

  return workspace;
}

function withMaxAiCallsPerRun(value: number): (config: string) => string {
  return (config) => {
    if (config.includes('max_ai_calls_per_run:')) {
      return config.replace(/max_ai_calls_per_run:\s*\d+/, `max_ai_calls_per_run: ${value}`);
    }
    return config.replace(/limits:\n/, `limits:\n  max_ai_calls_per_run: ${value}\n`);
  };
}

function withoutMaxAiCallsPerRun(config: string): string {
  return config.replace(/\n\s*#[^\n]*\n\s*max_ai_calls_per_run:\s*\d+/, '').replace(/\n\s*max_ai_calls_per_run:\s*\d+/, '');
}

interface Access {
  determineNextStep(): StepDecision;
  executeStep(decision: StepDecision): { exitCode: number; continueLoop: boolean; summary: string };
  buildAgentInvocationContext(
    context: Omit<AgentInvocationContext, 'run_id' | 'recorded_at' | 'configuration' | 'workspace'>,
  ): AgentInvocationContext;
  recordAgentInvocationContext(context: AgentInvocationContext): void;
}

function asAccess(orchestrator: CompassRoseOrchestrator): Access {
  return orchestrator as unknown as Access;
}

function dummyInvocationContext(access: Access): AgentInvocationContext {
  return access.buildAgentInvocationContext({
    role: 'classifier',
    kind: 'blocker_kind_classification',
    label: 'fixture-invocation',
    feature_id: null,
    task_id: null,
    source_paths: [],
    prompt: 'fixture prompt',
    tool: { name: 'codex', command: 'codex', model: null, output_schema_id: 'blocker_kind_classification' },
  });
}

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
});

describe('run-wide AI call budget (ADR-0041)', () => {
  test('is unbounded by default when the config predates this field', () => {
    workspace = createWorkspace(withoutMaxAiCallsPerRun);
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    // Simulate a good number of prior calls; with no configured limit this must never trip.
    for (let i = 0; i < 50; i += 1) {
      access.recordAgentInvocationContext(dummyInvocationContext(access));
    }

    const decision = access.determineNextStep();
    expect(decision.reason).not.toContain('AI call budget');
  });

  test('stops before inspecting any feature once the budget is already exhausted', () => {
    workspace = createWorkspace(withMaxAiCallsPerRun(1));
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    access.recordAgentInvocationContext(dummyInvocationContext(access));

    const decision = access.determineNextStep();

    expect(decision.kind).toBe('stop');
    expect(decision.reason).toContain('AI call budget reached');
  });

  test('an explicit 0 disables AI calls entirely, distinct from "unset" (see readNonNegativeInteger)', () => {
    workspace = createWorkspace(withMaxAiCallsPerRun(0));
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    const decision = access.determineNextStep();

    expect(decision.kind).toBe('stop');
    expect(decision.reason).toContain('AI call budget reached for this run (0');
  });

  test('does not trip below the configured limit', () => {
    workspace = createWorkspace(withMaxAiCallsPerRun(3));
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    access.recordAgentInvocationContext(dummyInvocationContext(access));
    access.recordAgentInvocationContext(dummyInvocationContext(access));

    const decision = access.determineNextStep();
    expect(decision.reason).not.toContain('AI call budget');
  });

  test('trips exactly at the configured limit after real invocation-context calls', () => {
    workspace = createWorkspace(withMaxAiCallsPerRun(3));
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    access.recordAgentInvocationContext(dummyInvocationContext(access));
    access.recordAgentInvocationContext(dummyInvocationContext(access));
    access.recordAgentInvocationContext(dummyInvocationContext(access));

    const decision = access.determineNextStep();
    expect(decision.kind).toBe('stop');
    expect(decision.reason).toContain('AI call budget reached for this run (3');
  });

  test('executeStep surfaces the specific stop reason instead of a generic message', () => {
    workspace = createWorkspace(withMaxAiCallsPerRun(1));
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);
    access.recordAgentInvocationContext(dummyInvocationContext(access));

    const decision = access.determineNextStep();
    const result = access.executeStep(decision);

    expect(result.exitCode).toBe(0);
    expect(result.continueLoop).toBe(false);
    expect(result.summary).toContain('AI call budget reached');
    expect(result.summary).not.toBe('No selectable feature remains.');
  });
});
