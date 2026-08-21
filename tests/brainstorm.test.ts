import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { BrainstormTurnOutput, BrainstormTurnRecord } from '../src/contracts/brainstormer/brainstormerContracts.js';
import type { PlannedFeatureDocs } from '../src/contracts/planner/plannerContracts.js';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { copyContractsIntoWorkspace, createTempWorkspace, readFixtureConfigMarkdown, type TempWorkspace } from './testUtils.js';

// Covers Flow B ("npm run brainstorm", ADR-0007/0046): draftBrainstormedFeature's numbering,
// human-only request.md rendering, and delegation into the existing, unmodified planFeature()
// formalization path; and runBrainstormTurn's plain one-shot proposal call. Mirrors
// tests/featureValidation.test.ts's fixture/mock conventions -- a real CompassRoseOrchestrator
// against a temp git workspace, driven by a mock codex binary via
// PROTO_COMPASSROSE_CODEX_COMMAND. The interactive readline CLI itself (src/cli/brainstorm.ts) is
// verified manually, exactly like src/cli/featureValidation.ts's own CLI layer.

const PROJECT_STATE_SEED = `# CompassRose Project State

## Status

active

## Active Feature

\`none\`

## Current Reality

- Fixture workspace for brainstorm tests.

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

function createWorkspace(existingFeatureIds: readonly string[] = []): TempWorkspace {
  const files: Record<string, string> = {
    'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
    'compassrose/PROJECT_STATE.md': PROJECT_STATE_SEED,
    // Mirrors real Flow 0 bootstrap state (npm run setup always creates this) -- without it,
    // compassrose/features/ itself wouldn't exist yet, and git status --porcelain would report
    // the whole new directory as a single untracked line instead of per-file paths, tripping
    // ensureCleanWorktreeIfRequired's allowed-dirty-prefix check in a way real usage never hits.
    'compassrose/features/README.md': '# Features\n',
  };
  for (const featureId of existingFeatureIds) {
    files[`compassrose/features/${featureId}/request.md`] = `# Request: ${featureId}\n\nExisting fixture feature.\n`;
  }

  const workspace = createTempWorkspace({ files });
  copyContractsIntoWorkspace(workspace.root);

  execFileSync('git', ['init', '--quiet'], { cwd: workspace.root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspace.root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspace.root });
  execFileSync('git', ['add', '-A'], { cwd: workspace.root });
  execFileSync('git', ['commit', '--quiet', '-m', 'initial commit'], { cwd: workspace.root });

  return workspace;
}

function writeStructuredMock(root: string, name: string, payload: unknown): string {
  const scriptPath = join(root, `codex-mock-${name}.cjs`);
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
const outputPath = outputIndex === -1 ? null : args[outputIndex + 1];
const payload = ${JSON.stringify(payload)};
if (outputPath) {
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\\n', 'utf8');
}
process.exit(0);
`;
  writeFileSync(scriptPath, script, 'utf8');
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

function buildFeaturePlanPayload(featureId: string): PlannedFeatureDocs {
  return {
    feature_id: featureId,
    feature_md: [
      `# Feature: ${featureId}`,
      '',
      '## Status',
      '',
      'Planned',
      '',
      '## Purpose',
      '',
      'Fixture feature drafted from a brainstorming session.',
      '',
      '## Implementation Outline',
      '',
      'placeholder, discarded and regenerated deterministically',
      '',
      '## Related Documents',
      '',
      '- `architecture.md`',
      '- `state.md`',
      '',
    ].join('\n'),
    architecture_md: `# Architecture: ${featureId}\n\nFixture architecture document.\n`,
    state_md: [
      `# State: ${featureId}`,
      '',
      '## Lifecycle State',
      '',
      'formalized',
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
      '- active_unblock_task: none',
      '- last_implementation_result: not_run',
      '- last_quality_gate_result: unknown',
      '- last_review_result: not_run',
      '- last_unblock_result: not_run',
      '',
      '## Current Reality',
      '',
      'Formalized from a brainstorming session.',
      '',
      '## Implemented Deliverables',
      '',
      '- None yet.',
      '',
      '## Remaining Deliverables',
      '',
      '- Plan the first task.',
      '',
      '## Outline Progress',
      '',
      '- None yet.',
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
      '- active_unblock_task: none',
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
      'Plan the first task.',
      '',
    ].join('\n'),
    summary: 'Formalized a brainstormed feature.',
    task_requests: [],
  };
}

let workspace: TempWorkspace | undefined;
// Mock scripts must live outside the git workspace: planFeature() (called by
// draftBrainstormedFeature) enforces a clean worktree via ensureCleanWorktreeIfRequired(),
// which only allows dirty paths under the target feature's own directory and PROJECT_STATE.md
// -- an untracked script anywhere else in the repo would trip that check.
let scriptsDir: string | undefined;

