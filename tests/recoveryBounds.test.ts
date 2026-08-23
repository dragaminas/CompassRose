import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test } from 'vitest';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import {
  MAX_RECOVERY_RETRIES,
  availableExits,
  type RecoveryExit,
  type StoredRecoveryDiagnosis,
} from '../src/contracts/runtime/recoveryDiagnosis.js';
import { copyContractsIntoWorkspace, readFixtureConfigMarkdown } from './testUtils.js';
import type { StepExecutionResult } from '../src/contracts/runtime/protoRuntime.js';

// 026-conversational-doctor-recovery: the conversation replaced a pipeline that had no ceiling and
// asked no questions. These pin the ceilings the conversation declares for itself, and the one exit
// of the four that had no wiring.

const FEATURE_ID = '600-recovery-target';
const ALL_EXITS: readonly RecoveryExit[] = ['retry', 'correct_specification', 'open_fix', 'resolve_by_hand'];

interface Workspace {
  readonly root: string;
  readonly statePath: string;
  readonly dispose: () => void;
}

function featureState(options: { blockerSignature?: string } = {}): string {
  const signature = options.blockerSignature ?? 'quality-failure-F600-T01';
  return [
    '# State: Recovery Target',
    '',
    '## Lifecycle State',
    '',
    'blocked',
    '',
    '## Source Request',
    '',
    '`request.md`',
    '',
    '## Operational Status',
    '',
    '- formalization: complete',
    '- active_task: none',
    '- active_correction_task: none',
    '- last_implementation_result: failed',
    '- last_quality_gate_result: failed',
    '- last_review_result: blocked',
    '- validation: confirmed',
    '- human_ack_required: true',
    '',
    '## Current Reality',
    '',
    'Fixture.',
    '',
    '## Blocked By',
    '',
    // state_corruption with a recorded Blocked From anchor is the one diagnosis path that is
    // fully deterministic, so these tests exercise the bound without an agent anywhere near them.
    '- kind: state_corruption',
    `- signature: ${signature}`,
    '- recoverability: human',
    '- observed_state: lifecycle=blocked; active_task=F600-T01',
    '- evidence: the gate failed twice on the same assertion',
    '',
    '## Blocked From',
    '',
    '- lifecycle_state: `task_ready`',
    '- active_task: `F600-T01`',
    '- active_correction_task: `none`',
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
    'Fixture.',
    '',
  ].join('\n');
}

const PROJECT_STATE = [
  '# CompassRose Project State',
  '',
  '## Status',
  '',
  'active',
  '',
  '## Active Feature',
  '',
  `\`${FEATURE_ID}\``,
  '',
  '## Current Reality',
  '',
  '- Fixture.',
  '',
  '## Implemented',
  '',
  '- Nothing yet.',
  '',
  '## Pending',
  '',
  '- Nothing pending.',
  '',
  '## Blocked',
  '',
  `- \`${FEATURE_ID}\``,
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
].join('\n');

