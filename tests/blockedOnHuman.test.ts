import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import type { StepDecision } from '../src/contracts/runtime/stepDecision.js';
import type { WorkItemInspectionKind } from '../src/contracts/runtime/protoRuntime.js';
import { copyContractsIntoWorkspace, readFixtureConfigMarkdown } from './testUtils.js';

// Regression coverage for the structural fix found dogfooding 003-doctor-command live
// (2026-08-21): a 'blocked' feature/fix whose recorded BlockerProfile.recoverability is
// 'human'/'terminal' must be fully excluded from both scheduler passes -- mirroring how
// 'blocked_on_fix' is already excluded -- instead of being re-diagnosed (spending an AI ensemble
// call) every single run only to re-trip the same exhausted limit and re-print the same card.
// The only deterministic way back in is CompassRoseOrchestrator.acknowledgeBlocker(), the human-
// explicit-action gate this file also covers.

function createWorkspace(): { root: string; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'compassrose-blocked-on-human-'));
  mkdirSync(join(root, '.git'), { recursive: true });
  mkdirSync(join(root, 'compassrose'), { recursive: true });
  writeFileSync(join(root, 'compassrose', 'CONFIG.md'), readFixtureConfigMarkdown(), 'utf8');
  writeFileSync(
    join(root, 'compassrose', 'PROJECT_STATE.md'),
    [
      '# CompassRose Project State',
      '',
      '## Status',
      '',
      'active',
      '',
      '## Active Feature',
      '',
      '`none`',
      '',
      '## Current Reality',
      '',
      '- Fixture workspace for blocked_on_human tests.',
      '',
      '## Pending',
      '',
      '- Nothing pending.',
      '',
      '## Blocked',
      '',
      '- Nothing blocked.',
      '',
      '## Last Approved Change',
      '',
      'None yet.',
      '',
      '## Known Gaps',
      '',
      'None.',
      '',
      '## Next Planning Hint',
      '',
      'None.',
      '',
    ].join('\n'),
    'utf8',
  );
  copyContractsIntoWorkspace(root);
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

function featureState(input: {
  lifecycleState: string;
  activeTask?: string;
  blockedBy?: readonly string[];
  blockedFrom?: { lifecycleState: string; activeTask: string };
  humanAckRequired?: boolean;
}): string {
  const activeTask = input.activeTask ?? 'none';
  const blockedBy = input.blockedBy ?? ['- None'];
  const blockedFrom = input.blockedFrom
    ? [
        `- lifecycle_state: ${input.blockedFrom.lifecycleState}`,
        `- active_task: ${input.blockedFrom.activeTask}`,
        '- active_correction_task: none',
      ]
    : [
        '- lifecycle_state: none',
        '- active_task: none',
        '- active_correction_task: none',
      ];

  return [
    '# State: Fixture Feature',
    '',
    '## Lifecycle State',
    '',
    input.lifecycleState,
    '',
    '## Source Request',
    '',
    '`request.md`',
    '',
    '## Operational Status',
    '',
    '- formalization: complete',
    `- active_task: ${activeTask}`,
    '- active_correction_task: none',
    '- last_implementation_result: not_run',
    '- last_quality_gate_result: unknown',
    '- last_review_result: not_run',
    `- human_ack_required: ${input.humanAckRequired ? 'true' : 'none'}`,
    '',
    '## Current Reality',
    '',
    'Fixture state.',
    '',
    '## Implemented Deliverables',
    '',
    '- none',
    '',
    '## Remaining Deliverables',
    '',
    '- none',
    '',
    '## Outline Progress',
    '',
    '- none',
    '',
    '## Blocked By',
    '',
    ...blockedBy,
    '',
    '## Blocked From',
    '',
    ...blockedFrom,
    '',
    '## Last Approved Change',
    '',
    'None yet.',
    '',
    '## Known Gaps',
    '',
    '- None',
    '',
    '## Next Planning Hint',
    '',
    'Fixture next step.',
    '',
  ].join('\n');
}

