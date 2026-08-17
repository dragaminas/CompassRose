import { describe, expect, test } from 'vitest';
import { compactRecoveryHistorySection } from '../src/orchestrator/recoveryHistoryCompaction.js';

const HEADER = `# State: Fixture Feature

## Lifecycle State

review_pending

`;

const TRAILER = `

## Known Gaps

- None.
`;

function withRecoveryHistory(body: string): string {
  return `${HEADER}## Recovery History\n\n${body}\n${TRAILER}`;
}

describe('compactRecoveryHistorySection', () => {
  test('leaves the document unchanged when there is no Recovery History section', () => {
    const markdown = `${HEADER}## Known Gaps\n\n- None.\n`;
    expect(compactRecoveryHistorySection(markdown)).toBe(markdown);
  });

  test('leaves a short Recovery History section untouched', () => {
    const markdown = withRecoveryHistory('- Doctor recovery task `F001-DR01` resolved a state_corruption blocker.');
    expect(compactRecoveryHistorySection(markdown)).toBe(markdown);
  });

  test('compacts a Recovery History section past the threshold into one line naming every recovery task id', () => {
    const longEntry = (id: string) => `- Doctor recovery task \`${id}\` preserves the supplied blocker kind and signature. `.repeat(6);
    const body = ['F001-DR01', 'F001-DR02', 'F001-DR03'].map(longEntry).join('\n\n');
    const markdown = withRecoveryHistory(body);
    expect(body.length).toBeGreaterThan(1500);

    const compacted = compactRecoveryHistorySection(markdown);

    expect(compacted).toContain('## Recovery History');
    expect(compacted).toContain('F001-DR01');
    expect(compacted).toContain('F001-DR02');
    expect(compacted).toContain('F001-DR03');
    expect(compacted).toContain('.git/proto-compassrose/blockers/');
    expect(compacted).not.toContain('preserves the supplied blocker kind');
    // Everything outside the section must survive untouched.
    expect(compacted).toContain('## Known Gaps');
    expect(compacted).toContain('review_pending');
  });

  test('compacts to a generic summary when the oversized body names no recovery task id', () => {
    const body = 'Something happened during recovery that never quotes a task id. '.repeat(40);
    const markdown = withRecoveryHistory(body);
    expect(body.length).toBeGreaterThan(1500);

    const compacted = compactRecoveryHistorySection(markdown);

    expect(compacted).toContain('Recovery history recorded before this point was compacted');
    expect(compacted).not.toContain('Something happened during recovery');
  });

  test('is idempotent: compacting an already-compacted section is a no-op', () => {
    const longEntry = (id: string) => `- Doctor recovery task \`${id}\` preserves the supplied blocker kind and signature. `.repeat(6);
    const body = ['F001-DR01', 'F001-DR02', 'F001-DR03'].map(longEntry).join('\n\n');
    const markdown = withRecoveryHistory(body);

    const compactedOnce = compactRecoveryHistorySection(markdown);
    const compactedTwice = compactRecoveryHistorySection(compactedOnce);

    expect(compactedTwice).toBe(compactedOnce);
  });
});
