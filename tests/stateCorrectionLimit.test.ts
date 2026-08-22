import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test } from 'vitest';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { limitStateCorrectionTaskId } from '../src/orchestrator/runtimeHelpers.js';
import { copyContractsIntoWorkspace, readFixtureConfigMarkdown } from './testUtils.js';

// These tests used to construct a real CompassRoseOrchestrator against `process.cwd()` -- this
// repository itself -- mutating its live `compassrose/` documents and restoring them in `finally`.
// One of them (the diagnoseAndAutocorrect case) never snapshotted `PROJECT_STATE.md`, which
// `recordExhaustedRecoveryAsBlocked` writes, so every `npm test` left the working tree dirty with a
// spurious "002-configuration-model is blocked by F002-T7-C1" mutation -- a task id that never
// existed. That dirty state then fed this repository's own e2e suite, which clones the current
// HEAD, producing the "intermittent unrelated test failures" that kept 003-doctor-command blocked
// for weeks. Isolated fixture workspaces below; nothing here touches the real repository.

const FIXTURE_FEATURE_ID = '002-configuration-model';

interface FixtureWorkspace {
  readonly root: string;
  readonly featureStatePath: string;
  readonly projectStatePath: string;
  readonly tasksDirectory: string;
  readonly artifactTasksDirectory: string;
  readonly dispose: () => void;
}