afterEach(() => {
  vi.unstubAllEnvs();
  workspace?.dispose();
  workspace = undefined;
  if (scriptsDir) {
    rmSync(scriptsDir, { recursive: true, force: true });
    scriptsDir = undefined;
  }
});

describe('draftBrainstormedFeature (Flow B, ADR-0007/0046)', () => {
  test('mints the next numeric id, renders request.md from human turns only, and formalizes via the unmodified planFeature path', () => {
    workspace = createWorkspace(['001-existing-feature']);
    const segment: BrainstormTurnRecord[] = [
      { role: 'human', text: 'Quiero una app de notas con etiquetas.', recorded_at: '2026-01-01T00:00:00.000Z' },
      { role: 'assistant', text: '¿Qué tipo de notas -- texto simple o enriquecido?', recorded_at: '2026-01-01T00:00:01.000Z' },
      { role: 'human', text: 'Texto simple, con búsqueda por etiqueta.', recorded_at: '2026-01-01T00:00:02.000Z' },
    ];

    scriptsDir = mkdtempSync(join(tmpdir(), 'compassrose-brainstorm-mocks-'));
    vi.stubEnv(
      'PROTO_COMPASSROSE_CODEX_COMMAND',
      writeStructuredMock(scriptsDir, 'feature-plan', buildFeaturePlanPayload('002-notas-con-etiquetas')),
    );
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: true, cwd: workspace.root, implementer: 'opencode' });

    const { featureId } = orchestrator.draftBrainstormedFeature(segment, 'Notas con etiquetas');

    expect(featureId).toBe('002-notas-con-etiquetas');

    const featureDirectory = join(workspace.root, 'compassrose', 'features', featureId);
    const requestMd = readFileSync(join(featureDirectory, 'request.md'), 'utf8');
    expect(requestMd).toContain('Quiero una app de notas con etiquetas.');
    expect(requestMd).toContain('Texto simple, con búsqueda por etiqueta.');
    expect(requestMd).not.toContain('¿Qué tipo de notas');

    expect(existsSync(join(featureDirectory, 'feature.md'))).toBe(true);
    expect(existsSync(join(featureDirectory, 'architecture.md'))).toBe(true);
    const stateMd = readFileSync(join(featureDirectory, 'state.md'), 'utf8');
    expect(stateMd).toContain('- validation: not_started');

    const log = execFileSync('git', ['log', '--oneline'], { cwd: workspace.root, encoding: 'utf8' });
    expect(log).toContain('capture brainstormed request for 002-notas-con-etiquetas');
    expect(log).toContain('formalize feature 002-notas-con-etiquetas');
  });

  test('mints 001- when no feature exists yet', () => {
    workspace = createWorkspace([]);
    scriptsDir = mkdtempSync(join(tmpdir(), 'compassrose-brainstorm-mocks-'));
    vi.stubEnv(
      'PROTO_COMPASSROSE_CODEX_COMMAND',
      writeStructuredMock(scriptsDir, 'feature-plan', buildFeaturePlanPayload('001-primera-idea')),
    );
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });

    const segment: BrainstormTurnRecord[] = [
      { role: 'human', text: 'Una primera idea de feature.', recorded_at: '2026-01-01T00:00:00.000Z' },
    ];

    const { featureId } = orchestrator.draftBrainstormedFeature(segment, 'Primera idea');

    expect(featureId).toBe('001-primera-idea');
  });
});

describe('runBrainstormTurn (Flow B, ADR-0007)', () => {
  test('returns the brainstormer\'s proposed reply', () => {
    workspace = createWorkspace([]);
    const proposal: BrainstormTurnOutput = {
      reply: '¿Podés contarme más sobre quién va a usar esta app?',
      ready_to_draft: false,
      proposed_title: null,
      proposed_summary: null,
    };
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', writeStructuredMock(workspace.root, 'brainstorm-turn', proposal));
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });

    const result = orchestrator.runBrainstormTurn([], 'Quiero una app.');

    expect(result).toEqual(proposal);
  });

  test('surfaces a ready_to_draft proposal once scope is concrete', () => {
    workspace = createWorkspace([]);
    const proposal: BrainstormTurnOutput = {
      reply: 'Suena bien definido. ¿Lo formalizamos?',
      ready_to_draft: true,
      proposed_title: 'Notas con etiquetas',
      proposed_summary: 'Notas de texto simple con búsqueda por etiqueta.',
    };
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', writeStructuredMock(workspace.root, 'brainstorm-turn', proposal));
    const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });

    const result = orchestrator.runBrainstormTurn(
      [{ role: 'human', text: 'Notas de texto simple con etiquetas.', recorded_at: '2026-01-01T00:00:00.000Z' }],
      'Y quiero poder buscar por etiqueta.',
    );

    expect(result.ready_to_draft).toBe(true);
    expect(result.proposed_title).toBe('Notas con etiquetas');
  });
});
