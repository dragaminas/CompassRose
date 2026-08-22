import { describe, expect, test } from 'vitest';
import {
  buildCoverageReport,
  decideDimension,
  markCovered,
  parseDimensionsDocument,
  renderDimensionsDocument,
  STARTER_DIMENSIONS,
  type Dimension,
} from '../src/state/dimensions.js';
import {
  COMPETENCY_AXES,
  DEFAULT_COMPETENCY_PROFILE,
  describeProfileForPrompt,
  ownsAxis,
} from '../src/contracts/brainstormer/competency.js';

// 024-specification-flow. Two properties carry this feature and are what these tests pin:
//
//   - the agent may only ever *grow* the declared checklist, and only through a human decision
//   - decisions about the project are inherited and reopenable; facts about a person never are

function dimension(name: string, state: Dimension['state'], decisions: Dimension['decisions'] = []): Dimension {
  return { name, state, coveredBy: [], decisions };
}

describe('a dimension can only leave the checklist through a human decision with a reason', () => {
  test('discarding without a reason is refused', () => {
    expect(() =>
      decideDimension([dimension('security', 'uncovered')], 'security', {
        state: 'out_of_scope',
        reason: null,
        by: 'eric',
        at: '2026-08-22',
      }),
    ).toThrow(/requires a reason/);
  });

  test('an empty reason counts as no reason', () => {
    expect(() =>
      decideDimension([dimension('security', 'uncovered')], 'security', {
        state: 'out_of_scope',
        reason: '   ',
        by: 'eric',
        at: '2026-08-22',
      }),
    ).toThrow(/requires a reason/);
  });

  test('a discard with a reason is recorded with its author and date', () => {
    const updated = decideDimension([dimension('security', 'uncovered')], 'security', {
      state: 'out_of_scope',
      reason: 'local single-user tool with no network surface',
      by: 'eric',
      at: '2026-08-22',
    });

    expect(updated[0]!.state).toBe('out_of_scope');
    expect(updated[0]!.decisions).toHaveLength(1);
    expect(updated[0]!.decisions[0]!.reason).toContain('single-user');
    expect(updated[0]!.decisions[0]!.by).toBe('eric');
  });
});

describe('decisions accumulate rather than overwrite', () => {
  test('reopening keeps the earlier decision visible with its original author', () => {
    let dimensions = decideDimension([dimension('security', 'uncovered')], 'security', {
      state: 'out_of_scope',
      reason: 'local single-user tool',
      by: 'eric',
      at: '2026-08-22',
    });

    dimensions = decideDimension(dimensions, 'security', {
      state: 'uncovered',
      reason: 'reopened by dana',
      by: 'dana',
      at: '2026-09-01',
    });

    // This is what makes it safe for a second person to disagree with the first: the disagreement
    // is recorded, not the erasure.
    expect(dimensions[0]!.state).toBe('uncovered');
    expect(dimensions[0]!.decisions).toHaveLength(2);
    expect(dimensions[0]!.decisions[0]!.by).toBe('eric');
    expect(dimensions[0]!.decisions[1]!.by).toBe('dana');
  });

  test('an agent-proposed dimension only enters the list through a decision', () => {
    const dimensions = decideDimension([], 'recovery after interruption', {
      state: 'uncovered',
      reason: 'accepted from a proposal',
      by: 'eric',
      at: '2026-08-22',
    });

    expect(dimensions.map((entry) => entry.name)).toEqual(['recovery after interruption']);
  });
});

describe('coverage', () => {
  test('a dimension can be covered by several features, and the same one is not recorded twice', () => {
    let dimensions = markCovered([dimension('user interface', 'uncovered')], 'user interface', '023', 'eric');
    dimensions = markCovered(dimensions, 'user interface', '024', 'eric');
    const unchanged = markCovered(dimensions, 'user interface', '024', 'eric');

    expect(dimensions[0]!.coveredBy).toEqual(['023', '024']);
    expect(unchanged[0]!.coveredBy).toEqual(['023', '024']);
  });

  test('uncovered and out-of-scope are reported separately', () => {
    const report = buildCoverageReport([
      { name: 'ui', state: 'covered', coveredBy: ['023'], decisions: [] },
      dimension('deployment', 'uncovered'),
      dimension('security', 'out_of_scope', [
        { state: 'out_of_scope', reason: 'no network surface', by: 'eric', at: '2026-08-22' },
      ]),
    ]);

    // Collapsing these two is exactly how a gap becomes invisible: "nothing covers this yet" and
    // "we decided this does not apply" are different facts.
    expect(report.uncovered).toEqual(['deployment']);
    expect(report.outOfScope).toEqual([{ name: 'security', reason: 'no network surface' }]);
    expect(report.covered).toEqual([{ name: 'ui', coveredBy: ['023'] }]);
  });

  test('the reason reported for an out-of-scope dimension is the most recent one', () => {
    const report = buildCoverageReport([
      dimension('security', 'out_of_scope', [
        { state: 'out_of_scope', reason: 'first reason', by: 'eric', at: '2026-01-01' },
        { state: 'uncovered', reason: 'reopened', by: 'dana', at: '2026-02-01' },
        { state: 'out_of_scope', reason: 'second reason', by: 'dana', at: '2026-03-01' },
      ]),
    ]);

    expect(report.outOfScope[0]!.reason).toBe('second reason');
  });
});

describe('the document survives a round trip', () => {
  test('render then parse returns the same dimensions', () => {
    const original: Dimension[] = [
      { name: 'user interface', state: 'covered', coveredBy: ['023', '024'], decisions: [] },
      dimension('security', 'out_of_scope', [
        { state: 'out_of_scope', reason: 'local single-user tool', by: 'eric', at: '2026-08-22' },
      ]),
      dimension('deployment', 'uncovered'),
    ];

    const parsed = parseDimensionsDocument(renderDimensionsDocument(original));

    expect(parsed.map((entry) => entry.name)).toEqual(['user interface', 'security', 'deployment']);
    expect(parsed[0]!.coveredBy).toEqual(['023', '024']);
    expect(parsed[1]!.state).toBe('out_of_scope');
    expect(parsed[1]!.decisions[0]!.reason).toBe('local single-user tool');
    expect(parsed[2]!.state).toBe('uncovered');
  });

  test('the starter list is a floor a session can walk from day one', () => {
    expect(STARTER_DIMENSIONS.length).toBeGreaterThan(5);
    expect(STARTER_DIMENSIONS).toContain('errors and failure handling');
  });
});

describe('the competency profile is about the person, never the project', () => {
  test('it covers three axes and defaults to the human owning product and architecture', () => {
    expect(COMPETENCY_AXES).toEqual(['product', 'architecture', 'implementation']);
    expect(ownsAxis(DEFAULT_COMPETENCY_PROFILE, 'product')).toBe(true);
    expect(ownsAxis(DEFAULT_COMPETENCY_PROFILE, 'architecture')).toBe(true);
    expect(ownsAxis(DEFAULT_COMPETENCY_PROFILE, 'implementation')).toBe(false);
  });

  test('it selects agent behavior, not specification content', () => {
    const described = describeProfileForPrompt({ product: 'human', architecture: 'agent', implementation: 'agent' }).join('\n');

    expect(described).toContain('product: the human decides');
    expect(described).toContain('architecture: you decide');
    // On an axis the human owns, the agent must surface a decision rather than make one.
    expect(described).toContain('Surface a structured decision');
    expect(described).toContain('Do not ask');
  });
});