function projectStateFixture(): string {
  return [
    '# CompassRose Project State',
    '',
    '## Status',
    '',
    'active',
    '',
    '## Active Feature',
    '',
    `\`${FIXTURE_FEATURE_ID}\``,
    '',
    '## Current Reality',
    '',
    '- Fixture workspace for state-correction-limit tests.',
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
}

function featureStateFixture(input: {
  lifecycleState: string;
  activeTask: string;
  blockedBy?: readonly string[];
}): string {
  return [
    '# State: Configuration Model',
    '',
    '## Lifecycle State',
    '',
    input.lifecycleState,
    '',
    '## Source Request',
    '',
    '`request.md`',
    '',
    '## Operational Status',
    '',
    '- formalization: complete',
    `- active_task: ${input.activeTask}`,
    '- active_correction_task: none',
    '- last_implementation_result: passed',
    '- last_quality_gate_result: failed',
    '- last_review_result: not_run',
    '- validation: confirmed',
    '',
    '## Current Reality',
    '',
    'Fixture state.',
    '',
    '## Implemented Deliverables',
    '',
    '- none',
    '',
    '## Remaining Deliverables',
    '',
    '- none',
    '',
    '## Outline Progress',
    '',
    '- none',
    '',
    '## Blocked By',
    '',
    ...(input.blockedBy ?? ['- None']),
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
    'Fixture next step.',
    '',
  ].join('\n');
}

function createFixtureWorkspace(featureStateMarkdown: string): FixtureWorkspace {
  const root = mkdtempSync(join(tmpdir(), 'correction-limit-repo-'));
  const featureDirectory = join(root, 'compassrose', 'features', FIXTURE_FEATURE_ID);
  const tasksDirectory = join(featureDirectory, 'tasks');

  mkdirSync(join(root, '.git'), { recursive: true });
  mkdirSync(tasksDirectory, { recursive: true });
  writeFileSync(join(root, 'compassrose', 'CONFIG.md'), readFixtureConfigMarkdown(), 'utf8');
  writeFileSync(join(root, 'compassrose', 'PROJECT_STATE.md'), projectStateFixture(), 'utf8');
  writeFileSync(join(featureDirectory, 'state.md'), featureStateMarkdown, 'utf8');
  copyContractsIntoWorkspace(root);

  return {
    root,
    featureStatePath: join(featureDirectory, 'state.md'),
    projectStatePath: join(root, 'compassrose', 'PROJECT_STATE.md'),
    tasksDirectory,
    artifactTasksDirectory: join(root, '.git', 'proto-compassrose', 'tasks'),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

function createOrchestratorFor(workspace: FixtureWorkspace): CompassRoseOrchestrator {
  const orchestrator = new CompassRoseOrchestrator({
    cwd: workspace.root,
    commit: false,
    implementer: 'codex',
    loop: false,
  } as unknown as ConstructorParameters<typeof CompassRoseOrchestrator>[0]);

  // The fixture workspace has a `.git` directory but is not a real repository; the correction-limit
  // paths under test never depend on real git state, only on the clean-worktree precondition.
  const git = Reflect.get(orchestrator, 'git') as { dirtyPaths: () => readonly string[] };
  git.dirtyPaths = () => [];

  return orchestrator;
}

type ArtifactDirectorySnapshot = {
  directoryExists: boolean;
  files: Array<{
    path: string;
    exists: boolean;
    content: string;
  }>;
};

function snapshotArtifactDirectory(directory: string): ArtifactDirectorySnapshot {
  const directoryExists = existsSync(directory);
  if (!directoryExists) {
    return { directoryExists: false, files: [] };
  }

  const paths = readdirSync(directory)
    .filter((fileName) => /\.(?:md|json)$/i.test(fileName))
    .sort()
    .map((fileName) => join(directory, fileName));

  return {
    directoryExists: true,
    files: paths.map((path) => ({
      path,
      exists: existsSync(path),
      content: readFileSync(path, 'utf8'),
    })),
  };
}

function expectArtifactDirectoryUnchanged(
  before: ArtifactDirectorySnapshot,
  after: ArtifactDirectorySnapshot,
): void {
  expect(after.directoryExists).toBe(before.directoryExists);
  expect(after.files.map((file) => file.path)).toEqual(before.files.map((file) => file.path));
  expect(after.files.map((file) => file.exists)).toEqual(before.files.map((file) => file.exists));
  expect(after.files.map((file) => file.content)).toEqual(before.files.map((file) => file.content));
}

describe('limitStateCorrectionTaskId', () => {
  let tempDir: string | null = null;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  test('returns the next correction ID when below the configured limit', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'correction-limit-'));

    // No prior corrections -> C1
    const c1 = limitStateCorrectionTaskId(tempDir, 'F002-T7', 2);
    expect(c1).toBe('F002-T7-C1');

    // Create a file referencing C1 so next allocation is C2
    writeFileSync(join(tempDir, '007.1.md'), '`F002-T7-C1`\n', 'utf8');

    const c2 = limitStateCorrectionTaskId(tempDir, 'F002-T7', 2);
    expect(c2).toBe('F002-T7-C2');
  });

  test('refuses allocation when the next ID would reach the configured limit', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'correction-limit-'));

    // Write C1 and C2
    writeFileSync(join(tempDir, '007.1.md'), '`F002-T7-C1`\n', 'utf8');
    writeFileSync(join(tempDir, '007.2.md'), '`F002-T7-C2`\n', 'utf8');

    // Limit is 2, next would be C3 -> refused
    const c3 = limitStateCorrectionTaskId(tempDir, 'F002-T7', 2);
    expect(c3).toBe(null);
  });

  test('refuses allocation with limit 1 when C1 already exists', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'correction-limit-'));
    writeFileSync(join(tempDir, '007.1.md'), '`F002-T7-C1`\n', 'utf8');

    // Limit is 1, next would be C2 -> refused
    const c2 = limitStateCorrectionTaskId(tempDir, 'F002-T7', 1);
    expect(c2).toBe(null);
  });

  test('refuses the first allocation when limit is 0', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'correction-limit-'));

    const c1 = limitStateCorrectionTaskId(tempDir, 'F002-T7', 0);
    expect(c1).toBe(null);
  });

  test('allows the first base correction but refuses a nested anchor at limit 1', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'correction-limit-'));

    const firstBaseCorrection = limitStateCorrectionTaskId(tempDir, 'F002-T7', 1);
    expect(firstBaseCorrection).toBe('F002-T7-C1');

    // The active anchor already carries one correction suffix, so another
    // correction would exceed max_review_iterations=1.
    const nestedRefused = limitStateCorrectionTaskId(tempDir, 'F002-T7-C1', 1);
    expect(nestedRefused).toBe(null);
  });

  test('refuses the first allocation for a nested anchor at limit 1', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'correction-limit-'));

    const first = limitStateCorrectionTaskId(tempDir, 'F002-T7-C1', 1);
    expect(first).toBe(null);
  });

  test('correct_state refuses before writing correction-task artifacts, and persists the exhaustion as a blocked state', () => {
    const workspace = createFixtureWorkspace(
      featureStateFixture({ lifecycleState: 'completed', activeTask: 'F002-T7-C1' }),
    );

    try {
      const stateBefore = readFileSync(workspace.featureStatePath, 'utf8');
      const correctionTasksBefore = snapshotArtifactDirectory(workspace.tasksDirectory);
      const correctionArtifactsBefore = snapshotArtifactDirectory(workspace.artifactTasksDirectory);

      const orchestrator = createOrchestratorFor(workspace);
      const executeStep = Reflect.get(orchestrator, 'executeStep') as (decision: unknown) => unknown;
      const result = executeStep.call(orchestrator, {
        kind: 'correct_state',
        feature_id: FIXTURE_FEATURE_ID,
        reason: 'recovery test: nested correction anchor is already at the configured limit',
      }) as { exitCode: number; continueLoop: boolean; summary?: string };

      expect(result).toMatchObject({ exitCode: 2, continueLoop: false });
      expect(result.summary).toMatch(/correction iteration limit reached/i);
      expectArtifactDirectoryUnchanged(correctionTasksBefore, snapshotArtifactDirectory(workspace.tasksDirectory));
      expectArtifactDirectoryUnchanged(correctionArtifactsBefore, snapshotArtifactDirectory(workspace.artifactTasksDirectory));
      // correctState()'s OWN correction-task-writing machinery never ran (asserted above) --
      // but reaching the limit is itself a real blocker (only a human can resolve it now), so
      // runBoundedOperation's catch persists that via recordExhaustedRecoveryAsBlocked instead
      // of leaving state untouched and silent, matching every other blocking path.
      const featureStateAfter = readFileSync(workspace.featureStatePath, 'utf8');
      expect(featureStateAfter).not.toBe(stateBefore);
      expect(featureStateAfter).toContain('## Lifecycle State\n\nblocked');
      expect(featureStateAfter).toContain('- recoverability: human');
      expect(featureStateAfter).toContain('Correction iteration limit reached');
    } finally {
      workspace.dispose();
    }
  });

  test('diagnoseAndAutocorrect() stops cleanly instead of crashing when correct_state hits the limit', () => {
    // Regression test: unlike executeStep()'s own 'correct_state' case (covered just above),
    // diagnoseAndAutocorrect()'s internal call to correctState() -- reached when
    // runDiagnosticAutocorrection() itself decides next_step: 'correct_state' -- used to have no
    // try/catch at all, so StateCorrectionLimitReachedError propagated as an uncaught exception
    // and crashed the whole CLI process instead of returning a bounded stop. Observed live on
    // feature 003-doctor-command's F003-T01 anchor.
    const workspace = createFixtureWorkspace(
      featureStateFixture({ lifecycleState: 'completed', activeTask: 'F002-T7-C1' }),
    );

    try {
      const orchestrator = createOrchestratorFor(workspace);
      // Stub out the actual AI diagnostic call so this test exercises only the
      // correct_state-handling logic that follows it.
      (orchestrator as unknown as Record<string, unknown>).runDiagnosticAutocorrection = () => ({
        feature_id: FIXTURE_FEATURE_ID,
        diagnosis_summary: 'fixture diagnosis',
        blocker: { kind: 'unknown', signature: 'fixture-signature', recoverability: 'agent', evidence: ['fixture evidence'] },
        next_step: 'correct_state',
        next_step_reason: 'recovery test: nested correction anchor is already at the configured limit',
        interface_response: { mode: 'manual_review', summary: 'fixture summary', target_paths: [] },
        systemic_blocker: null,
      });

      const diagnoseAndAutocorrect = Reflect.get(orchestrator, 'diagnoseAndAutocorrect') as (featureId: string, reason: string) => unknown;
      const result = diagnoseAndAutocorrect.call(orchestrator, FIXTURE_FEATURE_ID, 'fixture reason') as {
        exitCode: number;
        continueLoop: boolean;
        summary?: string;
      };

      expect(result).toMatchObject({ exitCode: 2, continueLoop: false });
      expect(result.summary).toMatch(/correction iteration limit reached/i);
    } finally {
      workspace.dispose();
    }
  });

  test('runDiagnosticAutocorrection() escalates to a recovery conversation instead of re-proposing an exhausted correction', () => {
    // Regression test: a state_corruption blocker whose anchor has already used up its
    // correction limit used to unconditionally get next_step: 'correct_state' again anyway, with
    // no check for whether correctState() would actually allow it. Since this whole decision path
    // is deterministic (no AI call), every future diagnose_autocorrect run for the same feature
    // would re-propose the identical doomed correction and immediately hit
    // StateCorrectionLimitReachedError again -- an unrecoverable loop with no escape but manual
    // intervention. Observed live on feature 003-doctor-command's F003-T01 anchor.
    const workspace = createFixtureWorkspace(
      featureStateFixture({
        lifecycleState: 'quality_failed',
        activeTask: 'F002-T7',
        blockedBy: [
          '- kind: state_corruption',
          '- signature: fixture-state-corruption-signature',
          '- recoverability: agent',
          '- observed_state: lifecycle=quality_failed',
          '- evidence: fixture evidence',
        ],
      }),
    );

    try {
      // Anchor F002-T7 already has its one allowed correction (F002-T7-C1), matching this
      // repository's own configured max_review_iterations: 1.
      writeFileSync(join(workspace.tasksDirectory, '999.1-fixture-exhausted-anchor.md'), '`F002-T7-C1`\n', 'utf8');

      const orchestrator = createOrchestratorFor(workspace);

      const resolveWorkItemContext = Reflect.get(orchestrator, 'resolveWorkItemContext') as (featureId: string) => unknown;
      const owner = resolveWorkItemContext.call(orchestrator, FIXTURE_FEATURE_ID);
      const runDiagnosticAutocorrection = Reflect.get(orchestrator, 'runDiagnosticAutocorrection') as (
        feature: unknown,
        reason: string,
      ) => { next_step: string };

      const decision = runDiagnosticAutocorrection.call(orchestrator, owner, 'fixture reason');

      expect(decision.next_step).toBe('block_for_conversation');
    } finally {
      workspace.dispose();
    }
  });
});