function seedFeature(root: string, id: string, state: string): void {
  const dir = join(root, 'compassrose', 'features', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'request.md'), `# Request: ${id}\n`, 'utf8');
  writeFileSync(join(dir, 'feature.md'), `# Feature: ${id}\n\n## Purpose\n\nFixture.\n`, 'utf8');
  writeFileSync(join(dir, 'architecture.md'), `# Architecture: ${id}\n`, 'utf8');
  writeFileSync(join(dir, 'state.md'), state, 'utf8');
}

interface Access {
  determineNextStep(): StepDecision;
  listFeatures(): readonly { id: string; statePath: string }[];
  inspectFeature(feature: { id: string; statePath: string }): { kind: WorkItemInspectionKind };
}

function inspectById(orchestrator: Access, id: string): WorkItemInspectionKind {
  const feature = orchestrator.listFeatures().find((candidate) => candidate.id === id);
  if (!feature) {
    throw new Error(`Fixture feature ${id} not found.`);
  }
  return orchestrator.inspectFeature(feature).kind;
}

function buildOrchestrator(root: string): CompassRoseOrchestrator & Access {
  return new CompassRoseOrchestrator({ loop: false, commit: false, cwd: root, implementer: 'opencode' }) as CompassRoseOrchestrator & Access;
}

describe('blocked_on_human scheduling exclusion', () => {
  test('a blocked feature with agent recoverability is still selected for diagnose_autocorrect (no regression)', () => {
    const workspace = createWorkspace();
    try {
      seedFeature(
        workspace.root,
        '001-fixture',
        featureState({
          lifecycleState: 'blocked',
          blockedBy: [
            '- kind: implementation_failure',
            '- signature: implementation-failure-fixture',
            '- recoverability: agent',
            '- observed_state: lifecycle=blocked',
            '- evidence: transient failure',
            '- reason: transient failure',
          ],
        }),
      );

      const decision = buildOrchestrator(workspace.root).determineNextStep();

      expect(decision.kind).toBe('diagnose_autocorrect');
      expect(decision.feature_id).toBe('001-fixture');
    } finally {
      workspace.dispose();
    }
  });

  test('a blocked feature marked human_ack_required is inspected as blocked_on_human and never selected', () => {
    const workspace = createWorkspace();
    try {
      seedFeature(
        workspace.root,
        '001-fixture',
        featureState({
          lifecycleState: 'blocked',
          humanAckRequired: true,
          blockedBy: [
            '- kind: implementation_failure',
            '- signature: implementation-failure-fixture',
            '- recoverability: human',
            '- observed_state: lifecycle=blocked',
            '- evidence: exhausted recovery',
            '- reason: Doctor recovery iteration limit reached for feature 001-fixture after 3 attempt(s).',
          ],
        }),
      );

      const orchestrator = buildOrchestrator(workspace.root);
      expect(inspectById(orchestrator, '001-fixture')).toBe('blocked_on_human');

      const decision = orchestrator.determineNextStep();
      expect(decision.kind).toBe('stop');
      expect(decision.reason).toContain('blocked pending human acknowledgment');
      expect(decision.reason).toContain('001-fixture');
      expect(decision.reason).toContain('npm run acknowledge-blocker');
    } finally {
      workspace.dispose();
    }
  });

  test('a blocked feature with human/terminal recoverability but NOT yet marked exhausted is still selected for diagnose_autocorrect (first pass must be allowed to file a systemic fix)', () => {
    const workspace = createWorkspace();
    try {
      seedFeature(
        workspace.root,
        '001-fixture',
        featureState({
          lifecycleState: 'blocked',
          blockedBy: [
            '- kind: state_corruption',
            '- signature: state-corruption-fixture',
            '- recoverability: terminal',
            '- observed_state: lifecycle=unknown',
            '- evidence: state.md missing',
            '- reason: state.md missing',
          ],
        }),
      );

      const decision = buildOrchestrator(workspace.root).determineNextStep();
      expect(decision.kind).toBe('diagnose_autocorrect');
      expect(decision.feature_id).toBe('001-fixture');
    } finally {
      workspace.dispose();
    }
  });
});

