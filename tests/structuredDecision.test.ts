import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test } from 'vitest';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { renderDecision, renderProposedDimension } from '../src/session/render/decision.js';
import { DEFAULT_COMPETENCY_PROFILE } from '../src/contracts/brainstormer/competency.js';
import { copyContractsIntoWorkspace, readFixtureConfigMarkdown } from './testUtils.js';
import type { RecordedDecision, StructuredDecision } from '../src/contracts/brainstormer/brainstormerContracts.js';

// 024-specification-flow: the competency profile was threaded through the session and changed
// nothing -- a declaration nobody acted on. A decision the human owns is now surfaced as a choice
// instead of taken as prose, the answer is recorded with who gave it, and the checklist can grow
// from what the conversation reveals. These pin the shapes; the conversation itself is a CLI layer,
// verified by hand like every other one in this repository.

const FEATURE_ID = '800-provenance-target';

function decision(overrides: Partial<StructuredDecision> = {}): StructuredDecision {
  return {
    question: 'Where should the session keep its transcript?',
    axis: 'architecture',
    options: [
      { label: 'In memory only', implies: 'a crash loses the conversation; nothing to clean up' },
      { label: 'In the artifact store', implies: 'survives a crash; one more thing to prune' },
    ],
    recommended_index: 1,
    ...overrides,
  };
}

describe('rendering a decision', () => {
  test('marks the recommendation without selecting it', () => {
    // The distinction is the whole point: a recommendation the human actively accepts leaves a
    // record of a human choosing; a default they have to actively reject does not.
    const lines = renderDecision(decision());

    expect(lines.join('\n')).toContain('2. In the artifact store   ← my recommendation');
    expect(lines.join('\n')).not.toContain('1. In memory only   ←');
  });

  test('says what each option commits the project to, not just what it is called', () => {
    const lines = renderDecision(decision());

    expect(lines.join('\n')).toContain('a crash loses the conversation');
    expect(lines.join('\n')).toContain('survives a crash');
  });

  test('names the axis, so the human knows why they are being asked', () => {
    expect(renderDecision(decision()).join('\n')).toContain('(architecture — yours to decide)');
  });

  test('marks nothing when the agent genuinely has no preference', () => {
    expect(renderDecision(decision({ recommended_index: null })).join('\n')).not.toContain('recommendation');
  });

  test('frames a dimension as a proposal, with why this project needs it', () => {
    const lines = renderProposedDimension({ name: 'offline behavior', why: 'the field app loses signal daily' });

    expect(lines.join('\n')).toContain('offline behavior');
    expect(lines.join('\n')).toContain('loses signal daily');
  });
});

interface Workspace {
  readonly root: string;
  readonly featurePath: string;
  readonly dimensionsPath: string;
  readonly dispose: () => void;
}

