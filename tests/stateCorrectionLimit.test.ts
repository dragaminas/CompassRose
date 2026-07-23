import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test } from 'vitest';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import { limitStateCorrectionTaskId } from '../src/orchestrator/runtimeHelpers.js';

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

  test('correct_state refuses before writing artifacts or mutating feature and project state', () => {
    const repositoryRoot = process.cwd();
    const featureStatePath = join(repositoryRoot, 'docs', 'features', '002-configuration-model', 'state.md');
    const projectStatePath = join(repositoryRoot, 'docs', 'compassrose', 'PROJECT_STATE.md');
    const tasksDirectory = join(repositoryRoot, 'docs', 'features', '002-configuration-model', 'tasks');
    const artifactTasksDirectory = join(repositoryRoot, '.git', 'proto-compassrose', 'tasks');
    const featureStateBefore = readFileSync(featureStatePath, 'utf8');
    const projectStateBefore = readFileSync(projectStatePath, 'utf8');
    const nestedFeatureState = featureStateBefore.replace(
      /(active_task\s*:\s*)[^\r\n]*/,
      '$1F002-T7-C1',
    );
    expect(nestedFeatureState).not.toBe(featureStateBefore);
    const taskFilesBefore = readdirSync(tasksDirectory).sort();
    const artifactFilesBefore = existsSync(artifactTasksDirectory) ? readdirSync(artifactTasksDirectory).sort() : [];
    const correctionTasksBefore = snapshotArtifactDirectory(tasksDirectory);
    const correctionArtifactsBefore = snapshotArtifactDirectory(artifactTasksDirectory);

    try {
      writeFileSync(featureStatePath, nestedFeatureState, 'utf8');

      const orchestrator = new CompassRoseOrchestrator({
        cwd: repositoryRoot,
        commit: false,
        implementer: 'codex',
        loop: false,
      } as unknown as ConstructorParameters<typeof CompassRoseOrchestrator>[0]);
      const git = Reflect.get(orchestrator, 'git') as { dirtyPaths: () => readonly string[] };
      const originalDirtyPaths = git.dirtyPaths;
      git.dirtyPaths = () => [];

      try {
        const executeStep = Reflect.get(orchestrator, 'executeStep') as (decision: unknown) => unknown;
        const result = executeStep.call(orchestrator, {
          kind: 'correct_state',
          feature_id: '002-configuration-model',
          reason: 'recovery test: nested correction anchor is already at the configured limit',
        }) as { exitCode: number; continueLoop: boolean };

        expect(result).toMatchObject({ exitCode: 2, continueLoop: false });
        expect((result as { summary?: string }).summary).toMatch(/correction iteration limit reached/i);
        expectArtifactDirectoryUnchanged(correctionTasksBefore, snapshotArtifactDirectory(tasksDirectory));
        expectArtifactDirectoryUnchanged(correctionArtifactsBefore, snapshotArtifactDirectory(artifactTasksDirectory));
        expect(readFileSync(featureStatePath, 'utf8')).toBe(nestedFeatureState);
        expect(readFileSync(projectStatePath, 'utf8')).toBe(projectStateBefore);
      } finally {
        git.dirtyPaths = originalDirtyPaths;
      }
    } finally {
      writeFileSync(featureStatePath, featureStateBefore, 'utf8');
      writeFileSync(projectStatePath, projectStateBefore, 'utf8');

      for (const fileName of readdirSync(tasksDirectory)) {
        if (!taskFilesBefore.includes(fileName)) {
          rmSync(join(tasksDirectory, fileName), { force: true });
        }
      }

      if (existsSync(artifactTasksDirectory)) {
        for (const fileName of readdirSync(artifactTasksDirectory)) {
          if (!artifactFilesBefore.includes(fileName)) {
            rmSync(join(artifactTasksDirectory, fileName), { force: true });
          }
        }
      }
    }
  });

  test('diagnoseAndAutocorrect() stops cleanly instead of crashing when correct_state hits the limit', () => {
    // Regression test: unlike executeStep()'s own 'correct_state' case (covered just above),
    // diagnoseAndAutocorrect()'s internal call to correctState() -- reached when
    // runDiagnosticAutocorrection() itself decides next_step: 'correct_state' -- used to have no
    // try/catch at all, so StateCorrectionLimitReachedError propagated as an uncaught exception
    // and crashed the whole CLI process instead of returning a bounded stop. Observed live on
    // feature 003-doctor-command's F003-T01 anchor.
    const repositoryRoot = process.cwd();
    const featureStatePath = join(repositoryRoot, 'docs', 'features', '002-configuration-model', 'state.md');
    const tasksDirectory = join(repositoryRoot, 'docs', 'features', '002-configuration-model', 'tasks');
    const artifactTasksDirectory = join(repositoryRoot, '.git', 'proto-compassrose', 'tasks');
    const featureStateBefore = readFileSync(featureStatePath, 'utf8');
    const nestedFeatureState = featureStateBefore.replace(
      /(active_task\s*:\s*)[^\r\n]*/,
      '$1F002-T7-C1',
    );
    expect(nestedFeatureState).not.toBe(featureStateBefore);
    const taskFilesBefore = readdirSync(tasksDirectory).sort();
    const artifactFilesBefore = existsSync(artifactTasksDirectory) ? readdirSync(artifactTasksDirectory).sort() : [];

    try {
      writeFileSync(featureStatePath, nestedFeatureState, 'utf8');

      const orchestrator = new CompassRoseOrchestrator({
        cwd: repositoryRoot,
        commit: false,
        implementer: 'codex',
        loop: false,
      } as unknown as ConstructorParameters<typeof CompassRoseOrchestrator>[0]);
      const git = Reflect.get(orchestrator, 'git') as { dirtyPaths: () => readonly string[] };
      const originalDirtyPaths = git.dirtyPaths;
      git.dirtyPaths = () => [];
      // Stub out the actual AI diagnostic call so this test exercises only the
      // correct_state-handling logic that follows it.
      (orchestrator as unknown as Record<string, unknown>).runDiagnosticAutocorrection = () => ({
        feature_id: '002-configuration-model',
        diagnosis_summary: 'fixture diagnosis',
        blocker: { kind: 'unknown', signature: 'fixture-signature', recoverability: 'agent', evidence: ['fixture evidence'] },
        next_step: 'correct_state',
        next_step_reason: 'recovery test: nested correction anchor is already at the configured limit',
        interface_response: { mode: 'manual_review', summary: 'fixture summary', target_paths: [] },
        systemic_blocker: null,
      });

      try {
        const diagnoseAndAutocorrect = Reflect.get(orchestrator, 'diagnoseAndAutocorrect') as (featureId: string, reason: string) => unknown;
        const result = diagnoseAndAutocorrect.call(orchestrator, '002-configuration-model', 'fixture reason') as {
          exitCode: number;
          continueLoop: boolean;
          summary?: string;
        };

        expect(result).toMatchObject({ exitCode: 2, continueLoop: false });
        expect(result.summary).toMatch(/correction iteration limit reached/i);
      } finally {
        git.dirtyPaths = originalDirtyPaths;
      }
    } finally {
      writeFileSync(featureStatePath, featureStateBefore, 'utf8');

      for (const fileName of readdirSync(tasksDirectory)) {
        if (!taskFilesBefore.includes(fileName)) {
          rmSync(join(tasksDirectory, fileName), { force: true });
        }
      }

      if (existsSync(artifactTasksDirectory)) {
        for (const fileName of readdirSync(artifactTasksDirectory)) {
          if (!artifactFilesBefore.includes(fileName)) {
            rmSync(join(artifactTasksDirectory, fileName), { force: true });
          }
        }
      }
    }
  });

  test('runDiagnosticAutocorrection() escalates to doctor recovery instead of re-proposing an exhausted correction', () => {
    // Regression test: a state_corruption blocker whose anchor has already used up its
    // correction limit used to unconditionally get next_step: 'correct_state' again anyway, with
    // no check for whether correctState() would actually allow it. Since this whole decision path
    // is deterministic (no AI call), every future diagnose_autocorrect run for the same feature
    // would re-propose the identical doomed correction and immediately hit
    // StateCorrectionLimitReachedError again -- an unrecoverable loop with no escape but manual
    // intervention. Observed live on feature 003-doctor-command's F003-T01 anchor.
    const repositoryRoot = process.cwd();
    const featureStatePath = join(repositoryRoot, 'docs', 'features', '002-configuration-model', 'state.md');
    const tasksDirectory = join(repositoryRoot, 'docs', 'features', '002-configuration-model', 'tasks');
    const featureStateBefore = readFileSync(featureStatePath, 'utf8');
    const taskFilesBefore = readdirSync(tasksDirectory).sort();

    // Anchor F002-T7 already has its one allowed correction (F002-T7-C1), matching this
    // repository's own configured max_review_iterations: 1.
    const exhaustedAnchorTaskFile = join(tasksDirectory, '999.1-fixture-exhausted-anchor.md');

    const stateWithRecordedBlocker = featureStateBefore
      .replace(/(active_task\s*:\s*)[^\r\n]*/, '$1F002-T7')
      .replace(
        /## Lifecycle State\n\n\S+/,
        '## Lifecycle State\n\nquality_failed',
      )
      .replace(
        /## Blocked By\n\n(?:- .*\n)*/,
        [
          '## Blocked By',
          '',
          '- kind: state_corruption',
          '- signature: fixture-state-corruption-signature',
          '- recoverability: agent',
          '- observed_state: lifecycle=quality_failed',
          '- evidence: fixture evidence',
          '',
        ].join('\n'),
      );
    expect(stateWithRecordedBlocker).not.toBe(featureStateBefore);

    try {
      writeFileSync(featureStatePath, stateWithRecordedBlocker, 'utf8');
      writeFileSync(exhaustedAnchorTaskFile, '`F002-T7-C1`\n', 'utf8');

      const orchestrator = new CompassRoseOrchestrator({
        cwd: repositoryRoot,
        commit: false,
        implementer: 'codex',
        loop: false,
      } as unknown as ConstructorParameters<typeof CompassRoseOrchestrator>[0]);

      const resolveWorkItemContext = Reflect.get(orchestrator, 'resolveWorkItemContext') as (featureId: string) => unknown;
      const owner = resolveWorkItemContext.call(orchestrator, '002-configuration-model');
      const runDiagnosticAutocorrection = Reflect.get(orchestrator, 'runDiagnosticAutocorrection') as (
        feature: unknown,
        reason: string,
      ) => { next_step: string };

      const decision = runDiagnosticAutocorrection.call(orchestrator, owner, 'fixture reason');

      expect(decision.next_step).toBe('plan_doctor_recovery');
    } finally {
      writeFileSync(featureStatePath, featureStateBefore, 'utf8');
      rmSync(exhaustedAnchorTaskFile, { force: true });

      for (const fileName of readdirSync(tasksDirectory)) {
        if (!taskFilesBefore.includes(fileName)) {
          rmSync(join(tasksDirectory, fileName), { force: true });
        }
      }
    }
  });
});
