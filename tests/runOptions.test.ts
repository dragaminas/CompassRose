import { describe, expect, test } from 'vitest';
import { resolve } from 'node:path';
import { parseRunArguments } from '../src/cli/runOptions.js';

describe('parseRunArguments', () => {
  test('defaults to loop=false, commit=true, implementer=opencode, and the given default cwd', () => {
    expect(parseRunArguments([], '/repo')).toEqual({
      loop: false,
      commit: true,
      cwd: '/repo',
      implementer: 'opencode',
    });
  });

  test('--loop sets loop to true', () => {
    expect(parseRunArguments(['--loop'], '/repo').loop).toBe(true);
  });

  test('--no-commit sets commit to false', () => {
    expect(parseRunArguments(['--no-commit'], '/repo').commit).toBe(false);
  });

  test('--implementer accepts codex or opencode', () => {
    expect(parseRunArguments(['--implementer', 'codex'], '/repo').implementer).toBe('codex');
    expect(parseRunArguments(['--implementer', 'opencode'], '/repo').implementer).toBe('opencode');
  });

  test('--implementer throws for an unrecognized value', () => {
    expect(() => parseRunArguments(['--implementer', 'gpt'], '/repo')).toThrow(/--implementer requires/);
  });

  test('--implementer throws when no value follows', () => {
    expect(() => parseRunArguments(['--implementer'], '/repo')).toThrow(/--implementer requires/);
  });

  test('--cwd overrides the default cwd, resolved to an absolute path', () => {
    expect(parseRunArguments(['--cwd', '.'], '/repo').cwd).toBe(resolve('.'));
  });

  test('--cwd throws when no value follows', () => {
    expect(() => parseRunArguments(['--cwd'], '/repo')).toThrow(/--cwd requires a value/);
  });

  test('combines multiple flags', () => {
    expect(parseRunArguments(['--loop', '--no-commit', '--implementer', 'codex'], '/repo')).toEqual({
      loop: true,
      commit: false,
      cwd: '/repo',
      implementer: 'codex',
    });
  });

  test('throws on an unrecognized argument', () => {
    expect(() => parseRunArguments(['--bogus'], '/repo')).toThrow(/Unknown argument: --bogus/);
  });
});
