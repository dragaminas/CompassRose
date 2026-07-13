import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test } from 'vitest';
import {
  assertTaskIdIsUnused,
  findLatestImplementationAttemptTaskId,
  findLatestTaskArtifactTaskId,
  findTaskDocumentPath,
  tryFindTaskDocumentPath,
} from '../src/task/taskStore.js';

function writeTaskDoc(dir: string, fileName: string, taskId: string, featureId = '001-widgets'): void {
  writeFileSync(
    join(dir, fileName),
    [
      `# Task ${taskId}: Something`,
      '',
      '## Task ID',
      '',
      `\`${taskId}\``,
      '',
      '## Parent Feature',
      '',
      `\`${featureId}\``,
      '',
      '## Goal',
      '',
      'Do the thing.',
      '',
      '## Scope',
      '',
      'Allowed:',
      '- src/widget.ts',
      '',
      'Forbidden:',
      '- docs/',
      '',
    ].join('\n'),
    'utf8',
  );
}

describe('findTaskDocumentPath / tryFindTaskDocumentPath', () => {
  let tempDir: string | null = null;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  test('finds the document whose Task ID section matches, across multiple search roots', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'task-store-'));
    const featureDirA = join(tempDir, 'feature-a');
    const featureDirB = join(tempDir, 'feature-b');
    mkdirSync(featureDirA, { recursive: true });
    mkdirSync(featureDirB, { recursive: true });
    writeTaskDoc(featureDirA, 'f1.md', 'F001-T1');
    writeTaskDoc(featureDirB, 'f2.md', 'F002-T1');

    expect(findTaskDocumentPath('F002-T1', [featureDirA, featureDirB])).toBe(join(featureDirB, 'f2.md'));
  });

  test('skips search roots that are not directories instead of throwing', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'task-store-'));
    const notADirectory = join(tempDir, 'not-a-directory.md');
    writeFileSync(notADirectory, 'this is a file, not a directory', 'utf8');
    const featureDir = join(tempDir, 'feature');
    mkdirSync(featureDir, { recursive: true });
    writeTaskDoc(featureDir, 'f1.md', 'F001-T1');

    expect(findTaskDocumentPath('F001-T1', [notADirectory, featureDir])).toBe(join(featureDir, 'f1.md'));
  });

  test('throws when no document claims the task id in any search root', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'task-store-'));
    expect(() => findTaskDocumentPath('F999-T1', [tempDir])).toThrow(/was not found/);
  });

  test('tryFindTaskDocumentPath returns null instead of throwing when not found', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'task-store-'));
    expect(tryFindTaskDocumentPath('F999-T1', [tempDir])).toBeNull();
  });

  test('skips files that fail to parse as a task document instead of throwing', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'task-store-'));
    writeFileSync(join(tempDir, 'not-a-task.md'), '# Not a task document\n', 'utf8');
    writeTaskDoc(tempDir, 'real-task.md', 'F001-T1');

    expect(findTaskDocumentPath('F001-T1', [tempDir])).toBe(join(tempDir, 'real-task.md'));
  });
});

describe('assertTaskIdIsUnused', () => {
  let tempDir: string | null = null;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  test('does not throw when the task id is not already used', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'task-store-'));
    expect(() => assertTaskIdIsUnused(tempDir, 'F001-T1', 'Task planning', tempDir)).not.toThrow();
  });

  test('throws with a message naming the colliding document when the id is already used', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'task-store-'));
    writeTaskDoc(tempDir, 'existing.md', 'F001-T1');

    expect(() => assertTaskIdIsUnused(tempDir, 'F001-T1', 'Task planning', tempDir))
      .toThrow(/Task planning proposed task id `F001-T1`.*existing\.md/s);
  });
});

describe('findLatestTaskArtifactTaskId', () => {
  test('returns the most recently written artifact whose feature_id matches', () => {
    const older = { name: 'F001-T1.json', mtimeMs: 1000 };
    const newer = { name: 'F001-T2.json', mtimeMs: 2000 };
    const artifactsByName: Record<string, { task: { feature_id: string; task_id: string } }> = {
      'F001-T1.json': { task: { feature_id: '001-widgets', task_id: 'F001-T1' } },
      'F001-T2.json': { task: { feature_id: '001-widgets', task_id: 'F001-T2' } },
    };

    const result = findLatestTaskArtifactTaskId(
      [older, newer],
      (fileName) => artifactsByName[fileName] as never,
      '001-widgets',
    );

    expect(result).toBe('F001-T2');
  });

  test('breaks a tied mtime by file name instead of returning an arbitrary result', () => {
    const a = { name: 'F001-T1.json', mtimeMs: 1000 };
    const b = { name: 'F001-T2.json', mtimeMs: 1000 };
    const artifactsByName: Record<string, { task: { feature_id: string; task_id: string } }> = {
      'F001-T1.json': { task: { feature_id: '001-widgets', task_id: 'F001-T1' } },
      'F001-T2.json': { task: { feature_id: '001-widgets', task_id: 'F001-T2' } },
    };

    const readArtifact = (fileName: string) => artifactsByName[fileName] as never;
    const resultAB = findLatestTaskArtifactTaskId([a, b], readArtifact, '001-widgets');
    const resultBA = findLatestTaskArtifactTaskId([b, a], readArtifact, '001-widgets');

    // Regardless of input order, the lexicographically later file name wins the tie.
    expect(resultAB).toBe('F001-T2');
    expect(resultBA).toBe('F001-T2');
  });

  test('skips artifacts for a different feature and returns null when none match', () => {
    const artifact = { name: 'F001-T1.json', mtimeMs: 1000 };
    const result = findLatestTaskArtifactTaskId(
      [artifact],
      () => ({ task: { feature_id: '002-other', task_id: 'F001-T1' } } as never),
      '001-widgets',
    );

    expect(result).toBeNull();
  });
});

describe('findLatestImplementationAttemptTaskId', () => {
  test('resolves the task id via the attempt history, cross-checked against the task artifact feature id', () => {
    const attempt = { name: 'F001-T1.json', mtimeMs: 1000 };
    const result = findLatestImplementationAttemptTaskId(
      [attempt],
      () => ({ task_id: 'F001-T1' } as never),
      (taskId) => ({ task: { feature_id: '001-widgets', task_id: taskId } } as never),
      '001-widgets',
    );

    expect(result).toBe('F001-T1');
  });

  test('ignores per-attempt files (containing ".attempt-") when scanning for the latest', () => {
    const attemptFile = { name: 'F001-T1.attempt-1.json', mtimeMs: 2000 };
    const historyFile = { name: 'F001-T1.json', mtimeMs: 1000 };
    const result = findLatestImplementationAttemptTaskId(
      [attemptFile, historyFile],
      () => ({ task_id: 'F001-T1' } as never),
      (taskId) => ({ task: { feature_id: '001-widgets', task_id: taskId } } as never),
      '001-widgets',
    );

    expect(result).toBe('F001-T1');
  });

  test('returns null when the cross-checked task artifact belongs to a different feature', () => {
    const attempt = { name: 'F001-T1.json', mtimeMs: 1000 };
    const result = findLatestImplementationAttemptTaskId(
      [attempt],
      () => ({ task_id: 'F001-T1' } as never),
      () => ({ task: { feature_id: '002-other', task_id: 'F001-T1' } } as never),
      '001-widgets',
    );

    expect(result).toBeNull();
  });
});
