import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test } from 'vitest';
import {
  buildCorrectionTaskFileName,
  buildStateCorrectionTaskId,
  buildTaskFileName,
  capTaskFileNameLength,
  humanCorrectionNumber,
  humanTaskNumber,
} from '../src/task/taskId.js';

describe('humanTaskNumber', () => {
  test('formats a plain task id', () => {
    expect(humanTaskNumber('F002-T7')).toBe('007');
  });

  test('formats an unblock task id', () => {
    expect(humanTaskNumber('F002-T7-U2')).toBe('007.U2');
  });

  test('returns the input unchanged when it does not match either shape', () => {
    expect(humanTaskNumber('not-a-task-id')).toBe('not-a-task-id');
  });
});

describe('humanCorrectionNumber', () => {
  test('formats a correction task id', () => {
    expect(humanCorrectionNumber('F002-T7-C3')).toBe('007.3');
  });

  test('returns the input unchanged when it does not match', () => {
    expect(humanCorrectionNumber('F002-T7')).toBe('F002-T7');
  });
});

describe('capTaskFileNameLength', () => {
  test('leaves short names untouched (plus the .md suffix)', () => {
    expect(capTaskFileNameLength('007-add-the-widget', 'F002-T7')).toBe('007-add-the-widget.md');
  });

  test('truncates long names and appends a stable hash of the unique seed', () => {
    const longBase = `007-${'a'.repeat(200)}`;
    const result = capTaskFileNameLength(longBase, 'F002-T7');
    expect(result.length).toBeLessThanOrEqual(120 + '.md'.length);
    expect(result).toMatch(/-[0-9a-f]{8}\.md$/);
    // Same seed -> same hash, so re-running the same truncation is deterministic.
    expect(capTaskFileNameLength(longBase, 'F002-T7')).toBe(result);
    // A different seed with the same truncated prefix must not collide.
    expect(capTaskFileNameLength(longBase, 'F002-T8')).not.toBe(result);
  });
});

describe('buildTaskFileName / buildCorrectionTaskFileName', () => {
  test('builds a short-form task file name from a task id and title', () => {
    expect(buildTaskFileName('F002-T7', 'Add the widget')).toBe('007-add-the-widget.md');
  });

  test('builds a short-form correction task file name', () => {
    expect(buildCorrectionTaskFileName('F002-T7-C3', 'Fix the widget')).toBe('007.3-fix-the-widget.md');
  });
});

describe('buildStateCorrectionTaskId', () => {
  let tempDir: string | null = null;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  test('returns -C1 when the tasks directory does not exist yet', () => {
    expect(buildStateCorrectionTaskId('/does/not/exist', 'F002-T7')).toBe('F002-T7-C1');
  });

  test('returns -C1 when no prior correction for this task exists', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'task-id-'));
    writeFileSync(join(tempDir, 'unrelated.md'), '# Unrelated\n\n`F002-T9-C1`\n', 'utf8');

    expect(buildStateCorrectionTaskId(tempDir, 'F002-T7')).toBe('F002-T7-C1');
  });

  test('increments past the highest existing correction number for this task', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'task-id-'));
    writeFileSync(join(tempDir, '007.1.md'), 'Refers to `F002-T7-C1`.\n', 'utf8');
    writeFileSync(join(tempDir, '007.2.md'), 'Refers to `F002-T7-C2`.\n', 'utf8');

    expect(buildStateCorrectionTaskId(tempDir, 'F002-T7')).toBe('F002-T7-C3');
  });

  test('ignores non-markdown files in the tasks directory', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'task-id-'));
    mkdirSync(join(tempDir, 'sub'), { recursive: true });
    writeFileSync(join(tempDir, 'notes.txt'), '`F002-T7-C9`\n', 'utf8');

    expect(buildStateCorrectionTaskId(tempDir, 'F002-T7')).toBe('F002-T7-C1');
  });
});
