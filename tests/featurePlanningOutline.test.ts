import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { renderImplementationOutlineMarkdown } from '../src/orchestrator/taskRendering.js';
import type { TaskRequest } from '../src/contracts/planner/plannerContracts.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsxBinary = join(repoRoot, 'node_modules', '.bin', 'tsx');

const TARGET_FEATURE_ID = '900-outline-rendering-test';

const TASK_REQUESTS: TaskRequest[] = [
  {
    id: '1',
    title: 'Add the outline renderer',
    objective: 'Render task_requests into feature.md deterministically.',
    scope: { allowed_paths: ['src/orchestrator/taskRendering.ts', 'tests/'], forbidden_paths: [] },
    status: 'not_started',
    sibling_check: { considered_features: [], belongs_to_other_feature: null },
  },
  {
    id: '2',
    title: 'Wire it into planFeature',
    objective: 'Splice the rendered outline into feature.md and persist the JSON artifact.',
    scope: { allowed_paths: ['src/orchestrator/orchestrator.ts', 'tests/'], forbidden_paths: [] },
    status: 'not_started',
    sibling_check: { considered_features: [], belongs_to_other_feature: null },
  },
];

describe('feature formalization task-request outline', () => {
  // Regression coverage for the structured-task-request backbone: planFeature() must
  // discard whatever Implementation Outline prose the planner hand-authored and splice in
  // a deterministic rendering of task_requests instead, plus persist task_requests as a
  // JSON artifact the orchestrator can read back deterministically in later task planning.
  test('deterministically overwrites Implementation Outline from task_requests and persists the JSON artifact', () => {
    const workspace = prepareWorkspace();

    try {
      const result = runFormalizationScenario(workspace.cloneRoot);
      expect(`${result.stdout}${result.stderr}`).not.toContain('Error');
      expect(result.exitCode).toBe(0);

      const featureMarkdown = readFileSync(
        join(workspace.cloneRoot, 'compassrose', 'features', TARGET_FEATURE_ID, 'feature.md'),
        'utf8',
      );
      expect(featureMarkdown).not.toContain('placeholder text the planner hand-authored');
      expect(featureMarkdown).toContain(renderImplementationOutlineMarkdown(TASK_REQUESTS));
      // Content after the spliced section must survive untouched.
      expect(featureMarkdown).toContain('## Related Documents');

      const artifactPath = join(
        workspace.cloneRoot,
        '.git',
        'proto-compassrose',
        'task-requests',
        `${TARGET_FEATURE_ID}.json`,
      );
      const persisted = JSON.parse(readFileSync(artifactPath, 'utf8'));
      expect(persisted).toEqual(TASK_REQUESTS);
    } finally {
      workspace.dispose();
    }
  });
});

function prepareWorkspace(): { cloneRoot: string; dispose: () => void } {
  const tempRoot = mkdtempSync(join(tmpdir(), 'compassrose-outline-'));
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
  // Remove every real feature so determineNextStep() has nothing to consider but our
  // synthetic target -- unlike tests/orchestratorScopeGuard.test.ts, this scenario needs no
  // sibling feature and a request_pending real feature (no state.md yet) can't be
  // neutralized by rewriting a lifecycle-state line that doesn't exist yet.
  rmSync(join(cloneRoot, 'compassrose', 'features'), { recursive: true, force: true });
  // Real, still-unformalized fixes committed in this repo's own compassrose/fixes now default to
  // 'critical' severity (fail-safe upward -- see readFixSeverityAndOwnership) until formalized,
  // so they would otherwise outrank this scenario's synthetic feature in the clone and hijack
  // the run. Remove them; this test only exercises feature planning outline behavior.
  rmSync(join(cloneRoot, 'compassrose', 'fixes'), { recursive: true, force: true });
  seedTargetFeature(cloneRoot);
  writeExecutableScript(join(tempRoot, 'codex-mock.cjs'), buildCodexMock());
  writeExecutableScript(join(tempRoot, 'opencode-mock.cjs'), OPENCODE_STUB_MOCK);

  return {
    cloneRoot,
    dispose: () => rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
  };
}

