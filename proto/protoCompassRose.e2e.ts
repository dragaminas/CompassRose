import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { AgentToolName } from '../src/contracts/runtime/agentContext.js';

// Single source of truth for the 'state-correction-missing-active-task' scenario: the fallback task
// artifact that seedStateCorrectionFallbackTaskArtifact() seeds and that the runtime resolves the
// correction task id from (see resolveStateCorrectionActiveTaskFromArtifacts in protoCompassRose.ts).
// Every assertion below must derive its expected file names from this constant instead of re-typing
// the task id, or a rename here will silently stop matching what the runtime actually produces.
const STATE_CORRECTION_FALLBACK_TASK_ID = 'F002-T05';

function taskNumberSlug(taskId: string): string {
  const taskNumber = taskId.match(/-T(\d+)$/)?.[1];
  if (!taskNumber) {
    throw new Error(`Cannot derive a task number slug from task id "${taskId}".`);
  }
  return taskNumber.padStart(3, '0');
}

function main(): number {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const tempRoot = mkdtempSync(join(tmpdir(), 'proto-compassrose-e2e-'));
  const cloneRoot = join(tempRoot, 'repo');
  const tsxBinary = join(repoRoot, 'node_modules', '.bin', 'tsx');
  const scenario = process.env.PROTO_E2E_SCENARIO ?? 'standard';
  const implementerTool = process.env.PROTO_E2E_IMPLEMENTER === 'codex' ? 'codex' : 'opencode';
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
  syncContractFiles(repoRoot, cloneRoot);
  syncFeatureStateDocs(repoRoot, cloneRoot);
  pinScenarioConfigLimits(cloneRoot);

  // A fresh local clone (and the sync steps above, which rewrite files with content that's
  // still identical to HEAD) can leave the index stat-cache out of sync with the checked-out
  // files (observed on Windows checkouts without a committed .gitattributes), which makes
  // `git status` report files as modified even though the content matches HEAD byte for
  // byte. Re-add now, before scenario seeding introduces real (intentional) dirtiness, so
  // later "worktree is clean" assertions reflect only what the run itself leaves behind.
  spawnSync('git', ['add', '-A'], { cwd: cloneRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

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
  if (scenario === 'implementation-failed-recovery') {
    seedImplementationFailedFeatureState(cloneRoot);
  }
  if (scenario === 'unblock-doc-code-mismatch') {
    seedImplementationFailedFeatureState(cloneRoot);
  }
  if (scenario === 'state-correction-missing-active-task') {
    seedMalformedFeatureState(cloneRoot);
    seedStateCorrectionFallbackTaskArtifact(cloneRoot);
  }
  if (
    scenario !== 'unblock' &&
    scenario !== 'implementation-failed-recovery' &&
    scenario !== 'unblock-doc-code-mismatch' &&
    scenario !== 'state-correction-missing-active-task'
  ) {
    seedTaskReadyState(cloneRoot);
  }
  writeExecutableScript(codexMock, CODEX_MOCK_SCRIPT);
  writeExecutableScript(opencodeMock, OPENCODE_MOCK_SCRIPT);

  const runResult = spawnSync(
    tsxBinary,
    ['proto/protoCompassRose.ts', 'run', '--loop', '--implementer', implementerTool, ...(commitEnabled ? [] : ['--no-commit'])],
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
        PROTO_E2E_IMPLEMENTER: implementerTool,
      },
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      shell: process.platform === 'win32',
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
    error?: string | null;
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
  // Deliberately not "F002-T04-C1": that id already belongs to a real, committed correction
  // task in this repository's actual history (docs/features/002-configuration-model/tasks/
  // 004.1-repair-feature-state-for-f002-t04.md). Reusing it here would collide with real task
  // history once the e2e harness clones the current repository as its test workspace.
  const correctionTaskPath = join(cloneRoot, '.git', 'proto-compassrose', 'tasks', 'F002-T04-C90.json');
  const taskInterfaceAnalysisPath = join(cloneRoot, '.git', 'proto-compassrose', 'task-interface-analysis', 'F002-T04.json');
  const recoveryLessonPath = join(cloneRoot, '.git', 'proto-compassrose', 'latest-recovery-lesson.json');
  const diagnosticPath = join(cloneRoot, '.git', 'proto-compassrose', 'latest-diagnostic.json');
  const refinementPath = join(cloneRoot, '.git', 'proto-compassrose', 'latest-refinement.json');
  const implementationArtifactPath = join(cloneRoot, '.git', 'proto-compassrose', 'implementations', 'F002-T04.json');
  const implementationAttemptHistoryPath = join(
    cloneRoot,
    '.git',
    'proto-compassrose',
    'implementation-attempts',
    'F002-T04.json',
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
  const agentContextsRoot = join(cloneRoot, '.git', 'proto-compassrose', 'logs', 'agent-contexts');
  const agentContextsRecorded = existsSync(agentContextsRoot) && readdirSync(agentContextsRoot).some((entry) => {
    const entryPath = join(agentContextsRoot, entry);
    return statSync(entryPath).isDirectory() && readdirSync(entryPath).some((name) => name.endsWith('.json'));
  });

  const checks = [
    { name: 'agent contexts were recorded', ok: agentContextsRecorded },
    ...buildScenarioChecks({
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
    diagnosticPath,
    refinementPath,
    implementationAttemptHistoryPath,
    implementationArtifactPath,
    featureTasksDirectory,
    protoTasksDirectory,
    malformedFeatureStatePath,
    implementerTool,
    worktreeClean,
  }),
  ];

  for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'}: ${check.name}`);
  }

  if (checks.every((check) => check.ok)) {
    console.log(`codex calls: ${codexCalls}`);
    console.log(`opencode calls: ${opencodeCalls}`);
    // Windows can transiently hold a handle open on a just-used git pack/idx file
    // (antivirus scanning, delayed handle release from the git subprocess that
    // just exited), so an immediate recursive rm can fail with EPERM/EBUSY even
    // though nothing is actually still using the directory. Retry with backoff
    // instead of failing the whole scenario over a cleanup race.
    rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
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
  runSummary: {
    status?: string;
    exit_code?: number;
    error?: string | null;
    steps?: Array<{
      decision?: { kind?: string; task_id?: string | null; feature_id?: string | null; correction_task_id?: string | null };
      summary?: string;
      continue_loop?: boolean;
      exit_code?: number;
    }>;
    run_id?: string;
  };
  markerExists: boolean;
  blockerProfilePath: string;
  unblockTaskPath: string;
  correctionTaskPath: string;
  taskInterfaceAnalysisPath: string;
  recoveryLessonPath: string;
  diagnosticPath: string;
  refinementPath: string;
  implementationAttemptHistoryPath: string;
  implementationArtifactPath: string;
  featureTasksDirectory: string;
  protoTasksDirectory: string;
  malformedFeatureStatePath: string;
  implementerTool: AgentToolName;
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
    diagnosticPath,
    refinementPath,
    implementationAttemptHistoryPath,
    implementationArtifactPath,
    featureTasksDirectory,
    protoTasksDirectory,
    malformedFeatureStatePath,
    implementerTool,
    worktreeClean,
  } = input;

  if (scenario === 'recoverable-review-blocked') {
    const resumedReview = runSummary.steps?.some((step) => step.decision?.kind === 'review_subtask' && step.decision?.task_id === 'F002-T04') === true;
    return [
      { name: 'codex was called enough times to diagnose, doctor, and resume the blocked task', ok: codexCalls >= 3 },
      { name: 'opencode was called once for the original task before doctor recovery resumed review', ok: opencodeCalls === 1 },
      { name: 'run completed successfully', ok: runSummary.status === 'completed' && runSummary.exit_code === 0 },
      { name: 'recoverable blocker created a doctor recovery task', ok: existsSync(unblockTaskPath) },
      { name: 'blocked review recorded a blocker profile', ok: existsSync(blockerProfilePath) },
      { name: 'the original task was reviewed again after doctor recovery', ok: resumedReview },
      { name: 'opencode touched the repo', ok: markerExists },
    ];
  }

  if (scenario === 'terminal-review-blocked') {
    return [
      { name: 'codex was called enough times to analyze the blocked review and stop with a diagnostic', ok: codexCalls >= 1 },
      { name: 'opencode was called exactly once', ok: opencodeCalls === 1 },
      { name: 'run stopped with a blocked status', ok: runSummary.status === 'stopped' && runSummary.exit_code === 2 },
      { name: 'terminal blocker recorded a blocker profile', ok: existsSync(blockerProfilePath) },
      { name: 'no doctor recovery task was created', ok: !existsSync(unblockTaskPath) },
      { name: 'opencode touched the repo', ok: markerExists },
    ];
  }

  if (scenario === 'implementation-notes') {
    const implementationArtifact = readJsonIfExists(implementationArtifactPath);
    const implementationNotes = typeof implementationArtifact?.implementation_notes === 'string'
      ? implementationArtifact.implementation_notes
      : null;
    const expectedCodexCalls = implementerTool === 'codex' ? 2 : 1;
    const expectedOpenCodeCalls = implementerTool === 'codex' ? 0 : 1;

    return [
      { name: 'codex was called enough times to implement and review under the deterministic loop', ok: codexCalls >= expectedCodexCalls },
      { name: 'opencode call count matched the configured implementer', ok: opencodeCalls === expectedOpenCodeCalls },
      { name: 'run completed successfully', ok: runSummary.status === 'completed' && runSummary.exit_code === 0 },
      {
        name: 'implementation notes were captured in the implementation artifact',
        ok: implementationNotes !== null && implementationNotes.includes('already_complete'),
      },
    ];
  }

  if (scenario === 'implementation-missing-notes') {
    const implementationArtifact = readJsonIfExists(implementationArtifactPath);
    const implementationError = typeof implementationArtifact?.error === 'string' ? implementationArtifact.error : null;
    const implementationNotes = typeof implementationArtifact?.implementation_notes === 'string'
      ? implementationArtifact.implementation_notes
      : null;
    const implementationClassification = typeof implementationArtifact?.diagnostics?.classification === 'string'
      ? implementationArtifact.diagnostics.classification
      : null;
    const diagnostic = readJsonIfExists(diagnosticPath);

    return [
      { name: 'codex was called enough times to reach an implementation attempt', ok: codexCalls >= 1 },
      {
        name: 'opencode call count matched the configured implementer',
        ok: implementerTool === 'codex' ? opencodeCalls === 0 : opencodeCalls >= 1,
      },
      {
        name: 'implementation attempt failed because the justification was missing',
        ok:
          implementationArtifact !== null &&
          implementationArtifact.status === 'failed' &&
          typeof implementationError === 'string' &&
          implementationError.includes('Implementation Notes'),
      },
      {
        name: 'implementation diagnostics recorded the missing justification',
        ok: implementationClassification === 'missing_implementation_notes',
      },
      {
        name: 'implementation artifact recorded no notes',
        ok: implementationNotes === null,
      },
      { name: 'the deterministic loop stopped with a diagnostic instead of guessing', ok: diagnostic !== null },
    ];
  }

  if (scenario === 'unblock-doc-code-mismatch') {
    return [
      { name: 'codex was called enough times to diagnose, plan, and execute doctor recovery', ok: codexCalls >= 3 },
      { name: 'opencode was called once when deterministic execution resumed after doctor recovery', ok: opencodeCalls === 1 },
      { name: 'run completed successfully', ok: runSummary.status === 'completed' && runSummary.exit_code === 0 },
      { name: 'doctor recovery task was materialized', ok: existsSync(join(protoTasksDirectory, 'F002-T05-U2.json')) },
    ];
  }

  if (scenario === 'implementation-failed-recovery') {
    const diagnostic = readJsonIfExists(diagnosticPath);
    const implementationFailedUnblockTaskPath = join(protoTasksDirectory, 'F002-T05-U1.json');
    const resumedImplementation = runSummary.steps?.some((step) => step.decision?.kind === 'implement_subtask' && step.decision?.task_id === 'F002-T04') === true;

    return [
      { name: 'codex was called enough times to diagnose implementation_failed, plan doctor recovery, execute it, and review the resumed task', ok: codexCalls >= 2 },
      { name: 'opencode was called once for the resumed implementation after doctor recovery', ok: opencodeCalls === 1 },
      { name: 'run completed successfully', ok: runSummary.status === 'completed' && runSummary.exit_code === 0 },
      { name: 'implementation_failed recovery created a doctor recovery task', ok: existsSync(implementationFailedUnblockTaskPath) },
      { name: 'implementation_failed recovery recorded a diagnostic artifact', ok: diagnostic !== null },
      { name: 'the original implementation task was resumed after recovery', ok: resumedImplementation },
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
    const correctionTaskId = basename(correctionTaskPath, '.json');
    const correctedTaskExecuted = runSummary.steps?.some((step) => step.decision?.kind === 'implement_subtask' && step.decision?.task_id === correctionTaskId) === true;

    return [
      { name: 'codex was called enough times for review analysis and correction recovery', ok: codexCalls >= 3 },
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
      { name: 'codex was called enough times to review the retried implementation', ok: codexCalls >= 1 },
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
    const fallbackTaskNumber = taskNumberSlug(STATE_CORRECTION_FALLBACK_TASK_ID);
    const stateCorrectionArtifactExists = readdirSync(protoTasksDirectory).some(
      (entry) => new RegExp(`^${STATE_CORRECTION_FALLBACK_TASK_ID}-C\\d+\\.json$`).test(entry),
    );
    const stateCorrectionDocumentExists = readdirSync(featureTasksDirectory).some(
      (entry) => new RegExp(`^${fallbackTaskNumber}\\.\\d+-repair-feature-state-for-${STATE_CORRECTION_FALLBACK_TASK_ID.toLowerCase()}\\.md$`).test(entry),
    );
    const stateRepairApplied = runSummary.steps?.some((step) => typeof step.summary === 'string' && step.summary.includes('applied a state correction')) === true;

    return [
      { name: 'codex was called enough times to diagnose malformed state and review the resumed task', ok: codexCalls >= 1 },
      { name: 'opencode was called once for the restored original task', ok: opencodeCalls === 1 },
      { name: 'run completed successfully', ok: runSummary.status === 'completed' && runSummary.exit_code === 0 },
      { name: 'state correction artifact was recorded', ok: stateCorrectionArtifactExists },
      { name: 'state correction document was written', ok: stateCorrectionDocumentExists },
      { name: 'the direct state repair path was applied after diagnosis', ok: stateRepairApplied },
      { name: 'feature state no longer contains the malformed task_ready gap', ok: !malformedFeatureState.includes('## Lifecycle State\n\ntask_ready\n\n## Source Request') || malformedFeatureState.includes('- active_task: none') || malformedFeatureState.includes('formalized') },
      ...(commitEnabled ? [{ name: 'committed recovery steps left a clean worktree', ok: worktreeClean }] : []),
    ];
  }

  if (scenario === 'unblock') {
    return [
      { name: 'codex was called enough times to plan, execute doctor recovery, and review the restored task', ok: codexCalls >= 3 },
      { name: 'opencode was called once for the restored task after doctor recovery', ok: opencodeCalls === 1 },
      { name: 'run completed successfully', ok: runSummary.status === 'completed' && runSummary.exit_code === 0 },
      { name: 'opencode touched the repo', ok: markerExists },
    ];
  }

  if (implementerTool === 'codex') {
    return [
      { name: 'codex was called enough times for implementer and reviewer under the deterministic loop', ok: codexCalls >= 2 },
      { name: 'opencode was not called', ok: opencodeCalls === 0 },
      { name: 'run completed successfully', ok: runSummary.status === 'completed' && runSummary.exit_code === 0 },
      { name: 'codex touched the repo', ok: markerExists },
    ];
  }

  return [
    { name: 'codex was called at least once', ok: codexCalls >= 1 },
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

  if (scenario === 'unblock-doc-code-mismatch') {
    return [0];
  }

  if (scenario === 'implementation-missing-notes') {
    return [0, 1, 2];
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
    case 'implementation-failed-recovery':
      return 'implementation-failed-recovery.txt';
    case 'state-correction-missing-active-task':
      return 'state-correction-missing-active-task.txt';
    case 'implementation-retry':
      return 'implementation-retry.txt';
    case 'implementation-notes':
      return 'implementation-notes.txt';
    case 'implementation-missing-notes':
      return 'implementation-missing-notes.txt';
    case 'unblock-doc-code-mismatch':
      return 'unblock-doc-code-mismatch.txt';
    default:
      return 'e2e-control.txt';
  }
}

function syncPrototypeRuntime(repoRoot: string, cloneRoot: string): void {
  const sourcePath = join(repoRoot, 'proto', 'protoCompassRose.ts');
  const targetPath = join(cloneRoot, 'proto', 'protoCompassRose.ts');
  writeFileSync(targetPath, readFileSync(sourcePath, 'utf8'), 'utf8');

  const helperSourcePath = join(repoRoot, 'proto', 'protoHeartbeatRunner.mjs');
  const helperTargetPath = join(cloneRoot, 'proto', 'protoHeartbeatRunner.mjs');
  writeFileSync(helperTargetPath, readFileSync(helperSourcePath, 'utf8'), 'utf8');
}

// These scenarios and their mocked codex/opencode responses are scripted around exactly one
// primary task per `run --loop` invocation. Pin that here instead of inheriting whatever the
// live repository's docs/compassrose/CONFIG.md happens to say today, so a real project tuning
// change (e.g. raising limits.max_tasks_per_run for faster unattended progress) can't silently
// make the runtime plan a second, unscripted task mid-scenario and fail in an unrelated way.
function pinScenarioConfigLimits(cloneRoot: string): void {
  const configPath = join(cloneRoot, 'docs', 'compassrose', 'CONFIG.md');
  const config = readFileSync(configPath, 'utf8');
  const pinned = config.replace(/max_tasks_per_run:\s*\d+/, 'max_tasks_per_run: 1');
  writeFileSync(configPath, pinned, 'utf8');
}

function syncContractFiles(repoRoot: string, cloneRoot: string): void {
  copyTree(join(repoRoot, 'src', 'contracts'), join(cloneRoot, 'src', 'contracts'));
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

function copyTree(sourceRoot: string, targetRoot: string): void {
  if (!existsSync(sourceRoot)) {
    return;
  }

  const sourceStat = statSync(sourceRoot);
  if (sourceStat.isFile()) {
    mkdirSync(dirname(targetRoot), { recursive: true });
    writeFileSync(targetRoot, readFileSync(sourceRoot, 'utf8'), 'utf8');
    return;
  }

  mkdirSync(targetRoot, { recursive: true });
  for (const entry of readdirSync(sourceRoot)) {
    copyTree(join(sourceRoot, entry), join(targetRoot, entry));
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

function seedImplementationFailedFeatureState(cloneRoot: string): void {
  const statePath = join(cloneRoot, 'docs', 'features', '002-configuration-model', 'state.md');
  writeFileSync(statePath, IMPLEMENTATION_FAILED_STATE_SEED, 'utf8');
}

function seedMalformedFeatureState(cloneRoot: string): void {
  const statePath = join(cloneRoot, 'docs', 'features', '002-configuration-model', 'state.md');
  writeFileSync(statePath, MALFORMED_STATE_MISSING_ACTIVE_TASK_SEED, 'utf8');
  // resolveStateCorrectionActiveTask() checks docs/compassrose/PROJECT_STATE.md's Pending/Next
  // Planning Hint/Current Reality sections for a task-id hint *before* falling back to the
  // seeded STATE_CORRECTION_FALLBACK_TASK_ID artifact. Left un-reset, this file is whatever the
  // real repository's PROJECT_STATE.md currently says - which drifts every time real feature
  // work lands a new task id - so this scenario silently breaks whenever that happens to mention
  // a task id, even though nothing about the scenario itself changed.
  seedCleanProjectState(cloneRoot);
}

function seedStateCorrectionFallbackTaskArtifact(cloneRoot: string): void {
  const artifactsRoot = join(cloneRoot, '.git', 'proto-compassrose', 'tasks');
  mkdirSync(artifactsRoot, { recursive: true });
  writeFileSync(
    join(artifactsRoot, `${STATE_CORRECTION_FALLBACK_TASK_ID}.json`),
    `${JSON.stringify({
      ...SEEDED_TASK,
      task: {
        ...SEEDED_TASK.task,
        task_id: STATE_CORRECTION_FALLBACK_TASK_ID,
      },
    }, null, 2)}\n`,
    'utf8',
  );
}

function seedCleanProjectState(cloneRoot: string): void {
  const projectStatePath = join(cloneRoot, 'docs', 'compassrose', 'PROJECT_STATE.md');
  writeFileSync(projectStatePath, CLEAN_PROJECT_STATE_SEED, 'utf8');
}

function seedTaskReadyState(cloneRoot: string): void {
  const statePath = join(cloneRoot, 'docs', 'features', '002-configuration-model', 'state.md');
  writeFileSync(
    statePath,
    `# State: Configuration Model

## Lifecycle State

task_ready

## Source Request

\`request.md\`

## Operational Status

- formalization: complete
- active_task: F002-T04
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: not_run
- last_quality_gate_result: unknown
- last_review_result: not_run
- last_unblock_result: not_run

## Current Reality

The configuration loader task is ready to execute.

## Implemented Deliverables

- feature formalization exists

## Remaining Deliverables

- validate runtime-precondition policy fields in the project config loader

## Outline Progress

- Plan the configuration loader task: complete
- Implement the loader task: not started

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none
- active_unblock_task: none

## Last Approved Change

Task \`F002-T04\` was approved before the implementation-notes scenario.

## Known Gaps

- None

## Next Planning Hint

Execute \`F002-T04\` when the current execution mode allows it.
`,
    'utf8',
  );
}

const CODEX_MOCK_SCRIPT = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const countFile = process.env.PROTO_E2E_CODEX_COUNT;
const logFile = process.env.PROTO_E2E_CODEX_LOG;
const scenario = process.env.PROTO_E2E_SCENARIO || 'standard';
const prompt = fs.readFileSync(0, 'utf8');
const kind = detectPromptKind(prompt);
const outputPath = readArgValue(args, '-o');
const markerPath = path.join(process.cwd(), 'proto', markerFileNameForScenario(scenario));
const implementerCountFile = countFile ? countFile + '.implementer' : null;

if (kind === 'implementer' || kind === 'doctor') {
  const implementerCount = readCount(implementerCountFile) + 1;
  writeCount(implementerCountFile, implementerCount);
  appendLog(logFile, \`\${kind}: \${args.join(' ')}\`);
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, \`codex e2e touched this file on implementer call \${implementerCount}\\n\`, 'utf8');
  if (scenario === 'implementation-notes') {
    process.stdout.write(
      '## Implementation Notes\\n\\n- status: already_complete\\n- reason: the requested behavior already exists in src/config/configReader.ts\\n- evidence: src/config/configReader.ts, tests/configReader.test.ts\\n',
    );
  } else if (scenario !== 'implementation-missing-notes') {
    process.stdout.write(
      '## Implementation Notes\\n\\n- status: implemented\\n- reason: the mock implementer completed the requested task path\\n- evidence: marker file and repository diff\\n',
    );
  }
  process.exit(0);
}

const count = readCount(countFile) + 1;
writeCount(countFile, count);
appendLog(logFile, \`call \${count} [\${kind}]: \${args.join(' ')}\`);

const sequence = sequenceForScenario(scenario);
const entry = sequence[count - 1];
const payload = typeof entry === 'function' ? entry(prompt) : fallbackPayload(prompt, kind, count);

if (outputPath) {
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\\n', 'utf8');
}

process.exit(0);

function sequenceForScenario(scenario) {
  switch (scenario) {
    case 'unblock':
      return [
        () => plannerTask({
          task_id: 'F002-T05-U1',
          feature_id: '002-configuration-model',
          title: 'Restore progress after a recoverable blocker',
          objective: 'Use the blocked-from target in feature state so the feature can resume from task readiness through doctor recovery.',
          first_executable_step: 'Open src/doctor/projectState.ts and tighten the blocked-from recovery path.',
          minimum_progress_evidence: [
            'src/doctor/projectState.ts records the recovery anchor for the blocked feature.',
            'The doctor recovery task restores the feature to task_ready.',
          ],
          trace: {
            roadmap_objective: 'Deterministic Orchestration',
            feature_goal: 'Recover from a recoverable blocker without widening the feature scope.',
            state_gap: 'The feature state needs an unblock path that can restore progress after a recoverable blocker.',
          },
          context: {
            summary: 'The feature is blocked, but the blocked-from target is known.',
            relevant_paths: [
              'src/doctor/projectState.ts',
              'src/cli/main.ts',
              'src/config/configReader.ts',
              'src/contracts/runtime/operation-loop.md',
              'src/contracts/state/feature-state.md',
            ],
            relevant_modules: ['Feature state', 'Project state', 'Runtime operation loop'],
          },
          scope: {
            allowed_paths: [
              'src/doctor/projectState.ts',
              'src/cli/main.ts',
              'src/config/configReader.ts',
            ],
            forbidden_paths: [
              'docs/features/002-configuration-model/state.md',
              'docs/compassrose/PROJECT_STATE.md',
              'docs/compassrose/CONFIG.md',
            ],
          },
          constraints: [
            'Keep the doctor recovery task narrowly focused on restoring progress from the blocked-from target.',
            'Do not broaden the feature scope.',
          ],
          development_policy: { mode: 'test_guided' },
          quality_gates: { before_review: ['git diff --check'] },
          acceptance_criteria: [
            'The blocked-from target is explicit and usable for restoration.',
            'The doctor recovery task keeps the feature narrow and bounded.',
          ],
          expected_deliverables: ['code', 'tests'],
        }),
        () => approvedReview('F002-T05', 'prototype resumes the restored task after doctor recovery', 'e2e mock review approved the restored task after doctor recovery'),
      ];
    case 'recoverable-review-blocked':
      return [
        () => blockedReview('F002-T04', 'recoverable blocker: the task needs a doctor recovery pass before review can proceed', 'The blocker is recoverable by planning a focused doctor recovery task.', 'passed'),
        () => plannerTask({
          task_id: 'F002-T04-U1',
          feature_id: '002-configuration-model',
          title: 'Restore progress after a blocked review',
          objective: 'Use the blocked-from target in feature state so the feature can resume after a recoverable blocked review through doctor recovery.',
          first_executable_step: 'Open src/doctor/projectState.ts and tighten the review-blocked recovery path.',
          minimum_progress_evidence: [
            'src/doctor/projectState.ts records the recovery anchor for the blocked review.',
            'The doctor recovery task restores the feature to review_pending after review blockage.',
          ],
          trace: {
            roadmap_objective: 'Deterministic Orchestration',
            feature_goal: 'Recover from a recoverable review blocker without widening the feature scope.',
            state_gap: 'The feature state needs an unblock path after the review has blocked execution.',
          },
          context: {
            summary: 'The review reported a recoverable blocker, so the feature should restore review_pending.',
            relevant_paths: [
              'src/doctor/projectState.ts',
              'src/cli/main.ts',
              'src/config/configReader.ts',
              'src/contracts/runtime/operation-loop.md',
              'src/contracts/state/feature-state.md',
            ],
            relevant_modules: ['Feature state', 'Project state', 'Runtime operation loop'],
          },
          scope: {
            allowed_paths: [
              'src/doctor/projectState.ts',
              'src/cli/main.ts',
              'src/config/configReader.ts',
            ],
            forbidden_paths: [
              'docs/features/002-configuration-model/state.md',
              'docs/compassrose/PROJECT_STATE.md',
              'docs/compassrose/CONFIG.md',
            ],
          },
          constraints: [
            'Keep the doctor recovery task narrowly focused on restoring progress after a blocked review.',
            'Do not broaden the feature scope.',
          ],
          development_policy: { mode: 'test_guided' },
          quality_gates: { before_review: ['git diff --check'] },
          acceptance_criteria: [
            'The blocked-from target is explicit and usable for restoration.',
            'The doctor recovery task keeps the feature narrow and bounded.',
          ],
          expected_deliverables: ['code', 'tests'],
        }),
        (prompt) => approvedReview(extractTaskIdFromPrompt(prompt), 'prototype resumes the original task after doctor recovery', 'e2e mock review approved the restored original task'),
        (prompt) => approvedReview(extractTaskIdFromPrompt(prompt), 'prototype resumes the original task after doctor recovery', 'e2e mock review approved the restored original task'),
      ];
    case 'implementation-failed-recovery':
      return [
        () => plannerTask({
          task_id: 'F002-T05-U1',
          feature_id: '002-configuration-model',
          title: 'Recover the failed implementation for the configuration loader',
          objective: 'Create a bounded doctor recovery task that restores task readiness after the failed implementation of F002-T04.',
          first_executable_step: 'Open src/doctor/projectState.ts and tighten the implementation-failed recovery path.',
          minimum_progress_evidence: [
            'src/doctor/projectState.ts records the recovery anchor for the failed implementation.',
            'The doctor recovery task restores the feature to task_ready for F002-T04.',
          ],
          trace: {
            roadmap_objective: 'Deterministic Orchestration',
            feature_goal: 'Recover a failed implementation without widening the feature scope.',
            state_gap: 'The feature state needs a bounded recovery path after implementation_failed.',
          },
          context: {
            summary: 'The active task failed during implementation, but the task anchor remains recoverable.',
            relevant_paths: [
              'src/doctor/projectState.ts',
              'src/cli/main.ts',
              'src/config/configReader.ts',
              'src/contracts/runtime/operation-loop.md',
              'src/contracts/state/feature-state.md',
            ],
            relevant_modules: ['Feature state', 'Project state', 'Runtime operation loop'],
          },
          scope: {
            allowed_paths: [
              'src/doctor/projectState.ts',
              'src/cli/main.ts',
              'src/config/configReader.ts',
            ],
            forbidden_paths: [
              'docs/features/002-configuration-model/state.md',
              'docs/compassrose/PROJECT_STATE.md',
              'docs/compassrose/CONFIG.md',
            ],
          },
          constraints: [
            'Keep the doctor recovery task narrowly focused on restoring progress after implementation_failed.',
            'Do not broaden the feature scope.',
          ],
          development_policy: { mode: 'test_guided' },
          quality_gates: { before_review: ['git diff --check'] },
          acceptance_criteria: [
            'The failed implementation anchor is explicit and usable for restoration.',
            'The doctor recovery task keeps the feature narrow and bounded.',
          ],
          expected_deliverables: ['code', 'tests'],
        }),
        (prompt) => approvedReview(extractTaskIdFromPrompt(prompt), 'prototype resumes the original task after implementation_failed recovery', 'e2e mock review approved the resumed implementation'),
        (prompt) => approvedReview(extractTaskIdFromPrompt(prompt), 'prototype resumes the original task after implementation_failed recovery', 'e2e mock review approved the resumed implementation'),
      ];
    case 'unblock-doc-code-mismatch':
      return [
        () => plannerTask({
          task_id: 'F002-T05-U2',
          feature_id: '002-configuration-model',
          title: 'Repair the doctor recovery interface for mixed deliverables',
          objective: 'Demonstrate that doctor recovery may carry documentation together with executable work when the recovery requires both.',
          first_executable_step: 'Read src/contracts/planner/doctor-recovery-planning-prompt.md and confirm the deliverable policy.',
          minimum_progress_evidence: [
            'The doctor recovery planning contract allows mixed documentation and executable deliverables when recovery requires them.',
            'The prototype accepts the doctor recovery task and re-enters the deterministic loop.',
          ],
          trace: {
            roadmap_objective: 'Deterministic Orchestration',
            feature_goal: 'Keep doctor recovery planning consistent with its broader recovery surface.',
            state_gap: 'The recovery planning contract must allow documentation together with executable work when the recovery needs both.',
          },
          context: {
            summary: 'The doctor recovery task may carry documentation and code together when that is the smallest safe recovery.',
            relevant_paths: [
              'src/contracts/planner/doctor-recovery-planning-prompt.md',
              'src/contracts/planner/output.md',
              'src/contracts/task/doctor-recovery-task.md',
              'src/contracts/runtime/operation-loop.md',
            ],
            relevant_modules: ['Planner output contract', 'Doctor recovery task contract', 'Runtime operation loop'],
          },
          scope: {
            allowed_paths: [
              'src/contracts/planner/doctor-recovery-planning-prompt.md',
              'src/contracts/planner/output.md',
              'src/contracts/task/doctor-recovery-task.md',
              'src/contracts/runtime/operation-loop.md',
              'proto/unblock-doc-code-mismatch.txt',
            ],
            forbidden_paths: [
              'src/cli/main.ts',
              'src/config/configReader.ts',
              'docs/compassrose/PROJECT_STATE.md',
            ],
          },
          constraints: [
            'Keep the doctor recovery task bounded to the deliverable-policy mismatch.',
            'Allow documentation only because this recovery explicitly needs contract and runtime changes together.',
          ],
          development_policy: { mode: 'test_guided' },
          quality_gates: { before_review: ['git diff --check'] },
          acceptance_criteria: [
            'The doctor recovery contract and planner prompt agree on mixed recovery deliverables.',
            'The doctor recovery task does not pretend to be source-only when documentation is part of the bounded recovery.',
          ],
          expected_deliverables: ['documentation', 'code'],
        }),
        (prompt) => approvedReview(extractTaskIdFromPrompt(prompt), 'prototype approves the mixed-deliverable doctor recovery task', 'e2e mock review approved the mixed-deliverable doctor recovery task'),
      ];
    case 'terminal-review-blocked':
      return [
        () => blockedReview('F002-T04', 'terminal blocker: the environment cannot recover without human intervention', 'The environment is unavailable and the failure is terminal.', 'skipped'),
      ];
    case 'interface-gap':
      return [
        () => ({
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
            correction_task_id: 'F002-T04-C90',
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
                'docs/features/002-configuration-model/tasks/F002-T04-C90.md',
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
        }),
        () => taskInterfaceAnalysis('F002-T04', 'changes_required', 'The implementer needs a narrower first step and the task should document the limitation.', 'both', true, ['The implementer struggled because the first executable step allowed too much interpretation.'], {
          first_executable_step: 'Make the opening action a single file or single command.',
          minimum_progress_evidence: ['The correction task includes a tighter first executable step.'],
          context_additions: ['State the exact repository file that should be read first.'],
          scope_adjustments: ['Keep the correction focused on the task interface only.'],
          acceptance_criteria_adjustments: ['Say explicitly that the first step must be concrete and bounded.'],
          quality_gate_adjustments: ['Keep the existing quick quality gate.'],
        }, [
          'The project should remember that task interfaces may need to encode model limitations explicitly.',
          'Recovery lessons should also preserve scope-isolation guidance when reviewable diffs leak orchestration state.',
        ]),
        (prompt) => approvedReview(extractTaskIdFromPrompt(prompt), 'prototype recovers from a blocked review and completes the correction', 'e2e mock review approved the correction task and preserved the recovery lesson'),
      ];
    case 'state-correction-missing-active-task':
      return [
        (prompt) => approvedReview(extractTaskIdFromPrompt(prompt), 'prototype approved the resumed task after direct state repair', 'e2e mock review approved the resumed task after state correction'),
        (prompt) => approvedReview(extractTaskIdFromPrompt(prompt), 'prototype resumed the original task after state correction', 'e2e mock review approved the restored original task'),
      ];
    case 'implementation-missing-notes':
      return [
        () => plannerTask({
          task_id: 'F002-T05-U3',
          feature_id: '002-configuration-model',
          title: 'Recover from a missing implementation note',
          objective: 'Create a bounded doctor recovery task that explains the missing Implementation Notes requirement before retrying the implementation path.',
          first_executable_step: 'Read src/contracts/implementer/task-execution-prompt.md and tighten the note requirement.',
          minimum_progress_evidence: [
            'The recovery task points at the missing Implementation Notes requirement.',
            'The diagnostic path remains bounded instead of guessing.',
          ],
          trace: {
            roadmap_objective: 'Deterministic Orchestration',
            feature_goal: 'Recover from an implementation that omitted the required justification notes.',
            state_gap: 'The implementation path needs a bounded recovery task after missing notes.',
          },
          context: {
            summary: 'The implementer omitted the required Implementation Notes, so the runtime must plan a bounded recovery task.',
            relevant_paths: [
              'src/contracts/implementer/task-execution-prompt.md',
              'src/contracts/runtime/operation-loop.md',
              'src/contracts/task/doctor-recovery-task.md',
            ],
            relevant_modules: ['Implementer prompt', 'Runtime operation loop', 'Doctor recovery task'],
          },
          scope: {
            allowed_paths: [
              'src/contracts/implementer/task-execution-prompt.md',
              'src/contracts/runtime/operation-loop.md',
              'src/contracts/task/doctor-recovery-task.md',
            ],
            forbidden_paths: [
              'src/cli/main.ts',
              'src/config/configReader.ts',
              'docs/compassrose/PROJECT_STATE.md',
            ],
          },
          constraints: [
            'Keep the recovery task focused on the missing Implementation Notes requirement.',
            'Do not broaden the implementation scope.',
          ],
          development_policy: { mode: 'documentation_first' },
          quality_gates: { before_review: ['git diff --check'] },
          acceptance_criteria: [
            'The recovery task makes the missing justification explicit.',
            'The recovery stays bounded and does not expand the implementation scope.',
          ],
          expected_deliverables: ['documentation'],
        }),
      ];
    case 'implementation-notes':
    case 'implementation-retry':
    case 'standard':
    default:
      return [
        () => approvedReview('F002-T04', 'prototype invokes the configured implementer and reviewer', 'e2e mock review approved the implementation'),
      ];
  }
}

function plannerTask(task) {
  return { task };
}

function diagnosticPayload(featureId, nextStep, reason, blockerKind, signature, recoverability, evidence, interfaceMode, interfaceSummary, targetPaths) {
  return {
    feature_id: featureId,
    diagnosis_summary: reason,
    blocker: {
      kind: blockerKind,
      signature,
      recoverability,
      evidence,
    },
    next_step: nextStep,
    next_step_reason: reason,
    interface_response: {
      mode: interfaceMode,
      summary: interfaceSummary,
      target_paths: targetPaths,
    },
  };
}

function approvedReview(taskId, criterion, summary) {
  return {
    task_id: taskId,
    status: 'approved',
    summary,
    acceptance: {
      criteria: [
        {
          criterion,
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
}

function blockedReview(taskId, summary, findingMessage, qualityStatus) {
  return {
    task_id: taskId,
    status: 'blocked',
    summary,
    acceptance: {
      criteria: [
        {
          criterion: 'prototype records blocked review outcomes',
          status: 'passed',
          notes: 'observed through mock invocations',
        },
      ],
    },
    findings: [
      {
        severity: 'blocker',
        message: findingMessage,
        path: null,
        related_acceptance_criterion: 'prototype records blocked review outcomes',
      },
    ],
    scope_check: {
      status: 'passed',
      unrelated_changes: [],
    },
    quality_gate_check: {
      status: qualityStatus,
      failed_gates: [],
    },
    correction_task: null,
    project_state_update_hint: null,
  };
}

function taskInterfaceAnalysis(taskId, reviewStatus, summary, recommendedAction, perfectible, limitations, adjustments, notes) {
  return {
    task_id: taskId,
    review_status: reviewStatus,
    summary,
    recommended_action: recommendedAction,
    perfectible,
    implementer_limitations: limitations,
    task_interface_adjustments: adjustments,
    notes_for_documentation: notes,
  };
}

function fallbackPayload(prompt, kind, count) {
  const taskId = extractTaskIdFromPrompt(prompt);
  if (kind === 'reviewer') {
    return approvedReview(taskId, 'fallback approved review', \`e2e fallback approved \${taskId} on call \${count}\`);
  }

  if (kind === 'task_interface') {
    return taskInterfaceAnalysis(taskId, 'blocked', 'Fallback task-interface analysis.', 'none', false, [], {
      first_executable_step: null,
      minimum_progress_evidence: [],
      context_additions: [],
      scope_adjustments: [],
      acceptance_criteria_adjustments: [],
      quality_gate_adjustments: [],
    }, []);
  }

  if (kind === 'diagnostic') {
    return diagnosticPayload('002-configuration-model', 'stop_with_diagnostic', \`Unexpected diagnostic call \${count} for \${taskId}.\`, 'unknown', 'unexpected-call', 'human', ['Unexpected extra diagnostic call.'], 'manual_review', 'Stop and inspect the unexpected call sequence.', ['proto/protoCompassRose.e2e.ts']);
  }

  return plannerTask({
    task_id: 'F002-T99-U1',
    feature_id: '002-configuration-model',
    title: 'Fallback planner output',
    objective: 'Provide a bounded fallback planner output.',
    first_executable_step: 'Inspect the unexpected planner call.',
    minimum_progress_evidence: ['The fallback planner output was reached.'],
    trace: {
      roadmap_objective: 'Deterministic Orchestration',
      feature_goal: 'Handle unexpected planner calls in the e2e mock.',
      state_gap: 'The e2e sequence requested an extra planner call.',
    },
    context: {
      summary: 'Fallback planner output.',
      relevant_paths: ['proto/protoCompassRose.e2e.ts'],
      relevant_modules: ['e2e mock'],
    },
    scope: {
      allowed_paths: ['proto/protoCompassRose.e2e.ts'],
      forbidden_paths: ['src/cli/main.ts'],
    },
    constraints: ['Fallback output only.'],
    development_policy: { mode: 'documentation_first' },
    quality_gates: { before_review: ['git diff --check'] },
    acceptance_criteria: ['Fallback output is bounded.'],
    expected_deliverables: ['documentation'],
  });
}

function extractTaskIdFromPrompt(prompt) {
  const tick = String.fromCharCode(96);
  const prefixes = ['Review task ' + tick, 'Analyze task ' + tick];
  for (const prefix of prefixes) {
    const start = prompt.indexOf(prefix);
    if (start === -1) {
      continue;
    }

    const valueStart = start + prefix.length;
    const valueEnd = prompt.indexOf(tick, valueStart);
    if (valueEnd !== -1) {
      return prompt.slice(valueStart, valueEnd);
    }
  }

  return 'F002-T04';
}

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
  if (!filePath) {
    return;
  }

  fs.writeFileSync(filePath, String(value), 'utf8');
}

function appendLog(filePath, line) {
  fs.appendFileSync(filePath, \`\${JSON.stringify({ line })}\\n\`, 'utf8');
}

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
    case 'implementation-failed-recovery':
      return 'implementation-failed-recovery.txt';
    case 'state-correction-missing-active-task':
      return 'state-correction-missing-active-task.txt';
    case 'implementation-retry':
      return 'implementation-retry.txt';
    case 'implementation-notes':
      return 'implementation-notes.txt';
    case 'implementation-missing-notes':
      return 'implementation-missing-notes.txt';
    case 'unblock-doc-code-mismatch':
      return 'unblock-doc-code-mismatch.txt';
    default:
      return 'e2e-control.txt';
  }
}

function detectPromptKind(prompt) {
  if (prompt.includes('Act as the CompassRose Diagnostic/Autocorrection role.')) {
    return 'diagnostic';
  }

  if (prompt.includes('Act as the CompassRose task-interface analyst.')) {
    return 'task_interface';
  }

  if (prompt.includes('Act as the CompassRose Planner.')) {
    return 'planner';
  }

  if (prompt.includes('Act as the CompassRose Reviewer.')) {
    return 'reviewer';
  }

  if (prompt.includes('Act as the CompassRose Implementer.')) {
    return 'implementer';
  }

  if (prompt.includes('Act as the CompassRose Doctor.')) {
    return 'doctor';
  }

  return 'unknown';
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
const prompt = readStdinIfAvailable() || process.argv.slice(2).join(' ');
const count = readCount(countFile) + 1;

fs.mkdirSync(path.dirname(markerPath), { recursive: true });
fs.writeFileSync(markerPath, \`opencode e2e touched this file on call \${count}\\n\`, 'utf8');
if (scenario === 'implementation-notes') {
  process.stdout.write(
    '## Implementation Notes\\n\\n- status: already_complete\\n- reason: the requested behavior already exists in src/config/configReader.ts\\n- evidence: src/config/configReader.ts, tests/configReader.test.ts\\n',
  );
} else if (scenario !== 'implementation-missing-notes') {
  process.stdout.write(
    '## Implementation Notes\\n\\n- status: implemented\\n- reason: the mock implementer completed the requested task path\\n- evidence: marker file and repository diff\\n',
  );
}

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
    case 'implementation-failed-recovery':
      return 'implementation-failed-recovery.txt';
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

function readStdinIfAvailable() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
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

const IMPLEMENTATION_FAILED_STATE_SEED = `# State: Configuration Model

## Lifecycle State

implementation_failed

## Source Request

\`request.md\`

## Operational Status

- formalization: complete
- active_task: F002-T04
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: failed
- last_quality_gate_result: unknown
- last_review_result: not_run
- last_unblock_result: not_run

## Current Reality

The feature reached implementation_failed after an implementation attempt did not produce a recoverable finish. The next proto run should plan a bounded unblock task and restore task readiness before the original task is retried.

## Blocked By

- kind: implementation_failure
- signature: implementation-failed-f002-t04
- recoverability: agent
- observed_state: lifecycle=implementation_failed; active_task=F002-T04; active_correction_task=none; active_unblock_task=none
- evidence: The implementation attempt for F002-T04 failed and needs bounded recovery.
- reason: The implementation attempt for F002-T04 failed and needs bounded recovery.

## Blocked From

- lifecycle_state: task_ready
- active_task: F002-T04
- active_correction_task: none
- active_unblock_task: none
- recoverability: agent

## Last Approved Change

Task \`F002-T04\` was approved before the implementation failure was recorded in the e2e scenario.

## Known Gaps

- The failed implementation should be recovered through a bounded unblock task before the task is retried.

## Next Planning Hint

Plan a bounded unblock task for the failed implementation of \`F002-T04\` and restore task readiness before continuing.
`;

// Deliberately free of any `F\d+-T\d+` pattern, since extractTaskIdHint() scans this file's
// Pending/Next Planning Hint/Current Reality sections before resolveStateCorrectionActiveTask()
// falls back to the seeded STATE_CORRECTION_FALLBACK_TASK_ID artifact.
const CLEAN_PROJECT_STATE_SEED = `# State: Project Identity and Foundation

## Status

In progress

## Active Feature

\`002-configuration-model\`

## Current Reality

The project-local configuration and doctor contract are in place and the active feature is progressing through its own task lifecycle, tracked in its own feature state document.

## Implemented

- \`docs/compassrose/CONFIG.md\` and \`docs/compassrose/PROJECT_STATE.md\` are present as the project-local operational documents.

## Pending

- Continue updating this file with approved repository facts as feature work lands.

## Blocked

- None

## Last Approved Change

The project-local configuration and doctor contract were accepted.

## Known Gaps

- None recorded.

## Next Planning Hint

Consult the active feature's own state document for its next planning step.
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

The current work target is planned and ready to execute. Add configuration-backed runtime preflight to the default CLI entrypoint.

CompassRose can now load that project-local configuration, validate the MVP doctor contract, and report the repository readiness checks through \`compassrose doctor\`, including a distinct preflight for the configured project-state document.

The accepted architecture documentation already supports repository-local state, hierarchical configuration precedence, non-invasive external tool integration, configurable review policy, and quality-gate configuration. The MVP contract for Doctor is now explicit: only the project-level scope in \`docs/compassrose/CONFIG.md\` is in scope, the minimum required sections and fields are fixed, and command semantics distinguish missing keys from intentionally empty values.

This feature is now formalized under \`docs/features/002-configuration-model/\`, and the first implementation tasks have now been completed against the configuration target defined in \`docs/compassrose/CONFIG.md\`.

The typed configuration loader has now been approved. It validates and exposes \`execution\`, \`roles\`, and \`git_policy\` data needed for the first broader orchestration handoff without expanding into feature selection or task execution.

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

The typed config loader was approved, extending its tests to validate the first runtime-precondition policy fields from \`docs/compassrose/CONFIG.md\`.

## Known Gaps

- The project-local configuration flow still needs a runtime consumer that uses the validated \`execution\`, \`roles\`, and \`git_policy\` data during orchestration.
- The next task should build on the validated loader and doctor checks rather than redefining the schema.

## Next Planning Hint

Execute the current work target when the current execution mode allows it.
`;

const exitCode = main();
process.exitCode = exitCode;
