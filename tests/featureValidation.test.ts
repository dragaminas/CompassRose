import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { StepDecision } from '../src/contracts/runtime/stepDecision.js';
import type { ValidationDecisionPointsOutput, ValidationRoundRecord, ValidationWeight } from '../src/contracts/validator/validatorContracts.js';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { copyContractsIntoWorkspace, createTempWorkspace, readFixtureConfigMarkdown, type TempWorkspace } from './testUtils.js';

// Covers ADR-0046/Flow 1: the awaiting_validation gate (determineNextStep never selects
// plan_task for an unconfirmed feature), confirmFeatureValidation's deterministic writes, and
// classifyValidationWeight's 3-vote ensemble (unanimous/disagreement/unavailable) -- mirroring
// tests/blockerKindEnsemble.test.ts's structure for the analogous ADR-0036/38 ensemble.

const PROJECT_STATE_SEED = `# CompassRose Project State

## Status

active

## Active Feature

\`none\`

## Current Reality

- Fixture workspace for feature-validation tests.

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

function featureMarkdown(): string {
  return `# Feature: Fixture Feature

## Status

Planned

## Purpose

Fixture feature used only by tests/featureValidation.test.ts.

## Implementation Outline

- Placeholder.
`;
}

function featureStateSeed(lifecycleState: string, validation: string): string {
  return `# State: Fixture Feature

## Lifecycle State

${lifecycleState}

## Source Request

\`request.md\`

## Operational Status

- formalization: complete
- validation: ${validation}
- active_task: none
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: not_run
- last_quality_gate_result: unknown
- last_review_result: not_run
- last_unblock_result: not_run

## Current Reality

Fixture state for feature-validation tests.

## Implemented Deliverables

- None yet.

## Remaining Deliverables

- None yet.

## Outline Progress

- Fixture task request: not started

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none
- active_unblock_task: none

## Last Approved Change

None

## Known Gaps

- None

## Next Planning Hint

None
`;
}

function createWorkspace(featureId: string, validation: string): TempWorkspace {
  const workspace = createTempWorkspace({
    files: {
      'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
      'compassrose/PROJECT_STATE.md': PROJECT_STATE_SEED,
      [`compassrose/features/${featureId}/request.md`]: '# Request: Fixture Feature\n\nFixture request document.\n',
      [`compassrose/features/${featureId}/feature.md`]: featureMarkdown(),
      [`compassrose/features/${featureId}/architecture.md`]: `# Architecture: Fixture Feature\n\nFixture architecture document.\n`,
      [`compassrose/features/${featureId}/state.md`]: featureStateSeed('formalized', validation),
    },
  });
  copyContractsIntoWorkspace(workspace.root);

  execFileSync('git', ['init', '--quiet'], { cwd: workspace.root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspace.root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspace.root });
  execFileSync('git', ['add', '-A'], { cwd: workspace.root });
  execFileSync('git', ['commit', '--quiet', '-m', 'initial commit'], { cwd: workspace.root });

  return workspace;
}

// Mirrors writeSequentialClassifierMock() in tests/blockerKindEnsemble.test.ts: returns a fixed
// `weight` for the Nth ensemble call (1-indexed), cycling through `weights` -- e.g.
// ['bounded','bounded','bounded'] simulates unanimous agreement.
function writeSequentialWeightMock(root: string, weights: readonly ValidationWeight[]): string {
  const scriptPath = join(root, 'codex-mock-weight.cjs');
  const counterPath = join(root, 'weight-mock-counter.txt');
  writeFileSync(counterPath, '0', 'utf8');
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
const outputPath = outputIndex === -1 ? null : args[outputIndex + 1];
const weights = ${JSON.stringify(weights)};
const counterPath = ${JSON.stringify(counterPath)};
const index = Number(fs.readFileSync(counterPath, 'utf8'));
fs.writeFileSync(counterPath, String(index + 1), 'utf8');
const payload = { weight: weights[index % weights.length], rationale: 'mock ensemble vote ' + index };
if (outputPath) {
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\\n', 'utf8');
}
process.exit(0);
`;
  writeFileSync(scriptPath, script, 'utf8');
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

function writeDecisionPointsMock(root: string, output: ValidationDecisionPointsOutput): string {
  const scriptPath = join(root, 'codex-mock-decision-points.cjs');
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
const outputPath = outputIndex === -1 ? null : args[outputIndex + 1];
const payload = ${JSON.stringify(output)};
if (outputPath) {
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\\n', 'utf8');
}
process.exit(0);
`;
  writeFileSync(scriptPath, script, 'utf8');
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

interface ValidationAccess {
  determineNextStep(): StepDecision;
}

function asAccess(orchestrator: CompassRoseOrchestrator): ValidationAccess {
  return orchestrator as unknown as ValidationAccess;
}

let workspace: TempWorkspace | undefined;

afterEach(() => {
  vi.unstubAllEnvs();
  workspace?.dispose();
  workspace = undefined;
});

describe('awaiting_validation gate (ADR-0046)', () => {
  test('never selects plan_task for a formalized feature whose validation is not_started', () => {
    workspace = createWorkspace('fixture-feature', 'not_started');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });

    const decision = asAccess(orchestrator).determineNextStep();

    expect(decision.kind).toBe('stop');
    expect(decision.reason).toContain('awaiting human validation');
    expect(decision.reason).toContain('fixture-feature');
    expect(decision.reason).toContain('npm run feature-validation');
  });

  test('selects plan_task once the human has confirmed validation', () => {
    workspace = createWorkspace('fixture-feature', 'confirmed');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });

    const decision = asAccess(orchestrator).determineNextStep();

    expect(decision.kind).toBe('plan_task');
    expect(decision.feature_id).toBe('fixture-feature');
  });

  test('listFeaturesAwaitingValidation reports exactly the gated feature', () => {
    workspace = createWorkspace('fixture-feature', 'not_started');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });

    const pending = orchestrator.listFeaturesAwaitingValidation();

    expect(pending.map((item) => item.id)).toEqual(['fixture-feature']);
  });

  test('listFeaturesAwaitingValidation reports nothing once confirmed', () => {
    workspace = createWorkspace('fixture-feature', 'confirmed');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });

    expect(orchestrator.listFeaturesAwaitingValidation()).toEqual([]);
  });
});

