import { describe, expect, test } from 'vitest';
import { resolveUnanimousVote, uniqueStrings } from '../src/shared/arrays.js';

describe('uniqueStrings', () => {
  test('removes duplicates while preserving first-seen order', () => {
    expect(uniqueStrings(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
  });

  test('returns an empty array for an empty input', () => {
    expect(uniqueStrings([])).toEqual([]);
  });
});

describe('resolveUnanimousVote', () => {
  test('agrees when every vote is identical', () => {
    expect(resolveUnanimousVote(['file_blocking_fix', 'file_blocking_fix', 'file_blocking_fix'])).toEqual({
      agreed: true,
      value: 'file_blocking_fix',
    });
  });

  test('disagrees when votes differ', () => {
    expect(resolveUnanimousVote(['plan_doctor_recovery', 'file_blocking_fix', 'plan_doctor_recovery'])).toEqual({
      agreed: false,
    });
  });

  test('disagrees on an empty vote set rather than trivially agreeing', () => {
    expect(resolveUnanimousVote([])).toEqual({ agreed: false });
  });

  test('agrees on a single vote', () => {
    expect(resolveUnanimousVote(['plan_doctor_recovery'])).toEqual({ agreed: true, value: 'plan_doctor_recovery' });
  });

  test('works over non-string vote types', () => {
    expect(resolveUnanimousVote([1, 1, 1])).toEqual({ agreed: true, value: 1 });
    expect(resolveUnanimousVote([true, false])).toEqual({ agreed: false });
  });
});
