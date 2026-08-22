import { chmodSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, test, vi } from 'vitest';

// Spawns a real tsx -> node subprocess over a full repository clone; the suite-wide 30000ms
// default (vitest.config.ts) leaves no headroom under full-suite contention. Same reasoning as
// tests/protoBlockerFlows.test.ts.
vi.setConfig({ testTimeout: 90000 });

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsxBinary = join(repoRoot, 'node_modules', '.bin', 'tsx');

const TARGET_FEATURE_ID = '000-scope-guard-target';
const SIBLING_FEATURE_ID = '997-scope-guard-sibling';

describe('feature scope guard', () => {
  // Regression coverage for the incident described in
  // src/contracts/planner/feature-scope-guard.md: a planner proposing a task that actually
  // belongs to a sibling feature must be refused deterministically by the orchestrator, not
  // silently written as a task for the wrong feature.
  test('refuses a planned task whose scope_justification names a sibling feature, and blocks the feature instead', () => {
    const workspace = prepareScopeGuardWorkspace();

    try {
      const result = runScopeGuardScenario(workspace.cloneRoot);

      // 3, not 2: since 025-automated-development-loop, a blocked work item no longer ends the
      // run. The run sets it aside, finds nothing else selectable in this fixture, and exits 3 --
      // "finished cleanly, but something needs a human", which is distinct from both 0 (nothing
      // left to do) and 1 (the engine broke).
      expect(result.exitCode).toBe(3);
      expect(result.stdout).toContain(`Next step: plan_task (${TARGET_FEATURE_ID})`);
      // The console now prints a bounded blocker card (renderBlockerCard), not the raw,
      // unbounded reason sentence -- this specific reason is long enough that the sibling
      // feature's name falls past the card's truncation budget. The card itself (kind + target
      // feature id) is asserted here; the full untruncated reason naming the sibling feature is
      // asserted below via state.md's own `## Blocked By` section, which is where the design
      // keeps full detail deliberately un-truncated.
      expect(`${result.stdout}${result.stderr}`).toContain(`=== BLOCKED: ${TARGET_FEATURE_ID} ===`);
      expect(`${result.stdout}${result.stderr}`).toContain('kind: task_interface_gap');

      const tasksDirectory = join(workspace.cloneRoot, 'compassrose', 'features', TARGET_FEATURE_ID, 'tasks');
      const writtenTasks = existsSync(tasksDirectory) ? readdirSync(tasksDirectory) : [];
      expect(writtenTasks).toEqual([]);

      const featureState = readFileSync(join(workspace.cloneRoot, 'compassrose', 'features', TARGET_FEATURE_ID, 'state.md'), 'utf8');
      expect(featureState).toContain('## Lifecycle State\n\nblocked');
      expect(featureState).toContain(SIBLING_FEATURE_ID);

      const runSummary = JSON.parse(
        readFileSync(join(workspace.cloneRoot, '.git', 'proto-compassrose', 'latest-run.json'), 'utf8'),
      ) as { status?: string; exit_code?: number };
      // The run reached its natural end rather than being cut short by the block.
      expect(runSummary.status).toBe('completed');
      expect(runSummary.exit_code).toBe(3);
    } finally {
      workspace.dispose();
    }
  });
});

