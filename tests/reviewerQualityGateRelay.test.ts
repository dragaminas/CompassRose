import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { QualityGateResult } from '../src/contracts/runtime/attempts.js';
import type { ReviewerOutput } from '../src/contracts/reviewer/reviewerContracts.js';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { copyContractsIntoWorkspace, createTempWorkspace, readFixtureConfigMarkdown, type TempWorkspace } from './testUtils.js';

// Covers verifyReviewerQualityGateRelay() (see ADR-0039): an `approved` review is only trusted
// when its own relay of the quality-gate facts it was handed matches the ground truth the
// orchestrator already computed deterministically.

const PROJECT_STATE_SEED = `# CompassRose Project State

## Status

active

## Active Feature

\`none\`

## Current Reality

- Fixture workspace for reviewer quality-gate relay tests.

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

function createWorkspace(): TempWorkspace {
  const workspace = createTempWorkspace({
    files: {
      'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
      'compassrose/PROJECT_STATE.md': PROJECT_STATE_SEED,
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

function approvedReview(overrides: Partial<ReviewerOutput['quality_gate_check']> = {}): ReviewerOutput {
  return {
    task_id: 'F001-T01',
    status: 'approved',
    summary: 'Looks good.',
    acceptance: { criteria: [] },
    findings: [],
    scope_check: { status: 'passed', unrelated_changes: [] },
    quality_gate_check: { status: 'passed', failed_gates: [], ...overrides },
    correction_task: null,
    project_state_update_hint: null,
  };
}

function passedGateResult(name: string): QualityGateResult {
  return { name, command: `echo ${name}`, status: 'passed', output_summary: 'ok' };
}

interface Access {
  verifyReviewerQualityGateRelay(review: ReviewerOutput, qualityResults: readonly QualityGateResult[]): ReviewerOutput;
}

function asAccess(orchestrator: CompassRoseOrchestrator): Access {
  return orchestrator as unknown as Access;
}

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
});

describe('verifyReviewerQualityGateRelay (ADR-0039)', () => {
  test('trusts an approval whose relay matches ground truth (gates ran and passed)', () => {
    workspace = createWorkspace();
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    const review = approvedReview({ status: 'passed' });
    const result = access.verifyReviewerQualityGateRelay(review, [passedGateResult('npm test')]);

    expect(result).toBe(review);
    expect(result.status).toBe('approved');
  });

  test('trusts an approval whose relay matches ground truth (no gates configured)', () => {
    workspace = createWorkspace();
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    const review = approvedReview({ status: 'skipped' });
    const result = access.verifyReviewerQualityGateRelay(review, []);

    expect(result.status).toBe('approved');
  });

  test('also trusts "passed" for zero configured gates -- the contract never mandates "skipped" specifically for that case', () => {
    workspace = createWorkspace();
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    const review = approvedReview({ status: 'passed' });
    const result = access.verifyReviewerQualityGateRelay(review, []);

    expect(result).toBe(review);
    expect(result.status).toBe('approved');
  });

  test('downgrades to blocked when the reviewer claims a gate failed that did not', () => {
    workspace = createWorkspace();
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    const review = approvedReview({ status: 'failed', failed_gates: ['npm test'] });
    const result = access.verifyReviewerQualityGateRelay(review, [passedGateResult('npm test')]);

    expect(result.status).toBe('blocked');
    expect(result.findings.some((finding) => finding.message.includes('does not match'))).toBe(true);
  });

  test('downgrades to blocked when the reviewer claims skipped but gates actually ran', () => {
    workspace = createWorkspace();
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    const review = approvedReview({ status: 'skipped' });
    const result = access.verifyReviewerQualityGateRelay(review, [passedGateResult('npm test')]);

    expect(result.status).toBe('blocked');
  });

  test('downgrades to blocked when the reviewer claims passed but names a failed gate anyway', () => {
    workspace = createWorkspace();
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    const review = approvedReview({ status: 'passed', failed_gates: ['npm run typecheck'] });
    const result = access.verifyReviewerQualityGateRelay(review, [passedGateResult('npm run typecheck')]);

    expect(result.status).toBe('blocked');
  });

  test('does not touch a non-approved review at all', () => {
    workspace = createWorkspace();
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
    const access = asAccess(orchestrator);

    const review: ReviewerOutput = { ...approvedReview({ status: 'failed', failed_gates: ['npm test'] }), status: 'blocked' };
    const result = access.verifyReviewerQualityGateRelay(review, [passedGateResult('npm test')]);

    expect(result).toBe(review);
  });
});
