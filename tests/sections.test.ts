import { describe, expect, test } from 'vitest';
import {
  escapeRegExp,
  extractTaskIdHint,
  firstExpectedChange,
  optionalSection,
  parseBulletSection,
  parseCodeBlock,
  parseLabeledBulletList,
  parsePreferredStatusValue,
  parseStatusMap,
  replaceSection,
  requireSection,
  setOrInsertSection,
  slugify,
  stripTicks,
  upsertBulletInSection,
  upsertParagraphInSection,
} from '../src/markdown/sections.js';

describe('markdown sections', () => {
  test('optionalSection returns null when the heading is absent', () => {
    expect(optionalSection('# Doc\n\nNo headings here.', 'Goal')).toBeNull();
  });

  test('optionalSection extracts the body up to the next heading', () => {
    const markdown = '## Goal\n\nDo the thing.\n\n## Scope\n\nAllowed: a\n';
    expect(optionalSection(markdown, 'Goal')).toBe('Do the thing.');
  });

  test('optionalSection tolerates CRLF line endings', () => {
    const markdown = '## Goal\r\n\r\nDo the thing.\r\n\r\n## Scope\r\n\r\nAllowed: a\r\n';
    expect(optionalSection(markdown, 'Goal')).toBe('Do the thing.');
  });

  test('requireSection throws when the heading is missing', () => {
    expect(() => requireSection('# Doc', 'Goal')).toThrow(/was not found/);
  });

  test('replaceSection swaps only the targeted section body', () => {
    const markdown = '## Goal\n\nOld goal.\n\n## Scope\n\nAllowed: a\n';
    const updated = replaceSection(markdown, 'Goal', 'New goal.');
    expect(optionalSection(updated, 'Goal')).toBe('New goal.');
    expect(optionalSection(updated, 'Scope')).toBe('Allowed: a');
  });

  test('setOrInsertSection inserts a new section after Status when the heading is missing', () => {
    const markdown = '## Status\n\nIn progress\n\n## Other\n\nSomething\n';
    const updated = setOrInsertSection(markdown, 'Pending', '- do the next thing');
    expect(optionalSection(updated, 'Pending')).toBe('- do the next thing');
    expect(optionalSection(updated, 'Other')).toBe('Something');
  });

  test('setOrInsertSection replaces an existing section instead of duplicating it', () => {
    const markdown = '## Status\n\nIn progress\n\n## Pending\n\n- old\n';
    const updated = setOrInsertSection(markdown, 'Pending', '- new');
    expect(optionalSection(updated, 'Pending')).toBe('- new');
    expect(updated.match(/## Pending/g)?.length).toBe(1);
  });

  test('upsertBulletInSection replaces a bullet matching the prefix and appends otherwise', () => {
    const markdown = '## Status\n\n- active_task: F1-T1\n- active_correction_task: none\n';
    const replaced = upsertBulletInSection(markdown, 'Status', 'active_task:', '- active_task: F1-T2');
    expect(optionalSection(replaced, 'Status')).toContain('active_task: F1-T2');
    const appended = upsertBulletInSection(markdown, 'Status', 'new_field:', '- new_field: value');
    expect(optionalSection(appended, 'Status')).toContain('new_field: value');
  });

  test('upsertParagraphInSection replaces a matching paragraph and appends otherwise', () => {
    const markdown = '## Notes\n\nFirst paragraph.\n\nSecond paragraph mentions apples.\n';
    const replaced = upsertParagraphInSection(markdown, 'Notes', 'apples', 'Second paragraph now mentions oranges.');
    expect(optionalSection(replaced, 'Notes')).toContain('oranges');
    expect(optionalSection(replaced, 'Notes')).not.toContain('apples');
  });

  test('parseBulletSection extracts bullet items and returns null when there are none', () => {
    expect(parseBulletSection('- one\n- two\n')).toEqual(['one', 'two']);
    expect(parseBulletSection('no bullets here')).toBeNull();
    expect(parseBulletSection(null)).toBeNull();
  });

  test('parseLabeledBulletList extracts the bullet list following a label', () => {
    const section = 'Allowed:\n- a.ts\n- b.ts\n\nForbidden:\n- c.ts\n';
    expect(parseLabeledBulletList(section, 'Allowed')).toEqual(['a.ts', 'b.ts']);
    expect(parseLabeledBulletList(section, 'Forbidden')).toEqual(['c.ts']);
  });

  test('parseCodeBlock extracts non-empty lines from a fenced block', () => {
    const section = '```bash\nnpm test\n\nnpm run typecheck\n```';
    expect(parseCodeBlock(section)).toEqual(['npm test', 'npm run typecheck']);
    expect(parseCodeBlock(null)).toBeNull();
  });

  test('firstExpectedChange returns the first bullet under Expected Changes', () => {
    const markdown = '## Expected Changes\n\n- update src/foo.ts\n- update tests/foo.test.ts\n';
    expect(firstExpectedChange(markdown)).toBe('update src/foo.ts');
    expect(firstExpectedChange('# Doc')).toBeNull();
  });

  test('parseStatusMap parses "- key: value" bullet lines', () => {
    expect(parseStatusMap('- a: 1\n- b: 2\nnot a bullet\n')).toEqual({ a: '1', b: '2' });
  });

  test('parsePreferredStatusValue prefers the last non-"none" value for repeated keys', () => {
    const section = '- active_task: none\n- active_task: F1-T2\n';
    expect(parsePreferredStatusValue(section, 'active_task')).toBe('F1-T2');
  });

  test('parsePreferredStatusValue falls back to the last value when every value is "none"', () => {
    const section = '- active_task: none\n- active_task: none\n';
    expect(parsePreferredStatusValue(section, 'active_task')).toBe('none');
  });

  test('extractTaskIdHint finds a task-id-shaped token in freeform text', () => {
    expect(extractTaskIdHint('see task F002-T07 for details')).toBe('F002-T07');
    expect(extractTaskIdHint('see task F002-T07-U1 for details')).toBe('F002-T07-U1');
    expect(extractTaskIdHint('no task id here')).toBeNull();
    expect(extractTaskIdHint(null)).toBeNull();
  });

  test('slugify lowercases, hyphenates, and trims', () => {
    expect(slugify('  Restrict Enabled Role Wiring!! ')).toBe('restrict-enabled-role-wiring');
  });

  test('stripTicks removes only leading/trailing backticks', () => {
    expect(stripTicks('`F002-T07`')).toBe('F002-T07');
    expect(stripTicks('no ticks')).toBe('no ticks');
  });

  test('escapeRegExp escapes regex metacharacters', () => {
    const pattern = new RegExp(escapeRegExp('a.b*c'));
    expect(pattern.test('a.b*c')).toBe(true);
    expect(pattern.test('axbyc')).toBe(false);
  });
});

/**
 * An empty section used to swallow the one below it.
 *
 * The header pattern was `^## Heading\n+`, and the greedy `\n+` ran past the blank line into the
 * newline that opens the next heading. `bodyStart` landed inside that heading, `indexOf('\n## ')`
 * skipped it, and the empty section measured as containing the next section's whole body -- which
 * `replaceSection` then overwrote. The document stayed well-formed the entire time, with one
 * section's content filed under another's heading.
 *
 * Found by seeding `compassrose setup`'s `## Implemented` empty, which is what a project that has
 * implemented nothing yet honestly has.
 */
describe('empty sections', () => {
  const document = [
    '# State: X',
    '',
    '## Current Reality',
    '',
    '- a',
    '',
    '## Implemented',
    '',
    '## Pending',
    '',
    '- b',
    '',
  ].join('\n');

  test('an empty section reads as empty, not as the next section', () => {
    expect(optionalSection(document, 'Implemented')).toBe('');
    expect(optionalSection(document, 'Pending')).toBe('- b');
  });

  test('an empty section at the end of the document reads as empty', () => {
    expect(optionalSection('# X\n\n## Only\n', 'Only')).toBe('');
  });

  test('writing into an empty section leaves its neighbours alone', () => {
    const updated = upsertBulletInSection(document, 'Implemented', '- Feature `001`', '- Feature `001` is complete.');

    expect(optionalSection(updated, 'Implemented')).toBe('- Feature `001` is complete.');
    expect(optionalSection(updated, 'Pending')).toBe('- b');
    expect(optionalSection(updated, 'Current Reality')).toBe('- a');
  });

  test('emptying a section does not merge it into the next one', () => {
    const emptied = replaceSection(document, 'Pending', '');

    expect(optionalSection(emptied, 'Pending')).toBe('');
    expect(emptied).toContain('## Pending');
    expect(optionalSection(emptied, 'Implemented')).toBe('');
  });

  test('a heading with trailing whitespace is still the same heading', () => {
    expect(optionalSection('# X\n\n## Implemented   \n\n- a\n', 'Implemented')).toBe('- a');
  });
});