/**
 * Since 024-specification-flow the loop no longer formalizes anything -- specification is a
 * conversation, and a `request.md`-only folder is reported rather than processed. This scenario
 * therefore drives `specifyExistingRequest`, which is what the session's `/crear` reaches, instead
 * of running the loop and waiting for it to pick the request up.
 *
 * Still a subprocess against a real clone, so the orchestrator's file writing, adapter wiring, and
 * mock CLIs are exercised exactly as before.
 */
const SPECIFY_RUNNER = [
  "import { CompassRoseOrchestrator } from './src/orchestrator/orchestrator.js';",
  'const orchestrator = new CompassRoseOrchestrator({',
  "  cwd: process.cwd(), commit: false, implementer: 'opencode', loop: false,",
  '});',
  'orchestrator.specifyExistingRequest(process.argv[2]);',
  '',
].join('\n');

function runFormalizationScenario(cloneRoot: string): {
  exitCode: number | null;
  stdout: string;
  stderr: string;
} {
  const tempRoot = dirname(cloneRoot);
  writeFileSync(join(cloneRoot, 'specify-runner.ts'), SPECIFY_RUNNER, 'utf8');

  const runResult = spawnSync(
    tsxBinary,
    ['specify-runner.ts', TARGET_FEATURE_ID],
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

  // Removed immediately: an uncommitted file in the workspace shows up in every later `git diff`
  // the runtime takes, including its review-time scope check.
  rmSync(join(cloneRoot, 'specify-runner.ts'), { force: true });

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

function seedTargetFeature(cloneRoot: string): void {
  const featureRoot = join(cloneRoot, 'compassrose', 'features', TARGET_FEATURE_ID);
  mkdirSync(featureRoot, { recursive: true });

  // Only request.md exists -- inspectFeature() classifies this as request_pending, which
  // determineNextStep() maps to plan_feature.
  writeFileSync(
    join(featureRoot, 'request.md'),
    `# Request: Outline Rendering Test

A synthetic feature used only by tests/featurePlanningOutline.test.ts to exercise the
deterministic Implementation Outline rendering during feature formalization.
`,
    'utf8',
  );
}

function writeExecutableScript(path: string, contents: string): void {
  writeFileSync(path, contents, 'utf8');
  chmodSync(path, 0o755);
}

function buildCodexMock(): string {
  const featureMd = [
    `# Feature: Outline Rendering Test`,
    '',
    '## Status',
    '',
    'Planned',
    '',
    '## Purpose',
    '',
    'Synthetic feature used only to test deterministic outline rendering.',
    '',
    '## Scope',
    '',
    'This feature includes:',
    '',
    '- a narrow, self-contained deliverable',
    '',
    'This feature does not include:',
    '',
    '- anything else',
    '',
    '## Implementation Outline',
    '',
    'placeholder text the planner hand-authored, expected to be discarded',
    '',
    '## Related Documents',
    '',
    '- `architecture.md`',
    '- `state.md`',
    '',
  ].join('\n');

  const stateMd = [
    '# State: Outline Rendering Test',
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
    'Formalized for the outline-rendering test.',
    '',
    '## Implemented Deliverables',
    '',
    '- feature formalization exists',
    '',
    '## Remaining Deliverables',
    '',
    '- plan the first task',
    '',
    '## Outline Progress',
    '',
    '- 1. Add the outline renderer: not started',
    '- 2. Wire it into planFeature: not started',
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
  ].join('\n');

  const payload = {
    feature_id: TARGET_FEATURE_ID,
    feature_md: featureMd,
    architecture_md: '# Architecture: Outline Rendering Test\n\nNo real architecture; test fixture only.\n',
    state_md: stateMd,
    summary: 'Formalized the outline-rendering test feature.',
    task_requests: TASK_REQUESTS,
  };

  return `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const outputPath = readArgValue(args, '-o');

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(${JSON.stringify(payload)}, null, 2) + '\\n', 'utf8');
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
}

const OPENCODE_STUB_MOCK = `#!/usr/bin/env node
process.exit(0);
`;
