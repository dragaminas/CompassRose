import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test } from 'vitest';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { PROJECT_STATE_REQUIRED_SECTIONS } from '../src/contracts/state/projectState.js';
import type { AcceptanceCriteriaVerification } from '../src/contracts/runtime/acceptanceCriteria.js';
import type { SmokeResult } from '../src/gates/smokeGate.js';
import { readFixtureConfigMarkdown } from './testUtils.js';

/**
 * Completion is the only transition with no way back: a feature whose state reads `completed` is
 * skipped by every future run, so a completion that half-applies is permanent and silent.
 *
 * It half-applied. On the first feature ever built in a repository bootstrapped by
 * `compassrose setup`, the feature state was written, the project-state renderer then threw on a
 * missing `## Implemented` section, and nothing was committed. Three approved tasks and ten met
 * acceptance criteria ended up marked complete on disk, absent from the project state, and
 * unreachable by any later run.
 */

interface Access {
  renderCompletionDocuments(
    statePath: string,
    featureId: string,
    verification: AcceptanceCriteriaVerification,
    smoke: SmokeResult,
  ): { readonly featureState: string; readonly projectState: string };
}

let root: string | undefined;

afterEach(() => {
  if (root) {
    rmSync(root, { recursive: true, force: true });
    root = undefined;
  }
});

const FEATURE_ID = '001-fixture';

const VERIFICATION: AcceptanceCriteriaVerification = {
  feature_id: FEATURE_ID,
  summary: 'Every criterion is satisfied.',
  verdicts: [{ criterion: 'It works.', status: 'met', evidence: 'tests/it.test.ts' }],
};

const SMOKE: SmokeResult = { outcome: 'passed', command: 'npm start', unmet: [], output: '' };

/** Every section `src/contracts/state/feature-state.md` declares, so only the project state is short. */
function featureStateMarkdown(): string {
  return [
    '# State: Fixture',
    '',
    '## Lifecycle State',
    '',
    'implementation_running',
    '',
    '## Operational Status',
    '',
    '- formalization: complete',
    '- active_task: none',
    '',
    '## Blocked By',
    '',
    '- None',
    '',
    '## Blocked From',
    '',
    '- lifecycle_state: none',
    '',
    '## Current Reality',
    '',
    '- A fixture.',
    '',
    '## Implemented Deliverables',
    '',
    '- The thing.',
    '',
    '## Remaining Deliverables',
    '',
    '- None.',
    '',
    '## Outline Progress',
    '',
    '- 1. Do the thing: complete',
    '',
    '## Known Gaps',
    '',
    'None.',
    '',
    '## Last Approved Change',
    '',
    'None.',
    '',
    '## Next Planning Hint',
    '',
    'None.',
    '',
  ].join('\n');
}

function projectStateMarkdown(sections: readonly string[]): string {
  return [
    '# State: Fixture Project',
    '',
    ...sections.flatMap((section) => [`## ${section}`, '', 'None.', '']),
  ].join('\n');
}

function createWorkspace(projectStateSections: readonly string[]): string {
  const workspace = mkdtempSync(join(tmpdir(), 'compassrose-completion-order-'));
  mkdirSync(join(workspace, '.git'), { recursive: true });
  mkdirSync(join(workspace, 'compassrose', 'features', FEATURE_ID), { recursive: true });
  mkdirSync(join(workspace, 'compassrose', 'fixes'), { recursive: true });
  mkdirSync(join(workspace, 'compassrose', 'templates'), { recursive: true });
  writeFileSync(join(workspace, 'compassrose', 'CONFIG.md'), readFixtureConfigMarkdown(), 'utf8');
  writeFileSync(
    join(workspace, 'compassrose', 'PROJECT_STATE.md'),
    projectStateMarkdown(projectStateSections),
    'utf8',
  );
  writeFileSync(join(workspace, 'compassrose', 'ROADMAP.md'), '# Roadmap\n', 'utf8');
  writeFileSync(
    join(workspace, 'compassrose', 'features', FEATURE_ID, 'state.md'),
    featureStateMarkdown(),
    'utf8',
  );
  return workspace;
}

function orchestratorFor(workspace: string): CompassRoseOrchestrator & Access {
  return new CompassRoseOrchestrator({
    loop: false,
    commit: false,
    cwd: workspace,
    implementer: 'opencode',
  }) as CompassRoseOrchestrator & Access;
}

describe('completion renders both documents before writing either', () => {
  test('a project state missing "## Implemented" throws and leaves the feature state untouched', () => {
    root = createWorkspace(PROJECT_STATE_REQUIRED_SECTIONS.filter((section) => section !== 'Implemented'));
    const statePath = join(root, 'compassrose', 'features', FEATURE_ID, 'state.md');
    const before = readFileSync(statePath, 'utf8');

    expect(() => orchestratorFor(root!).renderCompletionDocuments(statePath, FEATURE_ID, VERIFICATION, SMOKE))
      .toThrow(/Implemented/);

    // The point of the whole arrangement. Before, this file already said `completed` -- written by
    // the line above the one that threw -- and no run would ever look at the feature again.
    expect(readFileSync(statePath, 'utf8')).toBe(before);
    expect(readFileSync(statePath, 'utf8')).toContain('implementation_running');
  });

  test('a complete project state renders both documents and writes neither', () => {
    root = createWorkspace(PROJECT_STATE_REQUIRED_SECTIONS);
    const statePath = join(root, 'compassrose', 'features', FEATURE_ID, 'state.md');
    const projectStatePath = join(root, 'compassrose', 'PROJECT_STATE.md');
    const before = { feature: readFileSync(statePath, 'utf8'), project: readFileSync(projectStatePath, 'utf8') };

    const rendered = orchestratorFor(root).renderCompletionDocuments(statePath, FEATURE_ID, VERIFICATION, SMOKE);

    expect(rendered.featureState).toContain('completed');
    expect(rendered.projectState).toContain(`Feature \`${FEATURE_ID}\` is complete`);
    // Rendering is rendering: the caller does the writing, which is what lets it wait until every
    // renderer has returned.
    expect(readFileSync(statePath, 'utf8')).toBe(before.feature);
    expect(readFileSync(projectStatePath, 'utf8')).toBe(before.project);
  });
});