describe('confirmFeatureValidation (ADR-0046)', () => {
  test('writes Validation Decisions, flips the state.md flag, and records a full audit transcript', () => {
    workspace = createWorkspace('fixture-feature', 'not_started');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });

    const transcript: ValidationRoundRecord[] = [
      {
        decision_point: {
          id: 'dp1',
          question: 'Keep the planner\'s assumed storage approach?',
          applies_to: 'architecture',
          options: [
            { id: 'a', label: 'Keep as-is', detail: 'No change to the assumed approach.' },
            { id: 'b', label: 'Use a different store', detail: 'Switch to an alternative.' },
          ],
          recommended_option_id: 'a',
          rationale: 'The planner already grounded this in the existing architecture doc.',
        },
        chosen_option_id: 'a',
        free_text: null,
        answered_at: '2026-01-01T00:00:00.000Z',
      },
    ];

    orchestrator.confirmFeatureValidation('fixture-feature', transcript);

    const featurePath = join(workspace.root, 'compassrose/features/fixture-feature/feature.md');
    const featureMd = readFileSync(featurePath, 'utf8');
    expect(featureMd).toContain('## Validation Decisions');
    expect(featureMd).toContain("Keep the planner's assumed storage approach?");
    expect(featureMd).toContain('Keep as-is');

    const stateMd = readFileSync(join(workspace.root, 'compassrose/features/fixture-feature/state.md'), 'utf8');
    expect(stateMd).toContain('- validation: confirmed');

    const auditPath = join(workspace.root, '.git', 'proto-compassrose', 'validation-decisions', 'fixture-feature.json');
    expect(existsSync(auditPath)).toBe(true);
    const audited = JSON.parse(readFileSync(auditPath, 'utf8'));
    expect(audited).toEqual(transcript);

    const decision = asAccess(orchestrator).determineNextStep();
    expect(decision.kind).toBe('plan_task');
  });

  test('commits the definition and state documents when options.commit is true', () => {
    workspace = createWorkspace('fixture-feature', 'not_started');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: true, cwd: workspace.root, implementer: 'opencode' });

    orchestrator.confirmFeatureValidation('fixture-feature', []);

    const log = execFileSync('git', ['log', '--oneline'], { cwd: workspace.root, encoding: 'utf8' });
    expect(log).toContain('confirm validation for fixture-feature');
  });

  test('renders a placeholder body when no decision points were ever raised', () => {
    workspace = createWorkspace('fixture-feature', 'not_started');
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });

    orchestrator.confirmFeatureValidation('fixture-feature', []);

    const featureMd = readFileSync(join(workspace.root, 'compassrose/features/fixture-feature/feature.md'), 'utf8');
    expect(featureMd).toContain('## Validation Decisions');
    expect(featureMd).toContain('No decision points were raised');
  });
});

describe('classifyValidationWeight ensemble (ADR-0036/0038 pattern)', () => {
  test('trusts a unanimous ensemble vote', () => {
    workspace = createWorkspace('fixture-feature', 'not_started');
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', writeSequentialWeightMock(workspace.root, ['bounded']));
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });

    expect(orchestrator.classifyValidationWeight('fixture-feature')).toBe('bounded');
  });

  test('ties to architectural when the ensemble disagrees', () => {
    workspace = createWorkspace('fixture-feature', 'not_started');
    vi.stubEnv(
      'PROTO_COMPASSROSE_CODEX_COMMAND',
      writeSequentialWeightMock(workspace.root, ['bounded', 'architectural', 'bounded']),
    );
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });

    expect(orchestrator.classifyValidationWeight('fixture-feature')).toBe('architectural');
  });

  test('ties to architectural when the ensemble cannot run at all', () => {
    workspace = createWorkspace('fixture-feature', 'not_started');
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', join(workspace.root, 'compassrose-codex-binary-that-does-not-exist'));
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });

    expect(orchestrator.classifyValidationWeight('fixture-feature')).toBe('architectural');
  });
});

describe('runNextValidationRound (ADR-0046)', () => {
  test('returns the validator\'s proposed decision points', () => {
    workspace = createWorkspace('fixture-feature', 'not_started');
    const proposal: ValidationDecisionPointsOutput = {
      decision_points: [
        {
          id: 'dp1',
          question: 'Confirm the assumed integration boundary?',
          applies_to: 'feature',
          options: [
            { id: 'a', label: 'Keep as-is', detail: 'No change.' },
          ],
          recommended_option_id: 'a',
          rationale: 'Already stated in feature.md.',
        },
      ],
    };
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', writeDecisionPointsMock(workspace.root, proposal));
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });

    const result = orchestrator.runNextValidationRound('fixture-feature', 'bounded', []);

    expect(result).toEqual(proposal);
  });

  test('returns an empty decision_points list once the validator has nothing further to raise', () => {
    workspace = createWorkspace('fixture-feature', 'not_started');
    const proposal: ValidationDecisionPointsOutput = { decision_points: [] };
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', writeDecisionPointsMock(workspace.root, proposal));
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });

    const result = orchestrator.runNextValidationRound('fixture-feature', 'bounded', []);

    expect(result.decision_points).toEqual([]);
  });
});