function prepareScopeGuardWorkspace(): { cloneRoot: string; dispose: () => void } {
  const tempRoot = mkdtempSync(join(tmpdir(), 'compassrose-scope-guard-'));
  const bareRoot = join(tempRoot, 'repo.git');
  const cloneRoot = join(tempRoot, 'repo');

  const cloneResult = spawnSync('git', ['clone', '--bare', '--quiet', repoRoot, bareRoot], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (cloneResult.status !== 0) {
    throw new Error(`git clone --bare failed:\n${cloneResult.stderr || cloneResult.stdout}`);
  }

  const worktreeResult = spawnSync('git', ['clone', '--quiet', bareRoot, cloneRoot], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (worktreeResult.status !== 0) {
    throw new Error(`git clone failed:\n${worktreeResult.stderr || worktreeResult.stdout}`);
  }

  copyTree(join(repoRoot, 'src'), join(cloneRoot, 'src'));
  neutralizeRealFeatureStates(cloneRoot);
  removeRealFixes(cloneRoot);
  seedTargetFeature(cloneRoot);
  seedSiblingFeature(cloneRoot);
  seedTaskRequestArtifact(cloneRoot);
  writeExecutableScript(join(tempRoot, 'codex-mock.cjs'), CODEX_SCOPE_GUARD_MOCK);
  writeExecutableScript(join(tempRoot, 'opencode-mock.cjs'), OPENCODE_STUB_MOCK);

  return {
    cloneRoot,
    dispose: () => rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
  };
}

function runScopeGuardScenario(cloneRoot: string): {
  exitCode: number | null;
  stdout: string;
  stderr: string;
} {
  const tempRoot = dirname(cloneRoot);
  const runResult = spawnSync(
    tsxBinary,
    ['src/cli/main.ts', '--no-commit', '--implementer', 'opencode'],
    {
      cwd: cloneRoot,
      env: {
        ...process.env,
        PROTO_COMPASSROSE_CODEX_COMMAND: join(tempRoot, 'codex-mock.cjs'),
        PROTO_COMPASSROSE_OPENCODE_COMMAND: join(tempRoot, 'opencode-mock.cjs'),
        PROTO_COMPASSROSE_SKIP_CLEAN_CHECK: '1',
      },
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      shell: process.platform === 'win32',
    },
  );

  return {
    exitCode: runResult.status,
    stdout: runResult.stdout || '',
    stderr: runResult.stderr || '',
  };
}

function copyTree(sourceRoot: string, targetRoot: string): void {
  if (!existsSync(sourceRoot)) {
    return;
  }

  if (statSync(sourceRoot).isFile()) {
    mkdirSync(dirname(targetRoot), { recursive: true });
    writeFileSync(targetRoot, readFileSync(sourceRoot, 'utf8'), 'utf8');
    return;
  }

  mkdirSync(targetRoot, { recursive: true });
  for (const entry of readdirSync(sourceRoot)) {
    copyTree(join(sourceRoot, entry), join(targetRoot, entry));
  }
}

// determineNextStep()'s two-pass scheduler (src/orchestrator/orchestrator.ts) resumes ANY
// feature already mid-execution (task_ready onward) before ever considering a startable one
// like our synthetic TARGET_FEATURE_ID -- deliberately, so a severity-aware fix never starves
// in-flight work. That means this scenario's "000 sorts first" assumption alone is no longer
// enough: if a *real* committed feature happens to be mid-execution at the moment this test
// clones HEAD (e.g. because a live orchestrator run is mid-task), Pass 1 would resume that
// real feature instead of ever reaching our synthetic target in Pass 2. Neutralize every real
// feature to `completed` inside the disposable clone only (never the real repo) so this
// scenario is deterministic regardless of what the live repository happens to be doing.
function neutralizeRealFeatureStates(cloneRoot: string): void {
  const featuresRoot = join(cloneRoot, 'compassrose', 'features');
  if (!existsSync(featuresRoot)) {
    return;
  }

  for (const entry of readdirSync(featuresRoot)) {
    const statePath = join(featuresRoot, entry, 'state.md');
    if (!existsSync(statePath) || !statSync(statePath).isFile()) {
      continue;
    }

    const markdown = readFileSync(statePath, 'utf8');
    const neutralized = markdown.replace(
      /(## Lifecycle State\s*\n\s*\n)\S+/,
      '$1completed',
    );
    writeFileSync(statePath, neutralized, 'utf8');
  }
}

// Real, still-unformalized fixes committed in this repo's own compassrose/fixes now default to
// 'critical' severity (fail-safe upward -- see readFixSeverityAndOwnership) until formalized, so
// they would otherwise outrank this scenario's synthetic target feature in the clone and hijack
// the run. Unlike features, no in-clone "neutralize the lifecycle state" rewrite applies here --
// a fresh fix request has no state.md at all -- so remove them outright; this scenario needs
// nothing but its own synthetic features.
function removeRealFixes(cloneRoot: string): void {
  rmSync(join(cloneRoot, 'compassrose', 'fixes'), { recursive: true, force: true });
}

function seedTargetFeature(cloneRoot: string): void {
  const featureRoot = join(cloneRoot, 'compassrose', 'features', TARGET_FEATURE_ID);
  mkdirSync(featureRoot, { recursive: true });

  writeFileSync(
    join(featureRoot, 'request.md'),
    `# Request: Scope Guard Test Target

A synthetic feature used only by tests/orchestratorScopeGuard.test.ts to exercise the
feature-scope guard without depending on real, evolving feature state.
`,
    'utf8',
  );

  writeFileSync(
    join(featureRoot, 'feature.md'),
    `# Feature: Scope Guard Test Target

## Purpose

A synthetic feature used only to test that the orchestrator refuses a planned task whose
scope_justification names a sibling feature.

## Scope

This feature includes:

- a narrow, self-contained deliverable that has nothing to do with orchestrator dispatch

This feature does not include:

- reimplementing feature selection, lifecycle dispatch, or CLI adapter invocation; that belongs
  to \`${SIBLING_FEATURE_ID}\`
`,
    'utf8',
  );

  writeFileSync(
    join(featureRoot, 'architecture.md'),
    `# Architecture: Scope Guard Test Target

No real architecture; this feature exists only for test fixtures.
`,
    'utf8',
  );

  writeFileSync(
    join(featureRoot, 'state.md'),
    `# State: Scope Guard Test Target

## Lifecycle State

task_planning_pending

## Source Request

\`request.md\`

## Operational Status

- formalization: complete
- active_task: none
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: not_run
- last_quality_gate_result: unknown
- last_review_result: not_run
- last_unblock_result: not_run

## Current Reality

The feature is formalized and ready for its first task to be planned.

## Implemented Deliverables

- feature formalization exists

## Remaining Deliverables

- plan the first task

## Outline Progress

- Formalize the feature: complete
- Plan the first task: not started

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none
- active_unblock_task: none

## Last Approved Change

None yet.

## Known Gaps

- None

## Next Planning Hint

Plan the next task for this feature.
`,
    'utf8',
  );
}

function seedSiblingFeature(cloneRoot: string): void {
  const featureRoot = join(cloneRoot, 'compassrose', 'features', SIBLING_FEATURE_ID);
  mkdirSync(featureRoot, { recursive: true });

  writeFileSync(
    join(featureRoot, 'request.md'),
    `# Request: Scope Guard Test Sibling

A synthetic sibling feature used only by tests/orchestratorScopeGuard.test.ts. It owns feature
selection, lifecycle dispatch, and CLI adapter invocation so the scope-guard test target feature
can name it in scope_justification.belongs_to_other_feature.
`,
    'utf8',
  );
}

// planTask() now backfills task_requests once for a feature with no task-requests artifact
// (see backfillTaskRequests() in orchestrator.ts), via a *different* structured schema
// (task_requests_backfill) than this test's mock understands. Seed the artifact directly so
// this scenario keeps exercising exactly what it always has -- planTaskFromRequest()'s
// belongs_to_other_feature check -- rather than accidentally also exercising backfill.
function seedTaskRequestArtifact(cloneRoot: string): void {
  const artifactPath = join(cloneRoot, '.git', 'proto-compassrose', 'task-requests', `${TARGET_FEATURE_ID}.json`);
  mkdirSync(dirname(artifactPath), { recursive: true });
  const taskRequests = [
    {
      id: '1',
      title: 'Add feature-selection and lifecycle dispatch to the CLI entrypoint',
      objective: 'Scope-guard test scenario: this task request is (incorrectly) elaborated as belonging to the sibling feature.',
      scope: { allowed_paths: ['src/cli/main.ts'], forbidden_paths: [] },
      status: 'not_started',
      sibling_check: { considered_features: [SIBLING_FEATURE_ID], belongs_to_other_feature: null },
    },
  ];
  writeFileSync(artifactPath, `${JSON.stringify(taskRequests, null, 2)}\n`, 'utf8');
}

function writeExecutableScript(path: string, contents: string): void {
  writeFileSync(path, contents, 'utf8');
  chmodSync(path, 0o755);
}

const CODEX_SCOPE_GUARD_MOCK = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const outputPath = readArgValue(args, '-o');

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify({
      task: {
        task_id: 'F000-T01',
        previous_task_id: null,
        feature_id: '${TARGET_FEATURE_ID}',
        title: 'Add feature-selection and lifecycle dispatch to the CLI entrypoint',
        objective: 'Duplicate the orchestrator feature-selection and lifecycle-dispatch loop directly inside this feature.',
        first_executable_step: 'Add a feature-selection scan to src/cli/main.ts.',
        minimum_progress_evidence: ['src/cli/main.ts gains a feature-selection scan.'],
        trace: {
          roadmap_objective: 'Deterministic Orchestration',
          feature_goal: 'Scope-guard test target feature goal.',
          state_gap: 'The feature needs its next task planned.',
        },
        context: {
          summary: 'Scope-guard test scenario: this task actually belongs to the sibling feature.',
          relevant_paths: ['src/cli/main.ts'],
          relevant_modules: ['CLI entrypoint'],
        },
        scope: {
          allowed_paths: ['src/cli/main.ts'],
          forbidden_paths: [],
        },
        constraints: [],
        development_policy: { mode: 'test_guided' },
        quality_gates: { before_review: ['npm test'] },
        acceptance_criteria: ['n/a: this task is expected to be refused before it is written'],
        expected_deliverables: ['code', 'tests'],
        scope_justification: {
          included_by: 'n/a - deliberately out of scope for this synthetic test feature',
          excluded_by: [
            'This feature does not include reimplementing feature selection, lifecycle dispatch, or CLI adapter invocation.',
          ],
          belongs_to_other_feature: '${SIBLING_FEATURE_ID}',
        },
      },
    }, null, 2) + '\\n',
    'utf8',
  );
}

process.exit(0);

function readArgValue(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return args[index + 1] || null;
}
`;

const OPENCODE_STUB_MOCK = `#!/usr/bin/env node
process.exit(0);
`;
