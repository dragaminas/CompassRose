import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test } from 'vitest';
import { limitStateCorrectionTaskId } from '../src/task/taskId.js';

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

  test('refuses nested correction depth at the boundary', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'correction-limit-'));

    // Write C1 and C2 for the same task anchor
    writeFileSync(join(tempDir, '007.1.md'), '`F002-T7-C1`\n', 'utf8');
    writeFileSync(join(tempDir, '007.2.md'), '`F002-T7-C2`\n', 'utf8');

    // Even a nested correction for the same anchor (e.g., C2's correction) would
    // attempt the next correction number for F002-T7 -> C3 is refused
    const nestedRefused = limitStateCorrectionTaskId(tempDir, 'F002-T7', 2);
    expect(nestedRefused).toBe(null);
  });
});
