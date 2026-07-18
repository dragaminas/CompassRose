import { describe, expect, test } from 'vitest';
import { allPathsAllowedByPrefix, isPathAllowedByPrefix, pathsExceedingPrefixes } from '../src/shared/pathPrefix.js';

describe('isPathAllowedByPrefix', () => {
  test('matches a path equal to a prefix', () => {
    expect(isPathAllowedByPrefix('src/config', ['src/config'])).toBe(true);
  });

  test('matches a path nested under a prefix directory', () => {
    expect(isPathAllowedByPrefix('src/config/loader.ts', ['src/config'])).toBe(true);
  });

  test('does not match a sibling path that merely shares a string prefix', () => {
    expect(isPathAllowedByPrefix('src/config-extra/loader.ts', ['src/config'])).toBe(false);
  });

  test('does not match when the prefix itself carries a trailing slash', () => {
    expect(isPathAllowedByPrefix('src/config/loader.ts', ['src/config/'])).toBe(false);
  });

  test('returns false when no prefixes are given', () => {
    expect(isPathAllowedByPrefix('src/config/loader.ts', [])).toBe(false);
  });
});

describe('allPathsAllowedByPrefix', () => {
  test('true when every path is covered by some prefix', () => {
    expect(
      allPathsAllowedByPrefix(['src/config/loader.ts', 'tests/loader.test.ts'], ['src/config', 'tests']),
    ).toBe(true);
  });

  test('false when any path is not covered', () => {
    expect(allPathsAllowedByPrefix(['src/config/loader.ts', 'src/other/x.ts'], ['src/config'])).toBe(false);
  });

  test('true for an empty path list regardless of prefixes', () => {
    expect(allPathsAllowedByPrefix([], ['src/config'])).toBe(true);
  });
});

describe('pathsExceedingPrefixes', () => {
  test('returns only the paths not covered by any prefix', () => {
    expect(
      pathsExceedingPrefixes(['src/config/loader.ts', 'src/other/x.ts', 'tests/loader.test.ts'], ['src/config', 'tests']),
    ).toEqual(['src/other/x.ts']);
  });

  test('returns an empty array when everything is covered', () => {
    expect(pathsExceedingPrefixes(['src/config/loader.ts'], ['src/config'])).toEqual([]);
  });
});
