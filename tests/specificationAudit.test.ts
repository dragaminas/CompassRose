import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { DEFAULT_COMPETENCY_PROFILE } from '../src/contracts/brainstormer/competency.js';
import { copyContractsIntoWorkspace, readFixtureConfigMarkdown } from './testUtils.js';
import type { BrainstormTurnRecord, SpecificationAudit } from '../src/contracts/brainstormer/brainstormerContracts.js';
import type { SessionCompetencyProfile } from '../src/contracts/brainstormer/competency.js';

// 024-specification-flow's one unenforceable claim: that the agent surfaces a decision when a real
// choice arises on an axis the human owns. Nothing made it. And at the moment of the turn there is
// nothing to check -- a turn that quietly decided produces `decision: null` and a good reply, which
// is exactly what a turn where nothing forked produces.
//
// The audit moves the question to `/crear`, where two artifacts exist instead of none: the drafted
// specification and the transcript. "This document asserts X and nobody ever said X" is a
// detectable absence in a way "the model should have asked" is not.

const FEATURE_ID = '800-audit-target';

interface Workspace {
  readonly root: string;
  readonly definitionPath: string;
  readonly dispose: () => void;
}

function writeAuditMock(root: string, audit: SpecificationAudit): string {
  const path = join(root, 'codex-mock-audit.cjs');
  writeFileSync(
    path,
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
const outputPath = outputIndex === -1 ? null : args[outputIndex + 1];
fs.appendFileSync(${JSON.stringify(join(root, 'codex-calls.log'))}, 'called\\n', 'utf8');
if (outputPath) {
  fs.writeFileSync(outputPath, ${JSON.stringify(`${JSON.stringify(audit, null, 2)}\n`)}, 'utf8');
}
process.exit(0);
`,
    'utf8',
  );
  chmodSync(path, 0o755);
  return path;
}

function countCodexCalls(root: string): number {
  try {
    return readFileSync(join(root, 'codex-calls.log'), 'utf8').split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

const FEATURE_STATE = [
  '# State: Audit Target',
  '',
  '## Lifecycle State',
  '',
  'awaiting_validation',
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
  '- last_implementation_result: not_run',
  '- last_quality_gate_result: unknown',
  '- last_review_result: not_run',
  '- validation: pending',
  '',
  '## Current Reality',
  '',
  'Fixture.',
  '',
  '## Blocked By',
  '',
  '- None',
  '',
  '## Blocked From',
  '',
  '- lifecycle_state: none',
  '- active_task: none',
  '- active_correction_task: none',
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
].join('\n');

function createWorkspace(): Workspace {
  const root = mkdtempSync(join(tmpdir(), 'compassrose-audit-'));
  const featureDirectory = join(root, 'compassrose', 'features', FEATURE_ID);
  mkdirSync(join(featureDirectory, 'tasks'), { recursive: true });

  writeFileSync(join(root, 'compassrose', 'CONFIG.md'), readFixtureConfigMarkdown(), 'utf8');
  writeFileSync(join(root, 'compassrose', 'PROJECT_STATE.md'), PROJECT_STATE, 'utf8');
  writeFileSync(join(featureDirectory, 'request.md'), '# Request\n\nA thing.\n', 'utf8');
  writeFileSync(
    join(featureDirectory, 'feature.md'),
    '# Feature: Audit Target\n\n## Purpose\n\nStore the notes in a local SQLite file.\n',
    'utf8',
  );
  writeFileSync(join(featureDirectory, 'architecture.md'), '# Architecture\n', 'utf8');
  writeFileSync(join(featureDirectory, 'state.md'), FEATURE_STATE, 'utf8');
  copyContractsIntoWorkspace(root);

  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '--quiet', '-m', 'initial commit'], { cwd: root });

  return {
    root,
    definitionPath: join(featureDirectory, 'feature.md'),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

const TRANSCRIPT: readonly BrainstormTurnRecord[] = [
  { role: 'human', text: 'I want somewhere to keep my notes.', recorded_at: '2026-08-23T00:00:00.000Z' },
  { role: 'assistant', text: 'Understood.', recorded_at: '2026-08-23T00:00:01.000Z' },
];

describe('auditing a drafted specification against the conversation', () => {
  let workspace: Workspace | null = null;

  afterEach(() => {
    workspace?.dispose();
    workspace = null;
    vi.unstubAllEnvs();
  });

  function buildOrchestrator(): CompassRoseOrchestrator {
    return new CompassRoseOrchestrator({
      loop: false,
      commit: false,
      cwd: (workspace as Workspace).root,
      implementer: 'opencode',
    });
  }

  test('reports a commitment the specification makes and the conversation never supports', () => {
    workspace = createWorkspace();
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', writeAuditMock(workspace.root, {
      unsourced_claims: [{
        claim: 'Notes are stored in a local SQLite file.',
        axis: 'architecture',
        why_it_needed_a_human: 'Where the data lives decides whether it can ever be shared between machines.',
      }],
    }));

    const claims = buildOrchestrator().auditSpecificationDecisions(FEATURE_ID, TRANSCRIPT, DEFAULT_COMPETENCY_PROFILE);

    expect(claims).toHaveLength(1);
    expect(claims[0]?.claim).toContain('SQLite');
  });

  test('never spends a call when the human owns no axis', () => {
    // Nothing to find: every claim being the agent's is what was asked for, not something that
    // slipped past anyone.
    workspace = createWorkspace();
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', writeAuditMock(workspace.root, { unsourced_claims: [] }));

    const agentOwnsEverything: SessionCompetencyProfile = {
      product: 'agent',
      architecture: 'agent',
      implementation: 'agent',
    };

    expect(buildOrchestrator().auditSpecificationDecisions(FEATURE_ID, TRANSCRIPT, agentOwnsEverything)).toEqual([]);
    expect(countCodexCalls(workspace.root)).toBe(0);
  });

  test('drops a claim on an axis the agent owns, whatever the call returns', () => {
    // The schema permits all three axes. A claim on an axis the agent owns would accuse it of
    // exactly what it was told to do, so the filter is applied again on this side.
    workspace = createWorkspace();
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', writeAuditMock(workspace.root, {
      unsourced_claims: [
        { claim: 'The document uses a JSON schema.', axis: 'implementation', why_it_needed_a_human: 'n/a' },
        { claim: 'Notes are per-user.', axis: 'product', why_it_needed_a_human: 'It decides who the app is for.' },
      ],
    }));

    // DEFAULT_COMPETENCY_PROFILE: the human owns product and architecture, the agent owns
    // implementation detail.
    const claims = buildOrchestrator().auditSpecificationDecisions(FEATURE_ID, TRANSCRIPT, DEFAULT_COMPETENCY_PROFILE);

    expect(claims.map((claim) => claim.axis)).toEqual(['product']);
  });

  test('caps what one audit may report', () => {
    // A provenance section listing forty unchosen commitments is one nobody reads, and a draft
    // with forty of them does not need a longer list.
    workspace = createWorkspace();
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', writeAuditMock(workspace.root, {
      unsourced_claims: Array.from({ length: 25 }, (_, index) => ({
        claim: `Commitment ${index}`,
        axis: 'product' as const,
        why_it_needed_a_human: 'It forks the product.',
      })),
    }));

    expect(buildOrchestrator().auditSpecificationDecisions(FEATURE_ID, TRANSCRIPT, DEFAULT_COMPETENCY_PROFILE))
      .toHaveLength(10);
  });
});

describe('what the provenance section records', () => {
  let workspace: Workspace | null = null;

  afterEach(() => {
    workspace?.dispose();
    workspace = null;
  });

  function record(
    decisions: Parameters<CompassRoseOrchestrator['recordSpecificationProvenance']>[2],
    unsourced: Parameters<CompassRoseOrchestrator['recordSpecificationProvenance']>[3],
  ): string {
    const orchestrator = new CompassRoseOrchestrator({
      loop: false,
      commit: false,
      cwd: (workspace as Workspace).root,
      implementer: 'opencode',
    });
    orchestrator.recordSpecificationProvenance(FEATURE_ID, DEFAULT_COMPETENCY_PROFILE, decisions, unsourced);
    return readFileSync((workspace as Workspace).definitionPath, 'utf8');
  }

  test('keeps "you declined" and "you were never asked" as separate lists', () => {
    // Both are the agent's decision. They are not the same fact about the document, and the second
    // is the one worth being able to find later.
    workspace = createWorkspace();

    const markdown = record(
      [{ question: 'Which store?', axis: 'architecture', chosen: 'SQLite', decided_by: 'agent' }],
      [{ claim: 'Notes are per-user.', axis: 'product', why_it_needed_a_human: 'It decides who the app is for.' }],
    );

    expect(markdown).toContain('Decisions taken while specifying it:');
    expect(markdown).toContain('Which store? -> SQLite (architecture, decided by the agent)');
    expect(markdown).toContain('Decided without asking, found by auditing this draft against the conversation:');
    expect(markdown).toContain('Notes are per-user. (product) — It decides who the app is for.');
  });

  test('says nothing about unasked decisions when the audit found none', () => {
    workspace = createWorkspace();

    const markdown = record([], []);

    expect(markdown).toContain('No decision was raised while specifying it');
    expect(markdown).not.toContain('Decided without asking');
  });
});