function createWorkspace(): Workspace {
  const root = mkdtempSync(join(tmpdir(), 'compassrose-provenance-'));
  const featureDirectory = join(root, 'compassrose', 'features', FEATURE_ID);
  mkdirSync(featureDirectory, { recursive: true });

  writeFileSync(join(root, 'compassrose', 'CONFIG.md'), readFixtureConfigMarkdown(), 'utf8');
  writeFileSync(
    join(root, 'compassrose', 'DIMENSIONS.md'),
    [
      '# Dimensions',
      '',
      '## authentication',
      '',
      '- state: uncovered',
      '- covered_by: none',
      '',
      '### Decisions',
      '',
      '- 2026-08-01 — uncovered — declared by setup — Test',
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(join(featureDirectory, 'request.md'), '# Request\n', 'utf8');
  writeFileSync(join(featureDirectory, 'feature.md'), '# Feature: Provenance Target\n\n## Purpose\n\nFixture.\n', 'utf8');
  writeFileSync(join(featureDirectory, 'architecture.md'), '# Architecture\n', 'utf8');
  writeFileSync(join(featureDirectory, 'state.md'), '# State\n\n## Lifecycle State\n\nformalized\n', 'utf8');
  copyContractsIntoWorkspace(root);

  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '--quiet', '-m', 'initial commit'], { cwd: root });

  return {
    root,
    featurePath: join(featureDirectory, 'feature.md'),
    dimensionsPath: join(root, 'compassrose', 'DIMENSIONS.md'),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe('provenance on the specification', () => {
  let workspace: Workspace | null = null;

  afterEach(() => {
    workspace?.dispose();
    workspace = null;
  });

  function buildOrchestrator(): CompassRoseOrchestrator {
    return new CompassRoseOrchestrator({
      loop: false,
      commit: false,
      cwd: (workspace as Workspace).root,
      implementer: 'opencode',
    });
  }

  test('records who owned each axis and what was decided', () => {
    workspace = createWorkspace();
    const decisions: RecordedDecision[] = [
      { question: 'Where does the transcript live?', axis: 'architecture', chosen: 'artifact store', decided_by: 'human' },
      { question: 'What is the retention?', axis: 'implementation', chosen: '30 days', decided_by: 'agent' },
    ];

    buildOrchestrator().recordSpecificationProvenance(FEATURE_ID, DEFAULT_COMPETENCY_PROFILE, decisions);

    const feature = readFileSync(workspace.featurePath, 'utf8');
    expect(feature).toContain('## Provenance');
    expect(feature).toContain('- product: human');
    expect(feature).toContain('- implementation: agent');
    // "The human chose it" and "nobody was asked and the agent chose it" produce identical
    // specification text and are not the same fact about it.
    expect(feature).toContain('Where does the transcript live? -> artifact store (architecture, decided by the human)');
    expect(feature).toContain('What is the retention? -> 30 days (implementation, decided by the agent)');
  });

  test('says so explicitly when nothing forked, rather than saying nothing', () => {
    workspace = createWorkspace();

    buildOrchestrator().recordSpecificationProvenance(FEATURE_ID, DEFAULT_COMPETENCY_PROFILE, []);

    expect(readFileSync(workspace.featurePath, 'utf8')).toContain('nothing in the conversation forked');
  });

  test('replaces a prior provenance section rather than stacking a second one', () => {
    workspace = createWorkspace();
    const orchestrator = buildOrchestrator();

    orchestrator.recordSpecificationProvenance(FEATURE_ID, DEFAULT_COMPETENCY_PROFILE, []);
    orchestrator.recordSpecificationProvenance(FEATURE_ID, DEFAULT_COMPETENCY_PROFILE, [
      { question: 'Second time?', axis: 'product', chosen: 'yes', decided_by: 'human' },
    ]);

    const feature = readFileSync(workspace.featurePath, 'utf8');
    expect(feature.split('## Provenance')).toHaveLength(2);
    expect(feature).toContain('Second time? -> yes');
  });
});

describe('a dimension the agent proposed', () => {
  let workspace: Workspace | null = null;

  afterEach(() => {
    workspace?.dispose();
    workspace = null;
  });

  test('enters uncovered, with the reason attached', () => {
    // Proposing a dimension and covering it are two different acts, and only the second says the
    // specification actually addresses it.
    workspace = createWorkspace();
    const orchestrator = new CompassRoseOrchestrator({
      loop: false,
      commit: false,
      cwd: workspace.root,
      implementer: 'opencode',
    });

    orchestrator.proposeDimension('offline behavior', 'the field app loses signal daily', 'Test');

    const dimensions = orchestrator.readDimensions();
    const added = dimensions.find((dimension) => dimension.name === 'offline behavior');
    expect(added?.state).toBe('uncovered');
    expect(added?.decisions[0]?.reason).toContain('loses signal daily');
  });

  test('never duplicates one already on the list', () => {
    workspace = createWorkspace();
    const orchestrator = new CompassRoseOrchestrator({
      loop: false,
      commit: false,
      cwd: workspace.root,
      implementer: 'opencode',
    });

    orchestrator.proposeDimension('Authentication', 'proposed again in different case', 'Test');

    expect(orchestrator.readDimensions().filter((d) => d.name.toLowerCase() === 'authentication')).toHaveLength(1);
  });
});
