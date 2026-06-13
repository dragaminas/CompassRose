import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

function main(): number {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const tempRoot = mkdtempSync(join(tmpdir(), 'proto-compassrose-e2e-'));
  const cloneRoot = join(tempRoot, 'repo');
  const tsxBinary = join(repoRoot, 'node_modules', '.bin', 'tsx');
  const scenario = process.env.PROTO_E2E_SCENARIO ?? 'standard';
  const commitEnabled = process.env.PROTO_E2E_COMMIT === '1';

  if (!existsSync(tsxBinary)) {
    process.stderr.write(`Unable to find local tsx binary at ${tsxBinary}.\n`);
    return 1;
  }

  const bareRoot = join(tempRoot, 'repo.git');
  const cloneResult = spawnSync('git', ['clone', '--bare', '--quiet', repoRoot, bareRoot], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (cloneResult.status !== 0) {
    process.stderr.write(`git clone failed:\n${cloneResult.stderr || cloneResult.stdout}\n`);
    return 1;
  }

  const worktreeResult = spawnSync('git', ['clone', '--quiet', bareRoot, cloneRoot], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (worktreeResult.status !== 0) {
    process.stderr.write(`git clone from bare repo failed:\n${worktreeResult.stderr || worktreeResult.stdout}\n`);
    return 1;
  }

  syncPrototypeRuntime(repoRoot, cloneRoot);
  syncFeatureStateDocs(repoRoot, cloneRoot);

  const codexMock = join(tempRoot, 'codex-mock.cjs');
  const opencodeMock = join(tempRoot, 'opencode-mock.cjs');
  const codexLog = join(tempRoot, 'codex.log');
  const opencodeLog = join(tempRoot, 'opencode.log');
  const countFile = join(tempRoot, 'codex-count.txt');
  const opencodeCountFile = join(tempRoot, 'opencode-count.txt');
  const binPath = join(repoRoot, 'node_modules', '.bin');

  seedTaskArtifacts(cloneRoot);
  if (scenario === 'unblock') {
    seedBlockedFeatureState(cloneRoot);
  }
  if (scenario === 'state-correction-missing-active-task') {
    seedMalformedFeatureState(cloneRoot);
  }
  writeExecutableScript(codexMock, CODEX_MOCK_SCRIPT);
  writeExecutableScript(opencodeMock, OPENCODE_MOCK_SCRIPT);

  const runResult = spawnSync(
    tsxBinary,
    ['proto/protoCompassRose.ts', 'run', '--loop', ...(commitEnabled ? [] : ['--no-commit'])],
    {
      cwd: cloneRoot,
      env: {
        ...process.env,
        PATH: `${binPath}:${process.env.PATH ?? ''}`,
        PROTO_COMPASSROSE_CODEX_COMMAND: codexMock,
        PROTO_COMPASSROSE_OPENCODE_COMMAND: opencodeMock,
        PROTO_COMPASSROSE_SKIP_CLEAN_CHECK: '1',
        PROTO_E2E_ROOT: tempRoot,
        PROTO_E2E_SCENARIO: scenario,
        PROTO_E2E_CODEX_LOG: codexLog,
        PROTO_E2E_OPENCODE_LOG: opencodeLog,
        PROTO_E2E_OPENCODE_COUNT: opencodeCountFile,
        PROTO_E2E_CODEX_COUNT: countFile,
      },
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  const expectedExitCodes = expectedProtoExitCodesForScenario(scenario);
  if (!expectedExitCodes.includes(runResult.status ?? -1)) {
    process.stderr.write(`proto run failed unexpectedly:\n${runResult.stderr || runResult.stdout}\n`);
    process.stderr.write(`temp workspace preserved at ${tempRoot}\n`);
    return 1;
  }

  const codexCalls = countLines(codexLog);
  const opencodeCalls = countLines(opencodeLog);
  const runSummaryPath = join(cloneRoot, '.git', 'proto-compassrose', 'latest-run.json');
  const runSummary = JSON.parse(readFileSync(runSummaryPath, 'utf8')) as {
    run_id?: string;
    status?: string;
    exit_code?: number;
    steps?: Array<{ decision?: { kind?: string }; summary?: string; continue_loop?: boolean; exit_code?: number }>;
  };
  const markerPath = join(cloneRoot, 'proto', markerFileNameForScenario(scenario));
  const markerExists = existsSync(markerPath);
  const featureTasksDirectory = join(cloneRoot, 'docs', 'features', '002-configuration-model', 'tasks');
  const protoTasksDirectory = join(cloneRoot, '.git', 'proto-compassrose', 'tasks');
  const blockerProfilePath = join(
    cloneRoot,
    '.git',
    'proto-compassrose',
    'blockers',
    `${runSummary.run_id ?? 'run'}-F002-T04-blocked.json`,
  );
  const unblockTaskPath = join(cloneRoot, '.git', 'proto-compassrose', 'tasks', 'F002-T04-U1.json');
  const correctionTaskPath = join(cloneRoot, '.git', 'proto-compassrose', 'tasks', 'F002-T04-C1.json');
  const taskInterfaceAnalysisPath = join(cloneRoot, '.git', 'proto-compassrose', 'task-interface-analysis', 'F002-T04.json');
  const recoveryLessonPath = join(cloneRoot, '.git', 'proto-compassrose', 'latest-recovery-lesson.json');
  const stateCorrectionTaskPath = join(cloneRoot, '.git', 'proto-compassrose', 'tasks', 'F002-T05-C1.json');
  const implementationAttemptHistoryPath = join(
    cloneRoot,
    '.git',
    'proto-compassrose',
    'implementation-attempts',
    'F002-T04.json',
  );
  const stateCorrectionDocPath = join(
    cloneRoot,
    'docs',
    'features',
    '002-configuration-model',
    'tasks',
    '005.1-repair-feature-state-for-f002-t05.md',
  );
  const malformedFeatureStatePath = join(cloneRoot, 'docs', 'features', '002-configuration-model', 'state.md');
  const worktreeStatus = spawnSync('git', ['status', '--porcelain'], {
    cwd: cloneRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (worktreeStatus.status !== 0) {
    process.stderr.write(`git status failed:\n${worktreeStatus.stderr || worktreeStatus.stdout}\n`);
    return 1;
  }
  const ignoredWorktreePaths = new Set(['proto/protoCompassRose.ts']);
  const worktreeDirtyLines = (worktreeStatus.stdout || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .filter((line) => !ignoredWorktreePaths.has(line.slice(3).trim()));
  const worktreeClean = worktreeDirtyLines.length === 0;

  const checks = buildScenarioChecks({
    scenario,
    commitEnabled,
    codexCalls,
    opencodeCalls,
    runSummary,
    markerExists,
    blockerProfilePath,
    unblockTaskPath,
    correctionTaskPath,
    taskInterfaceAnalysisPath,
    recoveryLessonPath,
    implementationAttemptHistoryPath,
    stateCorrectionTaskPath,
    stateCorrectionDocPath,
    featureTasksDirectory,
    protoTasksDirectory,
    malformedFeatureStatePath,
    worktreeClean,
  });

  for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'}: ${check.name}`);
  }

  if (checks.every((check) => check.ok)) {
    console.log(`codex calls: ${codexCalls}`);
    console.log(`opencode calls: ${opencodeCalls}`);
    rmSync(tempRoot, { recursive: true, force: true });
    return 0;
  }

  process.stderr.write(`temp workspace preserved at ${tempRoot}\n`);
  return 1;
}

function buildScenarioChecks(input: {
  scenario: string;
  commitEnabled: boolean;
  codexCalls: number;
  opencodeCalls: number;
  runSummary: { status?: string; exit_code?: number; steps?: Array<{ decision?: { kind?: string }; summary?: string; continue_loop?: boolean; exit_code?: number }>; run_id?: string };
  markerExists: boolean;
  blockerProfilePath: string;
  unblockTaskPath: string;
  correctionTaskPath: string;
  taskInterfaceAnalysisPath: string;
  recoveryLessonPath: string;
  implementationAttemptHistoryPath: string;
  stateCorrectionTaskPath: string;
  stateCorrectionDocPath: string;
  featureTasksDirectory: string;
  protoTasksDirectory: string;
  malformedFeatureStatePath: string;
  worktreeClean: boolean;
}): Array<{ name: string; ok: boolean }> {
  const {
    scenario,
    commitEnabled,
    codexCalls,
    opencodeCalls,
    runSummary,
    markerExists,
    blockerProfilePath,
    unblockTaskPath,
    correctionTaskPath,
    taskInterfaceAnalysisPath,
    recoveryLessonPath,
    implementationAttemptHistoryPath,
    stateCorrectionTaskPath,
    stateCorrectionDocPath,
    featureTasksDirectory,
    protoTasksDirectory,
    malformedFeatureStatePath,
    worktreeClean,
  } = input;

  if (scenario === 'recoverable-review-blocked') {
    return [
      { name: 'codex was called enough times to recover from a blocked review', ok: codexCalls >= 5 },
      { name: 'opencode was called at least twice', ok: opencodeCalls >= 2 },
      { name: 'run completed successfully', ok: runSummary.status === 'completed' && runSummary.exit_code === 0 },
      { name: 'recoverable blocker created an unblock task', ok: existsSync(unblockTaskPath) && runSummary.steps?.some((step) => step.decision?.kind === 'unblock_task') === true },
      { name: 'blocked review recorded a blocker profile', ok: existsSync(blockerProfilePath) },
      { name: 'opencode touched the repo', ok: markerExists },
    ];
  }

  if (scenario === 'terminal-review-blocked') {
    return [
      { name: 'codex was called enough times to surface a blocked review', ok: codexCalls >= 2 },
      { name: 'opencode was called exactly once', ok: opencodeCalls === 1 },
      { name: 'run stopped with a blocked status', ok: runSummary.status === 'stopped' && runSummary.exit_code === 2 },
      { name: 'terminal blocker recorded a blocker profile', ok: existsSync(blockerProfilePath) },
      { name: 'no unblock task was created', ok: !existsSync(unblockTaskPath) },
      { name: 'opencode touched the repo', ok: markerExists },
    ];
  }

  if (scenario === 'interface-gap') {
    const analysis = readJsonIfExists(taskInterfaceAnalysisPath);
    const recommendedAction = typeof analysis?.recommended_action === 'string' ? analysis.recommended_action : null;
    const limitationCount = Array.isArray(analysis?.implementer_limitations) ? analysis.implementer_limitations.length : 0;
    const adjustmentCount = Array.isArray(analysis?.task_interface_adjustments?.context_additions)
      ? analysis.task_interface_adjustments.context_additions.length
      : 0;
    const recoveryLesson = readJsonIfExists(recoveryLessonPath);
    const recoveryLessonScopeCount = Array.isArray(recoveryLesson?.scope_isolation_notes) ? recoveryLesson.scope_isolation_notes.length : 0;
    const correctedTaskExecuted = runSummary.steps?.some((step) => step.decision?.kind === 'correct_task') === true;

    return [
      { name: 'codex was called enough times for review analysis and correction recovery', ok: codexCalls >= 8 },
      { name: 'opencode was called twice for the original task and the correction task', ok: opencodeCalls === 2 },
      { name: 'run completed successfully after the correction recovery loop', ok: runSummary.status === 'completed' && runSummary.exit_code === 0 },
      { name: 'task-interface analysis was recorded', ok: analysis !== null },
      {
        name: 'task-interface analysis captured a limitation-oriented recommendation',
        ok: recommendedAction === 'tighten_task_interface' || recommendedAction === 'document_implementer_limitation' || recommendedAction === 'both',
      },
      { name: 'task-interface analysis recorded at least one limitation or adjustment', ok: limitationCount > 0 || adjustmentCount > 0 },
      { name: 'recovery lesson was recorded', ok: recoveryLesson !== null },
      { name: 'recovery lesson recorded scope isolation guidance', ok: recoveryLessonScopeCount > 0 },
      { name: 'the correction task was executed after review requested changes', ok: correctedTaskExecuted },
      { name: 'correction task was created', ok: existsSync(correctionTaskPath) },
      { name: 'opencode touched the repo', ok: markerExists },
      ...(commitEnabled ? [{ name: 'committed recovery steps left a clean worktree', ok: worktreeClean }] : []),
    ];
  }

  if (scenario === 'implementation-retry') {
    const history = readJsonIfExists(implementationAttemptHistoryPath);
    const attempts = Array.isArray(history?.attempts) ? history.attempts : [];
    const firstAttemptStatus = typeof attempts[0]?.status === 'string' ? attempts[0].status : null;
    const secondAttemptStatus = typeof attempts[1]?.status === 'string' ? attempts[1].status : null;

    return [
      { name: 'codex was called enough times to select, review, and stop', ok: codexCalls >= 3 },
      { name: 'opencode was called twice for the retry path', ok: opencodeCalls === 2 },
      { name: 'run completed successfully', ok: runSummary.status === 'completed' && runSummary.exit_code === 0 },
      { name: 'implementation retry history was recorded', ok: history !== null && attempts.length === 2 },
      {
        name: 'implementation retry recorded a failed first attempt and a successful retry',
        ok: firstAttemptStatus === 'failed' && secondAttemptStatus === 'success' && history?.retried_after_partial_changes === true,
      },
      { name: 'opencode touched the repo', ok: markerExists },
    ];
  }

  if (scenario === 'state-correction-missing-active-task') {
    const malformedFeatureState = existsSync(malformedFeatureStatePath) ? readFileSync(malformedFeatureStatePath, 'utf8') : '';
    const stateCorrectionArtifactExists = readdirSync(protoTasksDirectory).some(
      (entry) => /^F002-T05-C\d+\.json$/.test(entry),
    );
    const stateCorrectionDocumentExists = readdirSync(featureTasksDirectory).some(
      (entry) => /^005\.\d+-repair-feature-state-for-f002-t05\.md$/.test(entry),
    );

    return [
      { name: 'codex was called enough times to repair malformed state', ok: codexCalls >= 2 },
      { name: 'opencode was not called', ok: opencodeCalls === 0 },
      { name: 'run completed successfully', ok: runSummary.status === 'completed' && runSummary.exit_code === 0 },
      { name: 'state correction task was recorded', ok: stateCorrectionArtifactExists },
      { name: 'state correction document was written', ok: stateCorrectionDocumentExists },
      {
        name: 'feature state now records correction pending',
        ok:
          malformedFeatureState.includes('## Lifecycle State\n\ncorrection_pending') &&
          malformedFeatureState.includes('- active_task: F002-T05') &&
          /- active_correction_task: `?F002-T05-C\d+`?/.test(malformedFeatureState),
      },
      ...(commitEnabled ? [{ name: 'committed recovery steps left a clean worktree', ok: worktreeClean }] : []),
    ];
  }

  if (scenario === 'unblock') {
    return [
      { name: 'codex was called at least five times', ok: codexCalls >= 5 },
      { name: 'opencode was called at least once', ok: opencodeCalls >= 1 },
      { name: 'run completed successfully', ok: runSummary.status === 'completed' && runSummary.exit_code === 0 },
      { name: 'opencode touched the repo', ok: markerExists },
    ];
  }

  return [
    { name: 'codex was called at least three times', ok: codexCalls >= 3 },
    { name: 'opencode was called at least once', ok: opencodeCalls >= 1 },
    { name: 'run completed successfully', ok: runSummary.status === 'completed' && runSummary.exit_code === 0 },
    { name: 'opencode touched the repo', ok: markerExists },
  ];
}

function readJsonIfExists(path: string): any | null {
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, 'utf8'));
}

function expectedProtoExitCodesForScenario(scenario: string): readonly number[] {
  if (scenario === 'terminal-review-blocked') {
    return [2];
  }

  return [0];
}

function markerFileNameForScenario(scenario: string): string {
  switch (scenario) {
    case 'unblock':
      return 'unblock-e2e.txt';
    case 'recoverable-review-blocked':
      return 'recoverable-review-blocked.txt';
    case 'terminal-review-blocked':
      return 'terminal-review-blocked.txt';
    case 'interface-gap':
      return 'interface-gap.txt';
    case 'state-correction-missing-active-task':
      return 'state-correction-missing-active-task.txt';
    case 'implementation-retry':
      return 'implementation-retry.txt';
    default:
      return 'e2e-control.txt';
  }
}

function syncPrototypeRuntime(repoRoot: string, cloneRoot: string): void {
  const sourcePath = join(repoRoot, 'proto', 'protoCompassRose.ts');
  const targetPath = join(cloneRoot, 'proto', 'protoCompassRose.ts');
  writeFileSync(targetPath, readFileSync(sourcePath, 'utf8'), 'utf8');
}

function syncFeatureStateDocs(repoRoot: string, cloneRoot: string): void {
  const sourceRoot = join(repoRoot, 'docs', 'features');
  const targetRoot = join(cloneRoot, 'docs', 'features');

  for (const entry of readdirSync(sourceRoot)) {
    const sourceState = join(sourceRoot, entry, 'state.md');
    if (!existsSync(sourceState) || !statSync(sourceState).isFile()) {
      continue;
    }

    const targetState = join(targetRoot, entry, 'state.md');
    mkdirSync(dirname(targetState), { recursive: true });
    writeFileSync(targetState, readFileSync(sourceState, 'utf8'), 'utf8');
  }
}

function normalizeClonedWorktree(cloneRoot: string): void {
  const statusResult = spawnSync('git', ['status', '--porcelain'], {
    cwd: cloneRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (statusResult.status !== 0) {
    throw new Error(`Unable to inspect clone status:\n${statusResult.stderr || statusResult.stdout}`);
  }

  const lines = (statusResult.stdout || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    const filePath = line.slice(3).trim();
    if (!filePath) {
      continue;
    }

    if (line.startsWith('?? ')) {
      rmSync(join(cloneRoot, filePath), { recursive: true, force: true });
      continue;
    }

    const restored = spawnSync('git', ['show', `HEAD:${filePath}`], {
      cwd: cloneRoot,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });

    if (restored.status !== 0) {
      throw new Error(`Unable to restore ${filePath} from HEAD:\n${restored.stderr || restored.stdout}`);
    }

    mkdirSync(dirname(join(cloneRoot, filePath)), { recursive: true });
    writeFileSync(join(cloneRoot, filePath), restored.stdout, 'utf8');
  }
}

function countLines(path: string): number {
  if (!existsSync(path)) {
    return 0;
  }

  const content = readFileSync(path, 'utf8').trim();
  if (content.length === 0) {
    return 0;
  }

  return content.split('\n').length;
}

function writeExecutableScript(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf8');
  chmodSync(path, 0o755);
}

function seedTaskArtifacts(cloneRoot: string): void {
  const artifactsRoot = join(cloneRoot, '.git', 'proto-compassrose', 'tasks');
  mkdirSync(artifactsRoot, { recursive: true });
  writeFileSync(
    join(artifactsRoot, 'F002-T04.json'),
    `${JSON.stringify(SEEDED_TASK, null, 2)}\n`,
    'utf8',
  );
}

function seedBlockedFeatureState(cloneRoot: string): void {
  const statePath = join(cloneRoot, 'docs', 'features', '002-configuration-model', 'state.md');
  writeFileSync(statePath, BLOCKED_STATE_SEED, 'utf8');
}

function seedMalformedFeatureState(cloneRoot: string): void {
  const statePath = join(cloneRoot, 'docs', 'features', '002-configuration-model', 'state.md');
  writeFileSync(statePath, MALFORMED_STATE_MISSING_ACTIVE_TASK_SEED, 'utf8');
}

const CODEX_MOCK_SCRIPT = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const countFile = process.env.PROTO_E2E_CODEX_COUNT;
const logFile = process.env.PROTO_E2E_CODEX_LOG;
const scenario = process.env.PROTO_E2E_SCENARIO || 'standard';
const outputPath = readArgValue(args, '-o');
const count = readCount(countFile) + 1;

writeCount(countFile, count);
appendLog(logFile, \`call \${count}: \${args.join(' ')}\`);

let payload;
if (scenario === 'unblock') {
  if (count === 1) {
    payload = {
      kind: 'unblock_task',
      feature_id: '002-configuration-model',
      task_id: null,
      correction_task_id: null,
      reason: 'e2e mock: recover from recoverable blocker',
    };
  } else if (count === 2) {
    payload = {
      task: {
        task_id: 'F002-T05-U1',
        feature_id: '002-configuration-model',
        title: 'Restore progress after a recoverable blocker',
        objective: 'Use the blocked-from target in feature state so the feature can resume from task readiness.',
        first_executable_step: 'Open docs/features/002-configuration-model/state.md and confirm the blocked-from target to restore.',
        minimum_progress_evidence: [
          'docs/features/002-configuration-model/state.md records a blocked-from target.',
          'The unblock task has a concrete path to restore the feature to task_ready.',
        ],
        trace: {
          roadmap_objective: 'Deterministic Orchestration',
          feature_goal: 'Recover from a recoverable blocker without widening the feature scope.',
          state_gap: 'The feature state needs an unblock path that can restore progress after a recoverable blocker.',
        },
        context: {
          summary: 'The feature is blocked, but the blocked-from target is known.',
          relevant_paths: [
            'docs/features/002-configuration-model/state.md',
            'docs/compassrose/PROJECT_STATE.md',
            'src/contracts/runtime/operation-loop.md',
            'src/contracts/state/feature-state.md',
          ],
          relevant_modules: ['Feature state', 'Project state', 'Runtime operation loop'],
        },
        scope: {
          allowed_paths: [
            'docs/features/002-configuration-model/state.md',
            'docs/compassrose/PROJECT_STATE.md',
            'proto/unblock-e2e.txt',
          ],
          forbidden_paths: [
            'src/cli/main.ts',
            'src/config/configReader.ts',
            'src/doctor/projectState.ts',
          ],
        },
        constraints: [
          'Keep the unblock task narrowly focused on restoring progress from the blocked-from target.',
          'Do not broaden the feature scope.',
        ],
        development_policy: {
          mode: 'documentation_first',
        },
        quality_gates: {
          before_review: ['git diff --check'],
        },
        acceptance_criteria: [
          'The blocked-from target is explicit and usable for restoration.',
          'The unblock task keeps the feature narrow and reviewable.',
        ],
        expected_deliverables: ['documentation'],
      },
    };
  } else if (count === 3) {
    payload = {
      kind: 'implement_task',
      feature_id: null,
      task_id: 'F002-T05-U1',
      correction_task_id: null,
      reason: 'e2e mock: implement unblock task',
    };
  } else if (count === 4) {
    payload = {
      kind: 'review_task',
      feature_id: null,
      task_id: 'F002-T05-U1',
      correction_task_id: null,
      reason: 'e2e mock: review unblock task',
    };
  } else if (count === 5) {
    payload = {
      task_id: 'F002-T05-U1',
      status: 'approved',
      summary: 'e2e mock review approved the unblock task',
      acceptance: {
        criteria: [
          {
            criterion: 'prototype can plan and execute unblock tasks',
            status: 'passed',
            notes: 'observed through mock invocations',
          },
        ],
      },
      findings: [],
      scope_check: {
        status: 'passed',
        unrelated_changes: [],
      },
      quality_gate_check: {
        status: 'passed',
        failed_gates: [],
      },
      correction_task: null,
      project_state_update_hint: null,
    };
  } else {
    payload = {
      kind: 'stop',
      feature_id: null,
      task_id: null,
      correction_task_id: null,
      reason: 'e2e mock: stop',
    };
  }
} else if (scenario === 'recoverable-review-blocked') {
  if (count === 1) {
    payload = {
      kind: 'implement_task',
      feature_id: null,
      task_id: 'F002-T04',
      correction_task_id: null,
      reason: 'e2e mock: implement task before blocked review',
    };
  } else if (count === 2) {
    payload = {
      kind: 'review_task',
      feature_id: null,
      task_id: 'F002-T04',
      correction_task_id: null,
      reason: 'e2e mock: selector chooses review after implementation',
    };
  } else if (count === 3) {
    payload = {
      task_id: 'F002-T04',
      status: 'blocked',
      summary: 'recoverable blocker: the task needs an unblock pass before review can proceed',
      acceptance: {
        criteria: [
          {
            criterion: 'prototype recovers from a blocked review',
            status: 'passed',
            notes: 'observed through mock invocations',
          },
        ],
      },
      findings: [
        {
          severity: 'blocker',
          message: 'The blocker is recoverable by planning a focused unblock task.',
          path: null,
          related_acceptance_criterion: 'prototype recovers from a blocked review',
        },
      ],
      scope_check: {
        status: 'passed',
        unrelated_changes: [],
      },
      quality_gate_check: {
        status: 'passed',
        failed_gates: [],
      },
      correction_task: null,
      project_state_update_hint: 'Plan an unblock task for the recoverable blocker.',
    };
  } else if (count === 4) {
    payload = {
      task_id: 'F002-T04',
      review_status: 'blocked',
      summary: 'A focused unblock task should tighten the interface before the task continues.',
      recommended_action: 'both',
      perfectible: true,
      implementer_limitations: [
        'The current task interface leaves too much room for interpretation once a review reports a blocker.',
      ],
      task_interface_adjustments: {
        first_executable_step: 'Make the unblock task opening step a single concrete file or command.',
        minimum_progress_evidence: [
          'The unblock task shows a narrower first executable step.',
        ],
        context_additions: [
          'Call out the exact blocker signature that the unblock task must address.',
        ],
        scope_adjustments: [
          'Keep the unblock task focused on the blocker and the task interface only.',
        ],
        acceptance_criteria_adjustments: [
          'Require the unblock task to state the restoration target explicitly.',
        ],
        quality_gate_adjustments: [
          'Keep the quick diff check as the only gate.',
        ],
      },
      notes_for_documentation: [
        'Review-blocked recovery should record whether the task interface can be tightened for future runs.',
      ],
    };
  } else if (count === 5) {
    payload = {
      kind: 'unblock_task',
      feature_id: '002-configuration-model',
      task_id: null,
      correction_task_id: null,
      reason: 'e2e mock: recover from blocked review',
    };
  } else if (count === 6) {
    payload = {
      task: {
        task_id: 'F002-T04-U1',
        feature_id: '002-configuration-model',
        title: 'Restore progress after a blocked review',
        objective: 'Use the blocked-from target in feature state so the feature can resume after a recoverable blocked review.',
        first_executable_step: 'Open docs/features/002-configuration-model/state.md and confirm the blocked-from target to restore.',
        minimum_progress_evidence: [
          'docs/features/002-configuration-model/state.md records a blocked-from target.',
          'The unblock task restores the feature to task_ready after review blockage.',
        ],
        trace: {
          roadmap_objective: 'Deterministic Orchestration',
          feature_goal: 'Recover from a recoverable review blocker without widening the feature scope.',
          state_gap: 'The feature state needs an unblock path after the review has blocked execution.',
        },
        context: {
          summary: 'The review reported a recoverable blocker, so the feature should restore task readiness.',
          relevant_paths: [
            'docs/features/002-configuration-model/state.md',
            'docs/compassrose/PROJECT_STATE.md',
            'src/contracts/runtime/operation-loop.md',
            'src/contracts/state/feature-state.md',
          ],
          relevant_modules: ['Feature state', 'Project state', 'Runtime operation loop'],
        },
        scope: {
          allowed_paths: [
            'docs/features/002-configuration-model/state.md',
            'docs/compassrose/PROJECT_STATE.md',
            'proto/recoverable-review-blocked.txt',
          ],
          forbidden_paths: [
            'src/cli/main.ts',
            'src/config/configReader.ts',
            'src/doctor/projectState.ts',
          ],
        },
        constraints: [
          'Keep the unblock task narrowly focused on restoring progress after a blocked review.',
          'Do not broaden the feature scope.',
        ],
        development_policy: {
          mode: 'documentation_first',
        },
        quality_gates: {
          before_review: ['git diff --check'],
        },
        acceptance_criteria: [
          'The blocked-from target is explicit and usable for restoration.',
          'The unblock task keeps the feature narrow and reviewable.',
        ],
        expected_deliverables: ['documentation'],
      },
    };
  } else if (count === 7) {
    payload = {
      kind: 'implement_task',
      feature_id: null,
      task_id: 'F002-T04-U1',
      correction_task_id: null,
      reason: 'e2e mock: implement unblock task after blocked review',
    };
  } else if (count === 8) {
    payload = {
      kind: 'review_task',
      feature_id: null,
      task_id: 'F002-T04-U1',
      correction_task_id: null,
      reason: 'e2e mock: review unblock task after blocked review',
    };
  } else if (count === 9) {
    payload = {
      task_id: 'F002-T04-U1',
      status: 'approved',
      summary: 'e2e mock review approved the unblock task after a blocked review',
      acceptance: {
        criteria: [
          {
            criterion: 'prototype can recover from a blocked review via unblock tasks',
            status: 'passed',
            notes: 'observed through mock invocations',
          },
        ],
      },
      findings: [],
      scope_check: {
        status: 'passed',
        unrelated_changes: [],
      },
      quality_gate_check: {
        status: 'passed',
        failed_gates: [],
      },
      correction_task: null,
      project_state_update_hint: null,
    };
  } else {
    payload = {
      kind: 'stop',
      feature_id: null,
      task_id: null,
      correction_task_id: null,
      reason: 'e2e mock: stop after unblock planning',
    };
  }
} else if (scenario === 'state-correction-missing-active-task') {
  if (count === 1) {
    payload = {
      kind: 'correct_state',
      feature_id: '002-configuration-model',
      task_id: null,
      correction_task_id: null,
      reason: 'e2e mock: feature state is malformed and missing active_task',
    };
  } else {
    payload = {
      kind: 'stop',
      feature_id: null,
      task_id: null,
      correction_task_id: null,
      reason: 'e2e mock: stop after state correction planning',
    };
  }
} else if (scenario === 'terminal-review-blocked') {
  if (count === 1) {
    payload = {
      kind: 'implement_task',
      feature_id: null,
      task_id: 'F002-T04',
      correction_task_id: null,
      reason: 'e2e mock: implement task before terminal blocker',
    };
  } else if (count === 2) {
    payload = {
      kind: 'review_task',
      feature_id: null,
      task_id: 'F002-T04',
      correction_task_id: null,
      reason: 'e2e mock: selector chooses review before terminal blocker',
    };
  } else if (count === 3) {
    payload = {
      task_id: 'F002-T04',
      status: 'blocked',
      summary: 'terminal blocker: the environment cannot recover without human intervention',
      acceptance: {
        criteria: [
          {
            criterion: 'prototype stops when a terminal blocker is reported',
            status: 'passed',
            notes: 'observed through mock invocations',
          },
        ],
      },
      findings: [
        {
          severity: 'blocker',
          message: 'The environment is unavailable and the failure is terminal.',
          path: null,
          related_acceptance_criterion: 'prototype stops when a terminal blocker is reported',
        },
      ],
      scope_check: {
        status: 'passed',
        unrelated_changes: [],
      },
      quality_gate_check: {
        status: 'skipped',
        failed_gates: [],
      },
      correction_task: null,
      project_state_update_hint: null,
    };
  } else if (count === 4) {
    payload = {
      task_id: 'F002-T04',
      review_status: 'blocked',
      summary: 'The blocker is terminal and should be documented as a limitation of the implementer or environment.',
      recommended_action: 'document_implementer_limitation',
      perfectible: false,
      implementer_limitations: [
        'The failure is terminal and cannot be resolved by tightening the task interface alone.',
      ],
      task_interface_adjustments: {
        first_executable_step: null,
        minimum_progress_evidence: [],
        context_additions: [],
        scope_adjustments: [],
        acceptance_criteria_adjustments: [],
        quality_gate_adjustments: [],
      },
      notes_for_documentation: [
        'Terminal blockers should stop the loop and be preserved for human follow-up.',
      ],
    };
  } else {
    payload = {
      kind: 'stop',
      feature_id: null,
      task_id: null,
      correction_task_id: null,
      reason: 'e2e mock: stop after terminal blocker',
    };
  }
} else if (scenario === 'interface-gap') {
  if (count === 1) {
    payload = {
      kind: 'implement_task',
      feature_id: null,
      task_id: 'F002-T04',
      correction_task_id: null,
      reason: 'e2e mock: implement task with interface gap',
    };
  } else if (count === 2) {
    payload = {
      kind: 'review_task',
      feature_id: null,
      task_id: 'F002-T04',
      correction_task_id: null,
      reason: 'e2e mock: selector chooses review after implementation',
    };
  } else if (count === 3) {
    payload = {
      task_id: 'F002-T04',
      status: 'changes_required',
      summary: 'The submission mixed the task patch with orchestration state docs, so the reviewable diff needs a narrower recovery boundary.',
      acceptance: {
        criteria: [
          {
            criterion: 'prototype records interface adjustments, model limitations, or scope-isolation lessons',
            status: 'failed',
            notes: 'The current submission leaks runtime state into the reviewable diff and still leaves the implementer with avoidable ambiguity.',
          },
        ],
      },
      findings: [
        {
          severity: 'warning',
          message: 'The reviewable diff includes docs/compassrose/PROJECT_STATE.md and docs/features/002-configuration-model/state.md, so the recovery boundary needs to exclude orchestration state.',
          path: null,
          related_acceptance_criterion: 'prototype records interface adjustments, model limitations, or scope-isolation lessons',
        },
      ],
      scope_check: {
        status: 'failed',
        unrelated_changes: [
          'docs/compassrose/PROJECT_STATE.md',
          'docs/features/002-configuration-model/state.md',
        ],
      },
      quality_gate_check: {
        status: 'passed',
        failed_gates: [],
      },
      correction_task: {
        parent_task_id: 'F002-T04',
        correction_task_id: 'F002-T04-C1',
        feature_id: '002-configuration-model',
        title: 'Tighten the task interface for the implementer',
        objective: 'Reduce ambiguity in the task so the implementer can proceed with less context leakage.',
        first_executable_step: 'Revise the task prompt to make the first executable step concrete.',
        minimum_progress_evidence: [
          'The task interface analysis records the ambiguity and a concrete adjustment.',
          'The correction task narrows the interface instead of expanding scope.',
        ],
        review_findings: ['The implementer needed a tighter first step to proceed safely.'],
        scope: {
          allowed_paths: [
            'docs/features/002-configuration-model/tasks/F002-T04.md',
            'docs/features/002-configuration-model/tasks/F002-T04-C1.md',
            'proto/interface-gap.txt',
          ],
          forbidden_paths: ['src/cli/main.ts', 'src/config/configReader.ts'],
        },
        constraints: [
          'Only change the task interface enough to remove the ambiguity.',
          'Do not broaden the task scope.',
        ],
        acceptance_criteria: [
          'The task interface is narrower and clearer.',
          'The implementer limitation is documented if no further tightening is possible.',
        ],
        quality_gates: {
          before_review: ['node -e "process.exit(0)"'],
        },
      },
      project_state_update_hint: 'Task interface and scope isolation were tightened to recover from the mixed submission.',
    };
  } else if (count === 4) {
    payload = {
      task_id: 'F002-T04',
      review_status: 'changes_required',
      summary: 'The implementer needs a narrower first step and the task should document the limitation.',
      recommended_action: 'both',
      perfectible: true,
      implementer_limitations: [
        'The implementer struggled because the first executable step allowed too much interpretation.',
      ],
      task_interface_adjustments: {
        first_executable_step: 'Make the opening action a single file or single command.',
        minimum_progress_evidence: [
          'The correction task includes a tighter first executable step.',
        ],
        context_additions: [
          'State the exact repository file that should be read first.',
        ],
        scope_adjustments: [
          'Keep the correction focused on the task interface only.',
        ],
        acceptance_criteria_adjustments: [
          'Say explicitly that the first step must be concrete and bounded.',
        ],
        quality_gate_adjustments: [
          'Keep the existing quick quality gate.',
        ],
      },
      notes_for_documentation: [
        'The project should remember that task interfaces may need to encode model limitations explicitly.',
        'Recovery lessons should also preserve scope-isolation guidance when reviewable diffs leak orchestration state.',
      ],
    };
  } else if (count === 5) {
    payload = {
      kind: 'correct_task',
      feature_id: null,
      task_id: null,
      correction_task_id: 'F002-T04-C1',
      reason: 'e2e mock: execute correction task after recovery lesson',
    };
  } else if (count === 6) {
    payload = {
      kind: 'review_task',
      feature_id: null,
      task_id: 'F002-T04-C1',
      correction_task_id: null,
      reason: 'e2e mock: review correction task after recovery lesson',
    };
  } else if (count === 7) {
    payload = {
      task_id: 'F002-T04-C1',
      status: 'approved',
      summary: 'e2e mock review approved the correction task and preserved the recovery lesson',
      acceptance: {
        criteria: [
          {
            criterion: 'prototype recovers from a blocked review and completes the correction',
            status: 'passed',
            notes: 'observed through mock invocations',
          },
        ],
      },
      findings: [],
      scope_check: {
        status: 'passed',
        unrelated_changes: [],
      },
      quality_gate_check: {
        status: 'passed',
        failed_gates: [],
      },
      correction_task: null,
      project_state_update_hint: null,
    };
  } else {
    payload = {
      kind: 'stop',
      feature_id: null,
      task_id: null,
      correction_task_id: null,
      reason: 'e2e mock: stop after interface-gap analysis',
    };
  }
} else if (count === 1) {
  payload = {
    kind: 'implement_task',
    feature_id: null,
    task_id: 'F002-T04',
    correction_task_id: null,
    reason: 'e2e mock: implement task',
  };
} else if (count === 2) {
  payload = {
    kind: 'review_task',
    feature_id: null,
    task_id: 'F002-T04',
    correction_task_id: null,
    reason: 'e2e mock: review task',
  };
} else if (count === 3) {
  payload = {
    task_id: 'F002-T04',
    status: 'approved',
    summary: 'e2e mock review approved the implementation',
    acceptance: {
      criteria: [
        {
          criterion: 'prototype invokes both codex and opencode',
          status: 'passed',
          notes: 'observed through mock invocations',
        },
      ],
    },
    findings: [],
    scope_check: {
      status: 'passed',
      unrelated_changes: [],
    },
    quality_gate_check: {
      status: 'passed',
      failed_gates: [],
    },
    correction_task: null,
    project_state_update_hint: null,
  };
} else {
  payload = {
    kind: 'stop',
    feature_id: null,
    task_id: null,
    correction_task_id: null,
    reason: 'e2e mock: stop',
  };
}

if (outputPath) {
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

function readCount(filePath) {
  try {
    return Number.parseInt(fs.readFileSync(filePath, 'utf8'), 10) || 0;
  } catch {
    return 0;
  }
}

function writeCount(filePath, value) {
  fs.writeFileSync(filePath, String(value), 'utf8');
}

function appendLog(filePath, line) {
  fs.appendFileSync(filePath, \`\${JSON.stringify({ line })}\\n\`, 'utf8');
}
`;

const OPENCODE_MOCK_SCRIPT = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = process.cwd();
const logFile = process.env.PROTO_E2E_OPENCODE_LOG;
const countFile = process.env.PROTO_E2E_OPENCODE_COUNT;
const scenario = process.env.PROTO_E2E_SCENARIO || 'standard';
const markerPath = path.join(repoRoot, 'proto', markerFileNameForScenario(scenario));
const prompt = process.argv.slice(2).join(' ');
const count = readCount(countFile) + 1;

fs.mkdirSync(path.dirname(markerPath), { recursive: true });
fs.writeFileSync(markerPath, 'opencode e2e touched this file\\n', 'utf8');

fs.appendFileSync(logFile, JSON.stringify({ cwd: repoRoot, prompt, count }) + '\\n', 'utf8');

if (scenario === 'implementation-retry' && count === 1) {
  writeCount(countFile, count);
  process.exit(1);
}

writeCount(countFile, count);
process.exit(0);

function markerFileNameForScenario(scenario) {
  switch (scenario) {
    case 'unblock':
      return 'unblock-e2e.txt';
    case 'recoverable-review-blocked':
      return 'recoverable-review-blocked.txt';
    case 'terminal-review-blocked':
      return 'terminal-review-blocked.txt';
    case 'interface-gap':
      return 'interface-gap.txt';
    case 'state-correction-missing-active-task':
      return 'state-correction-missing-active-task.txt';
    case 'implementation-retry':
      return 'implementation-retry.txt';
    default:
      return 'e2e-control.txt';
  }
}

function readCount(filePath) {
  try {
    return Number.parseInt(fs.readFileSync(filePath, 'utf8'), 10) || 0;
  } catch {
    return 0;
  }
}

function writeCount(filePath, value) {
  if (!filePath) {
    return;
  }

  fs.writeFileSync(filePath, String(value), 'utf8');
}
`;

const SEEDED_TASK = {
  task: {
    task_id: 'F002-T04',
    feature_id: '002-configuration-model',
    title: 'Validate runtime-precondition policy fields in the project config loader',
    objective:
      'Extend the repository-local configuration model so runtime orchestration can safely consume execution, roles, and git_policy from docs/compassrose/CONFIG.md.',
    first_executable_step:
      'Extend ProjectConfiguration in src/config/configTypes.ts with typed execution, roles, and git_policy sections that match the canonical keys already present in docs/compassrose/CONFIG.md.',
    minimum_progress_evidence: [
      'readProjectConfiguration() returns typed execution, roles, and git_policy data when loading the canonical project config.',
      'Invalid runtime-precondition values such as an unsupported execution.mode, a missing required role entry, or an invalid git_policy value produce field-specific ConfigurationIssue results.',
      'Config-loader tests cover the new runtime-policy fields, and the existing Doctor happy-path test still passes.',
    ],
    trace: {
      roadmap_objective: 'Deterministic Orchestration',
      feature_goal:
        'Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.',
      state_gap: 'The project-local configuration flow still needs to be connected to the broader runtime orchestration loop.',
    },
    context: {
      summary:
        'The repository already has a working Markdown-backed config loader and a Doctor preflight, but the typed configuration surface still stops at the narrow Doctor MVP contract.',
      relevant_paths: [
        'docs/features/002-configuration-model/state.md',
        'docs/compassrose/CONFIG.md',
        'src/contracts/runtime/operation-loop.md',
        'src/cli/main.ts',
        'src/config/configTypes.ts',
        'src/config/configReader.ts',
        'src/doctor/doctorCommand.ts',
        'tests/configReader.test.ts',
      ],
      relevant_modules: ['ProjectConfiguration', 'readProjectConfiguration()', 'runDoctor()'],
    },
    scope: {
      allowed_paths: [
        'src/config/configTypes.ts',
        'src/config/configReader.ts',
        'src/doctor/doctorCommand.ts',
        'tests/configReader.test.ts',
        'tests/doctorCommand.test.ts',
      ],
      forbidden_paths: [
        'docs/compassrose/CONFIG.md',
        'docs/features/002-configuration-model/',
        'src/cli/main.ts',
        'src/doctor/projectState.ts',
        'tests/projectState.test.ts',
      ],
    },
    constraints: [
      'Treat docs/compassrose/CONFIG.md as the only project-level source of truth.',
      'Validate only the runtime-precondition sections needed for the first orchestration handoff.',
      'Keep the implementation provider-independent and limited to repository-owned policy already documented in the canonical config.',
      "Preserve current Doctor behavior on the repository's existing canonical config while expanding the loader contract.",
    ],
    development_policy: {
      mode: 'test_guided',
    },
    quality_gates: {
      before_review: ['node -e "process.exit(0)"', 'test -f package.json'],
    },
    acceptance_criteria: [
      'readProjectConfiguration() succeeds on the current canonical docs/compassrose/CONFIG.md and exposes typed execution, roles, and git_policy values to callers.',
      'The loader reports field-specific validation failures for unsupported execution.mode values, missing required role entries, and invalid git_policy enum or boolean fields.',
      'runDoctor() continues to pass on the happy-path fixture without requiring changes to the documented project config.',
    ],
    expected_deliverables: ['code', 'tests'],
  },
};

const BLOCKED_STATE_SEED = `# State: Configuration Model

## Lifecycle State

blocked

## Source Request

\`request.md\`

## Operational Status

- formalization: complete
- active_task: F002-T05
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: passed
- last_quality_gate_result: passed
- last_review_result: blocked
- last_unblock_result: not_run

## Current Reality

The feature is temporarily blocked, but the suspension target is recorded so an unblock task can restore progress.

## Implemented Deliverables

- feature formalization exists

## Remaining Deliverables

- connect configuration validation to the broader runtime flow

## Outline Progress

- Formalize the configuration model in canonical feature documents: complete
- Stabilize the project-local configuration contract and any gaps in \`docs/compassrose/CONFIG.md\`: complete
- Implement configuration loading and validation for the documented MVP scope: complete
- Connect configuration validation to the doctor/runtime flow and update state based on approved behavior: complete

## Blocked By

- state: deterministic unblock path required

## Blocked From

- lifecycle_state: task_ready
- active_task: F002-T05
- active_correction_task: none
- active_unblock_task: none

## Last Approved Change

Task \`F002-T05\` was approved before the blocker was introduced in the e2e scenario.

## Known Gaps

- The feature needs an unblock task before the active task can resume.

## Next Planning Hint

Execute an unblock task to restore the feature to task readiness.
`;

const MALFORMED_STATE_MISSING_ACTIVE_TASK_SEED = `# State: Configuration Model

## Lifecycle State

task_ready

## Source Request

\`request.md\`

## Operational Status

- formalization: complete
- active_correction_task: none
- last_implementation_result: passed
- last_quality_gate_result: passed
- last_review_result: approved

## Current Reality

The repository already contains \`docs/compassrose/CONFIG.md\` as a project-local CompassRose configuration document with a YAML configuration block, allowed values, override records, isolation rules, and a stabilized MVP Doctor contract.

Task \`F002-T05\` is now planned and ready to execute. Add configuration-backed runtime preflight to the default CLI entrypoint.

CompassRose can now load that project-local configuration, validate the MVP doctor contract, and report the repository readiness checks through \`compassrose doctor\`, including a distinct preflight for the configured project-state document.

The accepted architecture documentation already supports repository-local state, hierarchical configuration precedence, non-invasive external tool integration, configurable review policy, and quality-gate configuration. The MVP contract for Doctor is now explicit: only the project-level scope in \`docs/compassrose/CONFIG.md\` is in scope, the minimum required sections and fields are fixed, and command semantics distinguish missing keys from intentionally empty values.

This feature is now formalized under \`docs/features/002-configuration-model/\`, and the first implementation tasks have now been completed against the configuration target defined in \`docs/compassrose/CONFIG.md\`.

Task \`F002-T04\` has now been approved. The typed configuration loader validates and exposes \`execution\`, \`roles\`, and \`git_policy\` data needed for the first broader orchestration handoff without expanding into feature selection or task execution.

## Implemented Deliverables

- the source feature request exists at \`docs/features/002-configuration-model/request.md\`
- the project-local configuration contract already exists at \`docs/compassrose/CONFIG.md\`
- canonical feature documents now exist for feature \`002-configuration-model\`
- the repository already documents the configuration hierarchy and non-invasive tool expectations in project-wide architecture docs
- the runtime can now load \`docs/compassrose/CONFIG.md\`, validate the MVP doctor contract, and report readiness through \`compassrose doctor\`
- \`compassrose doctor\` now validates \`docs/compassrose/PROJECT_STATE.md\` as a distinct preflight step
- \`readProjectConfiguration()\` now validates and exposes typed \`execution\`, \`roles\`, and \`git_policy\` policy data from the canonical project config

## Remaining Deliverables

- connect configuration validation to the broader runtime flow
- prove the documented configuration model works through approved implementation tasks and quality gates

## Outline Progress

- Formalize the configuration model in canonical feature documents: complete
- Stabilize the project-local configuration contract and any gaps in \`docs/compassrose/CONFIG.md\`: complete
- Implement configuration loading and validation for the documented MVP scope: complete
- Connect configuration validation to the doctor/runtime flow and update state based on approved behavior: complete

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none
- active_unblock_task: none

## Last Approved Change

Task \`F002-T04\` was approved, extending the typed config loader and its tests to validate the first runtime-precondition policy fields from \`docs/compassrose/CONFIG.md\`.

## Known Gaps

- The project-local configuration flow still needs a runtime consumer that uses the validated \`execution\`, \`roles\`, and \`git_policy\` data during orchestration.
- The next task should build on the validated loader and doctor checks rather than redefining the schema.

## Next Planning Hint

Execute \`F002-T05\` when the current execution mode allows it.
`;

const exitCode = main();
process.exitCode = exitCode;
