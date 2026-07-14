import { describe, expect, test } from 'vitest';
import {
  isBlockerKind,
  isBlockerRecoverability,
  readValueFromStructuredLines,
  renderBlockerProfileMarkdown,
} from '../src/orchestrator/blockerRendering.js';

describe('isBlockerKind', () => {
  test('accepts every known blocker kind', () => {
    for (const kind of ['state_corruption', 'task_interface_gap', 'cli_mismatch', 'environment', 'implementation_failure', 'review_failure', 'unknown']) {
      expect(isBlockerKind(kind)).toBe(true);
    }
  });

  test('rejects an unrecognized value', () => {
    expect(isBlockerKind('something_else')).toBe(false);
  });
});

describe('isBlockerRecoverability', () => {
  test('accepts every known recoverability value', () => {
    for (const value of ['auto', 'agent', 'human', 'terminal']) {
      expect(isBlockerRecoverability(value)).toBe(true);
    }
  });

  test('rejects an unrecognized value', () => {
    expect(isBlockerRecoverability('maybe')).toBe(false);
  });
});

describe('readValueFromStructuredLines', () => {
  test('finds a key case-insensitively and strips surrounding ticks', () => {
    const lines = ['kind: implementation_failure', 'signature: `implementation-failure-F001-T01`'];
    expect(readValueFromStructuredLines(lines, 'signature')).toBe('implementation-failure-F001-T01');
  });

  test('returns null when the key is not present', () => {
    expect(readValueFromStructuredLines(['kind: implementation_failure'], 'missing')).toBeNull();
  });

  test('returns null when the value is empty', () => {
    expect(readValueFromStructuredLines(['kind:'], 'kind')).toBeNull();
  });
});

describe('renderBlockerProfileMarkdown', () => {
  test('renders blocker and restoration-target sections', () => {
    const markdown = renderBlockerProfileMarkdown({
      run_id: 'run-1',
      feature_id: '001-widgets',
      task_id: 'F001-T01',
      reason: 'implementation failed',
      blocker: {
        kind: 'implementation_failure',
        signature: 'implementation-failure-F001-T01',
        recoverability: 'agent',
        observed_state: 'lifecycle=implementation_failed',
        evidence: [],
      },
      restoration_target: {
        lifecycle_state: 'implementation_running',
        active_task: 'F001-T01',
        active_correction_task: 'none',
        active_unblock_task: 'none',
      },
    });

    expect(markdown).toContain('# Blocker Profile: 001-widgets');
    expect(markdown).toContain('- kind: implementation_failure');
    expect(markdown).toContain('- evidence: none');
    expect(markdown).toContain('## Restoration Target');
  });
});
