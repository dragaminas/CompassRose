import { describe, expect, test } from 'vitest';
import { replaceOperationalStatus } from '../src/orchestrator/stateMarkdown.js';

const BASE_MARKDOWN = `# State: Widgets

## Operational Status

- formalization: complete
- active_task: F001-T01
- active_correction_task: none
- last_implementation_result: passed
- last_quality_gate_result: unknown
- last_review_result: not_run

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
    expect(result).toContain('- last_review_result: not_run');
    expect(result).toContain('- active_task: F001-T01');
  });

  test('prunes the keys the retired doctor-recovery pipeline owned', () => {
    // Every other key is carried forward by design, so without an explicit prune these four
    // would outlive the mechanism that wrote them in every state.md forever.
    // Built by concatenation rather than written literally: these four key names are exactly what
    // this repository's own cleanup swept out of every fixture, so a literal here would be swept
    // out with them and leave the test asserting nothing.
    const retired = ['active_unblock_task', 'last_unblock_result', 'doctor_recovery_attempts', 'doctor_recovery_lifetime_count'];
    const stale = [
      '# State: Widgets',
      '',
      '## Operational Status',
      '',
      '- active_task: F001-T01',
      ...retired.map((key) => `- ${key}: stale`),
      '',
    ].join('\n');

    const result = replaceOperationalStatus(stale, {});
    expect(result).toContain('- active_task: F001-T01');
    expect(result).not.toContain('active_unblock_task');
    expect(result).not.toContain('last_unblock_result');
    expect(result).not.toContain('doctor_recovery_attempts');
    expect(result).not.toContain('doctor_recovery_lifetime_count');
  });

  test('ignores undefined override values', () => {
    const result = replaceOperationalStatus(BASE_MARKDOWN, { active_task: undefined });
    expect(result).toContain('- active_task: F001-T01');
  });

  test('throws when the markdown has no Operational Status section', () => {
    expect(() => replaceOperationalStatus('# State: Widgets\n\nno section here\n', {})).toThrow();
  });
});
