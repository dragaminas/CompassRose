import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createTempWorkspace, type TempWorkspace } from './testUtils.js';
import {
  assertNever,
  compareFeatureIds,
  createRunId,
  errorMessage,
  extractReferencedPaths,
  isRecord,
  primaryTaskAnchorFromId,
  readPositiveInteger,
  readRecordString,
  requireNonNoneValue,
  requireString,
  statSafeIsFile,
  writeText,
} from '../src/orchestrator/runtimeHelpers.js';

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
});

describe('compareFeatureIds', () => {
  test('orders feature ids numerically by their leading number', () => {
    expect(compareFeatureIds('002-configuration-model', '010-generic-external-cli-adapter')).toBeLessThan(0);
    expect(compareFeatureIds('010-generic-external-cli-adapter', '002-configuration-model')).toBeGreaterThan(0);
    expect(compareFeatureIds('002-configuration-model', '002-configuration-model')).toBe(0);
  });
});

describe('isRecord / readRecordString / readPositiveInteger', () => {
  test('isRecord accepts plain objects and rejects arrays/null/primitives', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('x')).toBe(false);
  });

  test('readRecordString returns a trimmed string or null', () => {
    expect(readRecordString({ a: 'value' }, 'a')).toBe('value');
    expect(readRecordString({ a: '   ' }, 'a')).toBeNull();
    expect(readRecordString({ a: 1 }, 'a')).toBeNull();
    expect(readRecordString({}, 'a')).toBeNull();
  });

  test('readPositiveInteger returns a positive integer or null', () => {
    expect(readPositiveInteger({ a: 5 }, 'a')).toBe(5);
    expect(readPositiveInteger({ a: 0 }, 'a')).toBeNull();
    expect(readPositiveInteger({ a: -1 }, 'a')).toBeNull();
    expect(readPositiveInteger({ a: 1.5 }, 'a')).toBeNull();
    expect(readPositiveInteger({ a: 'x' }, 'a')).toBeNull();
  });
});

describe('createRunId', () => {
  test('produces a run- prefixed, timestamp-derived id with no colons/dots', () => {
    const id = createRunId();
    expect(id.startsWith('run-')).toBe(true);
    expect(id).not.toMatch(/[:.]/);
  });
});

describe('statSafeIsFile', () => {
  test('returns true for an existing file and false for a missing path', () => {
    workspace = createTempWorkspace({ files: { 'a.txt': 'x' } });
    expect(statSafeIsFile(join(workspace.root, 'a.txt'))).toBe(true);
    expect(statSafeIsFile(join(workspace.root, 'missing.txt'))).toBe(false);
  });

  test('returns false for a directory', () => {
    workspace = createTempWorkspace({ directories: ['sub'] });
    expect(statSafeIsFile(join(workspace.root, 'sub'))).toBe(false);
  });
});

describe('writeText', () => {
  test('creates parent directories and normalizes trailing whitespace', () => {
    workspace = createTempWorkspace();
    const path = join(workspace.root, 'nested', 'dir', 'file.md');
    writeText(path, 'hello\n\n\n');
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe('hello\n');
  });
});

describe('requireString', () => {
  test('returns the value when non-empty', () => {
    expect(requireString('x', 'field')).toBe('x');
  });

  test('throws when null', () => {
    expect(() => requireString(null, 'field')).toThrow(/Missing required field field/);
  });
});

describe('requireNonNoneValue', () => {
  test('returns the value when set and not "none"', () => {
    expect(requireNonNoneValue('F001-T01', 'missing')).toBe('F001-T01');
  });

  test('throws for null, undefined, and the literal "none"', () => {
    expect(() => requireNonNoneValue(null, 'msg')).toThrow('msg');
    expect(() => requireNonNoneValue(undefined, 'msg')).toThrow('msg');
    expect(() => requireNonNoneValue('none', 'msg')).toThrow('msg');
  });
});

describe('primaryTaskAnchorFromId', () => {
  test('extracts the FNNN-TNNN anchor from a longer correction id', () => {
    expect(primaryTaskAnchorFromId('F002-T04-C3-U1-C1')).toBe('F002-T04');
  });

  test('returns the original id when it does not match the anchor pattern', () => {
    expect(primaryTaskAnchorFromId('not-a-task-id')).toBe('not-a-task-id');
  });
});

describe('errorMessage', () => {
  test('extracts the message from an Error instance', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  test('stringifies non-Error values', () => {
    expect(errorMessage('plain string')).toBe('plain string');
    expect(errorMessage(42)).toBe('42');
  });
});

describe('assertNever', () => {
  test('throws with the stringified value', () => {
    expect(() => assertNever('unexpected' as never)).toThrow(/Unhandled value: unexpected/);
  });
});

describe('extractReferencedPaths', () => {
  const ESC = String.fromCharCode(27);

  test('extracts a plain repo-relative path with a :line:col suffix', () => {
    const output = 'FAIL tests/protoBlockerFlows.test.ts:154:27\nsome other line';
    expect(extractReferencedPaths(output)).toEqual(['tests/protoBlockerFlows.test.ts']);
  });

  test('strips ANSI color codes before matching, as real vitest output contains them', () => {
    const output = [
      `${ESC}[1m${ESC}[31mFAIL${ESC}[39m${ESC}[22m tests/protoBlockerFlows.test.ts`,
      `${ESC}[36m ${ESC}[2m❯${ESC}[22m tests/protoBlockerFlows.test.ts:${ESC}[2m154:27${ESC}[22m${ESC}[39m`,
    ].join('\n');

    expect(extractReferencedPaths(output)).toEqual(['tests/protoBlockerFlows.test.ts']);
  });

  test('deduplicates repeated references to the same path', () => {
    const output = 'tests/foo.test.ts:1:1\ntests/foo.test.ts:2:2\ntests/foo.test.ts';
    expect(extractReferencedPaths(output)).toEqual(['tests/foo.test.ts']);
  });

  test('extracts multiple distinct paths', () => {
    const output = 'FAIL tests/a.test.ts:1:1\nFAIL tests/b.test.ts:2:2';
    expect(extractReferencedPaths(output).sort()).toEqual(['tests/a.test.ts', 'tests/b.test.ts']);
  });

  test('excludes node_modules paths', () => {
    const output = 'at Object.<anonymous> (node_modules/vitest/dist/index.js:12:3)\ntests/foo.test.ts:1:1';
    expect(extractReferencedPaths(output)).toEqual(['tests/foo.test.ts']);
  });

  test('returns an empty array when no path-like text is present', () => {
    expect(extractReferencedPaths('all good, no failures here')).toEqual([]);
  });

  test('does not match an absolute Windows path with backslashes', () => {
    const output = 'C:\\Users\\Eric\\repo\\src\\orchestrator\\orchestrator.ts:3446:13';
    expect(extractReferencedPaths(output)).toEqual([]);
  });
});
