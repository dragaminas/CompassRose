import { describe, expect, test } from 'vitest';
import { validateProjectState } from '../src/contracts/state/projectState.js';

describe('validateProjectState', () => {
  test('returns ok when project state has a heading and status section', () => {
    const content = [
      '# State: Project Identity and Foundation',
      '',
      '## Status',
      '',
      'In progress',
    ].join('\n');

    const result = validateProjectState(content);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('In progress');
    }
  });

  test('returns err when the document is missing a heading', () => {
    const content = '## Status\n\nIn progress\n';

    const result = validateProjectState(content);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe('project_state');
      expect(result.error.message).toContain('heading');
    }
  });

  test('returns err when the document is missing the Status section', () => {
    const content = '# State: Something\n\nNo status section here.\n';

    const result = validateProjectState(content);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe('project_state');
      expect(result.error.message).toContain('Status');
    }
  });

  test('returns err when the document is empty', () => {
    const content = '';

    const result = validateProjectState(content);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe('project_state');
    }
  });
});
