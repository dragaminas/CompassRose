import { describe, expect, test } from 'vitest';
import { MAX_EXPLORATION_PATHS, parseImplementerReport } from '../src/orchestrator/implementerReport.js';

// 027-bounded-work-item-context: a manifest is a declared floor an implementer may read past, but
// until it says what it read, the floor can never learn -- the merge that carries exploration into
// the next attempt existed, tested, with nothing feeding it. And a task that must not be handed a
// history of prior tasks has nothing to carry forward unless each one states what the next needs.

function notes(...lines: readonly string[]): string {
  return ['## Implementation Notes', '', ...lines, ''].join('\n');
}

describe('reading the implementer report', () => {
  test('reads both fields out of the implementation notes', () => {
    const report = parseImplementerReport(notes(
      'Added the widget.',
      'Read beyond manifest: src/widget/registry.ts, src/widget/index.ts',
      'Next task needs to know: the registry is keyed by slug, not by id.',
    ));

    expect(report.readBeyondManifest).toEqual(['src/widget/registry.ts', 'src/widget/index.ts']);
    expect(report.handOff).toBe('the registry is keyed by slug, not by id.');
    expect(report.explorationCapped).toBe(false);
  });

  test('treats silence as nothing to report rather than as a failure', () => {
    // A self-contained task that read nothing extra and leaves nothing behind is a legitimate
    // outcome. The contract asks for both lines; enforcement, if it belongs anywhere, is review's.
    const report = parseImplementerReport(notes('Added the widget. Nothing else to say.'));

    expect(report.readBeyondManifest).toEqual([]);
    expect(report.handOff).toBeNull();
  });

  test('reads "none" as an answer, not as a path', () => {
    const report = parseImplementerReport(notes(
      'Read beyond manifest: none',
      'Next task needs to know: none',
    ));

    expect(report.readBeyondManifest).toEqual([]);
    expect(report.handOff).toBeNull();
  });

  test('tolerates the shapes an implementer actually writes', () => {
    const report = parseImplementerReport(notes(
      '- Read beyond manifest: `src/a.ts`; "src/b.ts"',
      '* next_task_needs_to_know: watch the ordering in src/b.ts',
    ));

    expect(report.readBeyondManifest).toEqual(['src/a.ts', 'src/b.ts']);
    expect(report.handOff).toBe('watch the ordering in src/b.ts');
  });

  test('normalizes Windows separators, because these paths become manifest entries', () => {
    const report = parseImplementerReport(notes('Read beyond manifest: src\\widget\\registry.ts'));

    expect(report.readBeyondManifest).toEqual(['src/widget/registry.ts']);
  });

  test('deduplicates rather than letting one file enter the next manifest twice', () => {
    const report = parseImplementerReport(notes(
      'Read beyond manifest: src/a.ts, src/a.ts',
      'Read beyond manifest: src/a.ts',
    ));

    expect(report.readBeyondManifest).toEqual(['src/a.ts']);
  });

  test('caps exploration, and says that it did', () => {
    // Every path reported here lands in the next attempt's manifest, so an uncapped report is an
    // uncapped manifest one attempt later.
    const many = Array.from({ length: MAX_EXPLORATION_PATHS + 4 }, (_, index) => `src/file-${index}.ts`);
    const report = parseImplementerReport(notes(`Read beyond manifest: ${many.join(', ')}`));

    expect(report.readBeyondManifest).toHaveLength(MAX_EXPLORATION_PATHS);
    expect(report.explorationCapped).toBe(true);
  });

  test('keeps a hand-off that mentions a colon', () => {
    const report = parseImplementerReport(notes(
      'Next task needs to know: the config key is limits: max_ai_calls_per_run',
    ));

    expect(report.handOff).toBe('the config key is limits: max_ai_calls_per_run');
  });
});
