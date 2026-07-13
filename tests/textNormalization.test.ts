import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test } from 'vitest';
import { normalizeTextForWrite, readTextIfExists, readUtf8 } from '../src/filesystem/textNormalization.js';

describe('text normalization', () => {
  let tempDir: string | null = null;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  test('readUtf8 normalizes CRLF line endings to LF', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'text-normalization-'));
    const filePath = join(tempDir, 'crlf.md');
    writeFileSync(filePath, '## Goal\r\n\r\nDo the thing.\r\n', 'utf8');

    expect(readUtf8(filePath)).toBe('## Goal\n\nDo the thing.\n');
  });

  test('readTextIfExists returns the file contents when the file exists', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'text-normalization-'));
    const filePath = join(tempDir, 'present.md');
    writeFileSync(filePath, 'hello\n', 'utf8');

    expect(readTextIfExists(filePath)).toBe('hello\n');
  });

  test('readTextIfExists returns an empty string when the file is missing', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'text-normalization-'));
    expect(readTextIfExists(join(tempDir, 'missing.md'))).toBe('');
  });

  test('normalizeTextForWrite trims trailing whitespace and ensures exactly one trailing newline', () => {
    expect(normalizeTextForWrite('hello   \n\n\n')).toBe('hello\n');
    expect(normalizeTextForWrite('hello')).toBe('hello\n');
  });
});
