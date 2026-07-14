import { describe, expect, test } from 'vitest';
import { replaceOperationalStatus } from '../src/orchestrator/stateMarkdown.js';

const BASE_MARKDOWN = `# State: Widgets

## Operational Status

- formalization: complete
- active_task: F001-T01
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: passed
- last_quality_gate_result: unknown
- last_review_result: not_run
- last_unblock_result: not_run

## Other Section

content
`;

describe('replaceOperationalStatus', () => {
  test('overrides only the given keys, leaving the rest as-is', () => {
    const result = replaceOperationalStatus(BASE_MARKDOWN, { active_task: 'F001-T02', last_review_result: 'approved' });
    expect(result).toContain('- active_task: F001-T02');
    expect(result).toContain('- last_review_result: approved');
    expect(result).toContain('- formalization: complete');
    expect(result).toContain('## Other Section');
  });

  test('fills in missing default keys when the section is sparse', () => {
    const sparse = `# State: Widgets\n\n## Operational Status\n\n- active_task: F001-T01\n`;
    const result = replaceOperationalStatus(sparse, {});
    expect(result).toContain('- formalization: complete');
    expect(result).toContain('- last_unblock_result: not_run');
    expect(result).toContain('- active_task: F001-T01');
  });

  test('ignores undefined override values', () => {
    const result = replaceOperationalStatus(BASE_MARKDOWN, { active_task: undefined });
    expect(result).toContain('- active_task: F001-T01');
  });

  test('throws when the markdown has no Operational Status section', () => {
    expect(() => replaceOperationalStatus('# State: Widgets\n\nno section here\n', {})).toThrow();
  });
});
