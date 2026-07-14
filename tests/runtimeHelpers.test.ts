import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createTempWorkspace, type TempWorkspace } from './testUtils.js';
import {
  assertNever,
  compareFeatureIds,
  createRunId,
  errorMessage,
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