function createWorkspace(options: { blockerSignature?: string } = {}): Workspace {
  const root = mkdtempSync(join(tmpdir(), 'compassrose-recovery-'));
  const featureDirectory = join(root, 'compassrose', 'features', FEATURE_ID);
  mkdirSync(join(featureDirectory, 'tasks'), { recursive: true });
  mkdirSync(join(root, 'compassrose', 'fixes'), { recursive: true });

  writeFileSync(join(root, 'compassrose', 'CONFIG.md'), readFixtureConfigMarkdown(), 'utf8');
  writeFileSync(join(root, 'compassrose', 'PROJECT_STATE.md'), PROJECT_STATE, 'utf8');
  writeFileSync(join(featureDirectory, 'request.md'), '# Request\n', 'utf8');
  writeFileSync(join(featureDirectory, 'feature.md'), '# Feature\n', 'utf8');
  writeFileSync(join(featureDirectory, 'architecture.md'), '# Architecture\n', 'utf8');
  writeFileSync(join(featureDirectory, 'state.md'), featureState(options), 'utf8');
  copyContractsIntoWorkspace(root);

  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '--quiet', '-m', 'initial commit'], { cwd: root });

  return {
    root,
    statePath: join(featureDirectory, 'state.md'),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

function buildOrchestrator(workspace: Workspace): CompassRoseOrchestrator {
  return new CompassRoseOrchestrator({
    loop: true,
    commit: false,
    cwd: workspace.root,
    implementer: 'opencode',
  });
}

function seedDiagnosis(workspace: Workspace, signature: string, retriesTaken: number): void {
  const path = join(workspace.root, '.git', 'proto-compassrose', 'recovery-diagnoses', `${FEATURE_ID}.json`);
  mkdirSync(join(workspace.root, '.git', 'proto-compassrose', 'recovery-diagnoses'), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({
      diagnosis: {
        item_id: FEATURE_ID,
        hypotheses: [
          { summary: 'a', evidence: ['e'], discriminating_question: 'q', suggested_exit: 'retry' },
          { summary: 'b', evidence: ['e'], discriminating_question: 'q', suggested_exit: 'open_fix' },
        ],
      },
      generated_at: '2026-08-23T00:00:00.000Z',
      blocker_signature: signature,
      retries_taken: retriesTaken,
    } satisfies StoredRecoveryDiagnosis),
    'utf8',
  );
}

describe('the retry budget', () => {
  test('narrows only retry, and only once the budget is spent', () => {
    // The other three stay reachable forever: a specification can always be wrong, a root cause can
    // always be elsewhere, and a human can always fix something by hand.
    expect(availableExits(ALL_EXITS, 0)).toEqual(ALL_EXITS);
    expect(availableExits(ALL_EXITS, MAX_RECOVERY_RETRIES - 1)).toEqual(ALL_EXITS);
    expect(availableExits(ALL_EXITS, MAX_RECOVERY_RETRIES)).toEqual([
      'correct_specification',
      'open_fix',
      'resolve_by_hand',
    ]);
  });

  let workspace: Workspace | null = null;

  afterEach(() => {
    workspace?.dispose();
    workspace = null;
  });

  test('counts retries against the blocker, not the item', () => {
    workspace = createWorkspace({ blockerSignature: 'sig-A' });
    seedDiagnosis(workspace, 'sig-A', 2);
    const orchestrator = buildOrchestrator(workspace);

    expect(orchestrator.recoveryRetriesTaken(FEATURE_ID)).toBe(2);
  });

  test('a different blocker starts from zero', () => {
    // Forward progress changes the signature by construction, which is what makes the budget
    // self-releasing rather than something a human has to clear.
    workspace = createWorkspace({ blockerSignature: 'sig-B' });
    seedDiagnosis(workspace, 'sig-A', MAX_RECOVERY_RETRIES);
    const orchestrator = buildOrchestrator(workspace);

    expect(orchestrator.recoveryRetriesTaken(FEATURE_ID)).toBe(0);
  });

  test('taking retry increments the budget instead of clearing the record it lives in', () => {
    // The retry path used to null this artifact, which would have reset the budget on every retry
    // and made the bound unreachable by construction.
    workspace = createWorkspace({ blockerSignature: 'sig-A' });
    seedDiagnosis(workspace, 'sig-A', 1);
    const orchestrator = buildOrchestrator(workspace);

    orchestrator.retryWithContext(FEATURE_ID, 'the fixture server was down');

    const stored = JSON.parse(
      readFileSync(
        join(workspace.root, '.git', 'proto-compassrose', 'recovery-diagnoses', `${FEATURE_ID}.json`),
        'utf8',
      ),
    ) as StoredRecoveryDiagnosis;
    expect(stored.retries_taken).toBe(2);
    expect(stored.blocker_signature).toBe('sig-A');

    const state = readFileSync(workspace.statePath, 'utf8');
    expect(state).toContain('the fixture server was down');
  });
});

describe('the open_fix exit', () => {
  let workspace: Workspace | null = null;

  afterEach(() => {
    workspace?.dispose();
    workspace = null;
  });

  test('files a fix from what the human said and blocks the item on it', () => {
    workspace = createWorkspace();
    const orchestrator = buildOrchestrator(workspace);

    const fixId = orchestrator.openFixFromConversation(
      FEATURE_ID,
      'the test harness leaks a port',
      'Every second run fails because the previous server is still bound to 8080.',
    );

    const fixDirectory = join(workspace.root, 'compassrose', 'fixes', fixId);
    expect(readdirSync(fixDirectory)).toContain('request.md');
    const request = readFileSync(join(fixDirectory, 'request.md'), 'utf8');
    // The evidence is a person's account, recorded as theirs: a fix filed from a conversation is
    // not the runtime's own diagnosis and must not read like one.
    expect(request).toContain('Reported by a human during a recovery conversation');
    expect(request).toContain('still bound to 8080');

    const state = readFileSync(workspace.statePath, 'utf8');
    expect(state).toContain(`blocked_on_fix: ${fixId}`);
    // Cleared so the fix's completion can resume this item with no further human action -- which is
    // the whole reason this exit is worth having over "resolve by hand".
    expect(state).toContain('human_ack_required: none');
    expect(state).toContain(`blocked on fix \`${fixId}\``);
  });

  test('refuses to file a fix nobody could work from', () => {
    workspace = createWorkspace();
    const orchestrator = buildOrchestrator(workspace);

    expect(() => orchestrator.openFixFromConversation(FEATURE_ID, 'something', '   ')).toThrow(
      /needs both a title and a description/,
    );
    expect(() => orchestrator.openFixFromConversation(FEATURE_ID, '  ', 'something is wrong')).toThrow(
      /needs both a title and a description/,
    );
  });
});

describe('diagnosis is bounded to one attempt per blocker', () => {
  let workspace: Workspace | null = null;

  afterEach(() => {
    workspace?.dispose();
    workspace = null;
  });

  function diagnose(orchestrator: CompassRoseOrchestrator): StepExecutionResult {
    return (orchestrator as unknown as {
      diagnoseAndAutocorrect: (id: string, reason: string) => StepExecutionResult;
    }).diagnoseAndAutocorrect(FEATURE_ID, 'quality gates failed');
  }

  test('a second diagnosis of the same blocker blocks for a conversation instead of spending a call', () => {
    workspace = createWorkspace({ blockerSignature: 'sig-A' });
    mkdirSync(join(workspace.root, '.git', 'proto-compassrose', 'diagnostic-attempts'), { recursive: true });
    writeFileSync(
      join(workspace.root, '.git', 'proto-compassrose', 'diagnostic-attempts', `${FEATURE_ID}.json`),
      JSON.stringify({ signature: 'sig-A', attempts: 1 }),
      'utf8',
    );

    // No codex command is stubbed: if this path tried to diagnose, it would fail loudly rather
    // than quietly returning a blocked result.
    const result = diagnose(buildOrchestrator(workspace));

    expect(result.kind).toBe('blocked');
    expect(result.summary).toContain('already ran against this exact blocker');
    expect(result.summary).toContain('/desbloquear');

    const state = readFileSync(workspace.statePath, 'utf8');
    expect(state).toContain('human_ack_required: true');
  });

  test('a different blocker is diagnosed on its own budget', () => {
    workspace = createWorkspace({ blockerSignature: 'sig-B' });
    mkdirSync(join(workspace.root, '.git', 'proto-compassrose', 'diagnostic-attempts'), { recursive: true });
    writeFileSync(
      join(workspace.root, '.git', 'proto-compassrose', 'diagnostic-attempts', `${FEATURE_ID}.json`),
      JSON.stringify({ signature: 'sig-A', attempts: 1 }),
      'utf8',
    );

    const result = diagnose(buildOrchestrator(workspace));

    // It got past the bound and reached real diagnosis, which for a human-recoverability blocker
    // with no agent available ends in its own blocked result -- but not this one.
    expect(result.summary).not.toContain('already ran against this exact blocker');
  });

  test('the first diagnosis records the attempt it just spent', () => {
    workspace = createWorkspace({ blockerSignature: 'sig-C' });

    diagnose(buildOrchestrator(workspace));

    const recorded = JSON.parse(
      readFileSync(
        join(workspace.root, '.git', 'proto-compassrose', 'diagnostic-attempts', `${FEATURE_ID}.json`),
        'utf8',
      ),
    ) as { signature: string; attempts: number };
    expect(recorded).toEqual({ signature: 'sig-C', attempts: 1 });
  });
});
