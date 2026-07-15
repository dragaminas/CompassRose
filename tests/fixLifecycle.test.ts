import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { readFixtureConfigMarkdown } from './testUtils.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsxBinary = join(repoRoot, 'node_modules', '.bin', 'tsx');

const FIX_ID = '000-transversal-fix';

describe('fix lifecycle end-to-end', () => {
  // Proves a transversal fix (owning_feature: none) can be formalized, have a task planned,
  // implemented, and approved through a real subprocess run of the CLI -- and, since this fix
  // has no architecture.md, that reviewTask()'s architecturePath-null guard (Phase 3) doesn't
  // crash when it actually runs the review step for a fix-owned task.
  test('formalizes, plans, implements, and gets an approved review for a transversal fix', () => {
    const workspace = prepareFixLifecycleWorkspace();

    try {
      const result = runFixLifecycleScenario(workspace.root);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`Next step: plan_fix (${FIX_ID})`);
      expect(result.stdout).toContain(`Next step: plan_fix_task (${FIX_ID})`);
      expect(result.stdout).toContain('Next step: implement_subtask');
      expect(result.stdout).toContain('Next step: review_subtask');

      const fixRoot = join(workspace.root, 'docs', 'fixes', FIX_ID);
      expect(existsSync(join(fixRoot, 'fix.md'))).toBe(true);
      expect(existsSync(join(fixRoot, 'architecture.md'))).toBe(false);

      const state = readFileSync(join(fixRoot, 'state.md'), 'utf8');
      expect(state).toContain('## Lifecycle State\n\nformalized');
      expect(state).toContain('- last_review_result: approved');
      expect(state).toContain('- severity: critical');
      expect(state).toContain('- owning_feature: none');

      const tasksDir = join(fixRoot, 'tasks');
      const taskFiles = existsSync(tasksDir) ? readdirSync(tasksDir) : [];
      expect(taskFiles.length).toBe(1);
      expect(existsSync(join(workspace.root, 'implemented-marker.txt'))).toBe(true);
    } finally {
      workspace.dispose();
    }
  }, 30000);
});

function prepareFixLifecycleWorkspace(): { root: string; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'compassrose-fix-lifecycle-'));

  const init = spawnSync('git', ['init', '--quiet'], { cwd: root, encoding: 'utf8' });
  if (init.status !== 0) {
    throw new Error(`git init failed:\n${init.stderr || init.stdout}`);
  }
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: root, encoding: 'utf8' });

  copyTree(join(repoRoot, 'src'), join(root, 'src'));

  mkdirSync(join(root, 'docs', 'compassrose'), { recursive: true });
  const config = readFixtureConfigMarkdown().replace(/max_tasks_per_run:\s*\d+/, 'max_tasks_per_run: 1');
  writeFileSync(join(root, 'docs', 'compassrose', 'CONFIG.md'), config, 'utf8');
  writeFileSync(join(root, 'docs', 'compassrose', 'PROJECT_STATE.md'), PROJECT_STATE_FIXTURE, 'utf8');

  const fixRoot = join(root, 'docs', 'fixes', FIX_ID);
  mkdirSync(fixRoot, { recursive: true });
  writeFileSync(
    join(fixRoot, 'request.md'),
    '# Request: Transversal Fix\n\nSynthetic fix request used only by tests/fixLifecycle.test.ts: a bug that spans multiple areas and has no single owning feature.\n',
    'utf8',
  );

  const commit = spawnSync('git', ['add', '-A'], { cwd: root, encoding: 'utf8' });
  if (commit.status !== 0) {
    throw new Error(`git add failed:\n${commit.stderr || commit.stdout}`);
  }
  const commitResult = spawnSync('git', ['commit', '--quiet', '-m', 'initial fixture commit'], { cwd: root, encoding: 'utf8' });
  if (commitResult.status !== 0) {
    throw new Error(`git commit failed:\n${commitResult.stderr || commitResult.stdout}`);
  }

  const codexMock = join(root, 'codex-mock.cjs');
  const opencodeMock = join(root, 'opencode-mock.cjs');
  writeFileSync(codexMock, CODEX_MOCK_SCRIPT, 'utf8');
  chmodSync(codexMock, 0o755);
  writeFileSync(opencodeMock, OPENCODE_MOCK_SCRIPT, 'utf8');
  chmodSync(opencodeMock, 0o755);

  return {
    root,
    dispose: () => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
  };
}