describe('acknowledgeBlocker', () => {
  test('restores the recorded Blocked From target, clears Blocked By/Blocked From, and lifts the exclusion', () => {
    const workspace = createWorkspace();
    try {
      seedFeature(
        workspace.root,
        '001-fixture',
        featureState({
          lifecycleState: 'blocked',
          humanAckRequired: true,
          blockedBy: [
            '- kind: implementation_failure',
            '- signature: implementation-failure-fixture',
            '- recoverability: human',
            '- observed_state: lifecycle=blocked',
            '- evidence: exhausted recovery',
            '- reason: Doctor recovery iteration limit reached for feature 001-fixture after 3 attempt(s).',
          ],
          blockedFrom: { lifecycleState: 'implementation_running', activeTask: 'F001-T01' },
        }),
      );

      const orchestrator = buildOrchestrator(workspace.root);
      const statePath = join(workspace.root, 'compassrose', 'features', '001-fixture', 'state.md');
      expect(inspectById(orchestrator, '001-fixture')).toBe('blocked_on_human');

      orchestrator.acknowledgeBlocker('001-fixture');

      const stateAfter = readFileSync(statePath, 'utf8');
      expect(stateAfter).toContain('## Lifecycle State\n\nimplementation_running');
      expect(stateAfter).toContain('- active_task: F001-T01');
      expect(stateAfter).toContain('## Blocked By\n\n- None');
      expect(stateAfter).toContain('- lifecycle_state: none');

      const projectStateAfter = readFileSync(join(workspace.root, 'compassrose', 'PROJECT_STATE.md'), 'utf8');
      expect(projectStateAfter).toContain('001-fixture');

      expect(inspectById(orchestrator, '001-fixture')).not.toBe('blocked_on_human');
    } finally {
      workspace.dispose();
    }
  });

  test('throws when the feature is not currently blocked_on_human', () => {
    const workspace = createWorkspace();
    try {
      seedFeature(workspace.root, '001-fixture', featureState({ lifecycleState: 'formalized' }));
      const orchestrator = buildOrchestrator(workspace.root);

      expect(() => orchestrator.acknowledgeBlocker('001-fixture')).toThrow(/not currently blocked_on_human/);
    } finally {
      workspace.dispose();
    }
  });

  test('throws when the feature is blocked with agent recoverability, not human/terminal', () => {
    const workspace = createWorkspace();
    try {
      seedFeature(
        workspace.root,
        '001-fixture',
        featureState({
          lifecycleState: 'blocked',
          blockedBy: [
            '- kind: implementation_failure',
            '- signature: implementation-failure-fixture',
            '- recoverability: agent',
            '- observed_state: lifecycle=blocked',
            '- evidence: transient failure',
            '- reason: transient failure',
          ],
        }),
      );
      const orchestrator = buildOrchestrator(workspace.root);

      expect(() => orchestrator.acknowledgeBlocker('001-fixture')).toThrow(/not currently blocked_on_human/);
    } finally {
      workspace.dispose();
    }
  });
});

describe('listHumanBlockedWorkItems', () => {
  test('lists only blocked_on_human features, not plain blocked or agent-recoverable ones', () => {
    const workspace = createWorkspace();
    try {
      seedFeature(
        workspace.root,
        '001-human',
        featureState({
          lifecycleState: 'blocked',
          humanAckRequired: true,
          blockedBy: [
            '- kind: implementation_failure',
            '- signature: implementation-failure-001',
            '- recoverability: human',
            '- observed_state: lifecycle=blocked',
            '- evidence: exhausted',
            '- reason: exhausted',
          ],
        }),
      );
      seedFeature(
        workspace.root,
        '002-agent',
        featureState({
          lifecycleState: 'blocked',
          blockedBy: [
            '- kind: implementation_failure',
            '- signature: implementation-failure-002',
            '- recoverability: agent',
            '- observed_state: lifecycle=blocked',
            '- evidence: transient',
            '- reason: transient',
          ],
        }),
      );

      const orchestrator = buildOrchestrator(workspace.root);
      const ids = orchestrator.listHumanBlockedWorkItems().map((item) => item.id);

      expect(ids).toEqual(['001-human']);
      expect(existsSync(join(workspace.root, 'compassrose', 'features', '002-agent'))).toBe(true);
    } finally {
      workspace.dispose();
    }
  });
});
