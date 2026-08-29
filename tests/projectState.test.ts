import { describe, expect, test } from 'vitest';
import {
  PROJECT_STATE_REQUIRED_SECTIONS,
  validateProjectState,
} from '../src/contracts/state/projectState.js';

/**
 * A document with every section the runtime writes into, so a test that removes one is testing
 * exactly that removal.
 */
function completeDocument(status = 'In progress'): string {
  return [
    '# State: Project Identity and Foundation',
    '',
    ...PROJECT_STATE_REQUIRED_SECTIONS.flatMap((section) => [
      `## ${section}`,
      '',
      section === 'Status' ? status : 'None',
      '',
    ]),
  ].join('\n');
}

describe('validateProjectState', () => {
  test('returns ok when every required section is present', () => {
    const result = validateProjectState(completeDocument());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('In progress');
    }
  });

  test('returns err when the document is missing a heading', () => {
    const result = validateProjectState(completeDocument().replace(/^# .*\n/, ''));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe('project_state');
      expect(result.error.message).toContain('heading');
    }
  });

  /**
   * Every section, not only `Status`. `Implemented` is the one that was actually missing from what
   * `compassrose setup` seeded, and the first feature ever completed in a bootstrapped repository
   * crashed on it -- after passing all ten of its acceptance criteria. Naming each section in its
   * own case means the next omission is caught by whichever one it is.
   */
  test.each(PROJECT_STATE_REQUIRED_SECTIONS)('returns err when "## %s" is missing', (section) => {
    const result = validateProjectState(
      completeDocument().replace(new RegExp(`^## ${section}\\s*$`, 'm'), '## Something Else'),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe('project_state');
      expect(result.error.message).toContain(`"## ${section}"`);
    }
  });

  test('names every missing section at once, not just the first', () => {
    const result = validateProjectState(
      ['# State: Something', '', '## Status', '', 'In progress', ''].join('\n'),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('"## Implemented"');
      expect(result.error.message).toContain('"## Known Gaps"');
    }
  });

  test('reads an empty status when the heading is the last line of the file', () => {
    const result = validateProjectState(completeDocument().trimEnd().replace(/\n[^\n]*$/, ''));

    // The section list is still satisfied; only the body after `## Next Planning Hint` is gone.
    expect(result.ok).toBe(true);
  });

  test('returns err when the document is empty', () => {
    const result = validateProjectState('');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe('project_state');
    }
  });
});