function runFixLifecycleScenario(root: string): { exitCode: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    tsxBinary,
    ['src/cli/main.ts', '--loop', '--no-commit', '--implementer', 'opencode'],
    {
      cwd: root,
      env: {
        ...process.env,
        PROTO_COMPASSROSE_CODEX_COMMAND: join(root, 'codex-mock.cjs'),
        PROTO_COMPASSROSE_OPENCODE_COMMAND: join(root, 'opencode-mock.cjs'),
        PROTO_COMPASSROSE_SKIP_CLEAN_CHECK: '1',
      },
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      shell: process.platform === 'win32',
    },
  );

  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
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

const PROJECT_STATE_FIXTURE = `# State: Fix Lifecycle Test Fixture

## Status

In progress

## Active Feature

\`none\`

## Current Reality

- Synthetic fixture used only by tests/fixLifecycle.test.ts.

## Implemented

- None yet.

## Pending

- None yet.

## Blocked

- None

## Last Approved Change

None yet.

## Known Gaps

- None currently tracked.

## Next Planning Hint

Formalize the transversal fix fixture.
`;

const CODEX_MOCK_SCRIPT = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const outputPath = readArgValue(args, '-o');
const prompt = fs.readFileSync(0, 'utf8');

let payload;
if (prompt.includes('Formalize fix')) {
  payload = {
    fix_id: '${FIX_ID}',
    fix_md: '# Fix: Transversal Fix\\n\\n## Severity\\n\\ncritical\\n\\n## Owning Feature\\n\\nnone\\n\\n## Purpose\\n\\nFixture fix used by an automated test.\\n',
    state_md: [
      '# State: Transversal Fix',
      '',
      '## Lifecycle State',
      '',
      'task_planning_pending',
      '',
      '## Source Request',
      '',
      '\`request.md\`',
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
      '- severity: critical',
      '- owning_feature: none',
      '',
      '## Current Reality',
      '',
      'Fixture fix is formalized and ready for task planning.',
      '',
      '## Implemented Deliverables',
      '',
      '- fix formalization exists',
      '',
      '## Remaining Deliverables',
      '',
      '- plan the first task',
      '',
      '## Outline Progress',
      '',
      '- Formalize the fix: complete',
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
      'Plan the next task for this fix.',
      '',
    ].join('\\n'),
    summary: 'Formalized the transversal fix fixture.',
  };
} else if (prompt.includes('Plan the next task for fix')) {
  payload = {
    task: {
      task_id: 'FX000-T01',
      previous_task_id: null,
      feature_id: '${FIX_ID}',
      title: 'Fix the transversal defect',
      objective: 'Repair the fixture defect and leave a visible marker.',
      first_executable_step: 'Create implemented-marker.txt at the repository root.',
      minimum_progress_evidence: ['implemented-marker.txt exists at the repository root.'],
      trace: {
        roadmap_objective: 'Fixture',
        feature_goal: 'Fixture',
        state_gap: 'Fixture',
      },
      context: {
        summary: 'Fixture task used by an automated test.',
        relevant_paths: ['implemented-marker.txt'],
        relevant_modules: ['fixture'],
      },
      scope: {
        allowed_paths: ['implemented-marker.txt'],
        forbidden_paths: [],
      },
      constraints: [],
      development_policy: { mode: 'test_guided' },
      quality_gates: { before_review: ['node -e "process.exit(0)"'] },
      acceptance_criteria: ['implemented-marker.txt exists.'],
      expected_deliverables: ['code', 'tests'],
      scope_justification: {
        included_by: 'n/a - fixture',
        excluded_by: ['n/a - fixture'],
        belongs_to_other_feature: null,
      },
    },
  };
} else if (prompt.includes('Act as the CompassRose Reviewer.')) {
  const match = prompt.match(/Review subtask \`([^\`]+)\`/);
  const taskId = match ? match[1] : 'FX000-T01';
  payload = {
    task_id: taskId,
    status: 'approved',
    summary: 'Fixture review approved ' + taskId + '.',
    acceptance: {
      criteria: [
        { criterion: 'fixture marker exists', status: 'passed', notes: 'observed through mock invocation' },
      ],
    },
    findings: [],
    scope_check: { status: 'passed', unrelated_changes: [] },
    quality_gate_check: { status: 'passed', failed_gates: [] },
    correction_task: null,
    project_state_update_hint: null,
  };
}

if (outputPath && payload) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\\n', 'utf8');
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

const OPENCODE_MOCK_SCRIPT = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const markerPath = path.join(process.cwd(), 'implemented-marker.txt');
fs.writeFileSync(markerPath, 'fixture implementation marker\\n', 'utf8');
process.stdout.write('## Implementation Notes\\n\\n- status: implemented\\n- reason: fixture task completed\\n- evidence: implemented-marker.txt\\n');
process.exit(0);
`;
