import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import {
  buildManifest,
  manifestEntry,
  manifestFitsBudget,
  measureManifest,
  mergeExploration,
  normalizeManifestPath,
  readEntry,
  renderManifestForPrompt,
} from '../src/orchestrator/contextManifest.js';

// 027-bounded-work-item-context. The property under test throughout: what an agent sees is declared
// and measurable, and a manifest can only grow through a recorded, demonstrated need.

function workspace(files: Record<string, string> = {}): { root: string; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'compassrose-manifest-'));
  for (const [path, contents] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(join(absolute, '..'), { recursive: true });
    writeFileSync(absolute, contents, 'utf8');
  }
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

describe('manifest entries', () => {
  test('paths are normalized at the boundary, every time', () => {
    // This codebase has already been bitten once by a Windows separator reaching a comparison that
    // assumed POSIX; a manifest is a new comparison surface and takes the normalization here.
    expect(normalizeManifestPath('src\\orchestrator\\orchestrator.ts')).toBe('src/orchestrator/orchestrator.ts');
    expect(manifestEntry('code', 'src\\a\\b.ts', 'why').path).toBe('src/a/b.ts');
  });

  test('every entry carries the reason it is there', () => {
    // An entry nobody can justify is an entry that got in by habit; this field is what keeps a
    // manifest from growing into "include all of src/".
    const entry = manifestEntry('code', 'src/a.ts', 'the task names it');
    expect(entry.reason).toBe('the task names it');
  });
});

describe('reading and measuring', () => {
  test('a line range reads exactly those lines, inclusive and 1-based', () => {
    const space = workspace({ 'src/a.ts': 'one\ntwo\nthree\nfour\n' });

    try {
      expect(readEntry(space.root, manifestEntry('code', 'src/a.ts', 'x', [2, 3]))).toBe('two\nthree');
    } finally {
      space.dispose();
    }
  });

  test('a whole-file entry reads the whole file', () => {
    const space = workspace({ 'src/a.ts': 'one\ntwo\n' });

    try {
      expect(readEntry(space.root, manifestEntry('code', 'src/a.ts', 'x'))).toBe('one\ntwo\n');
    } finally {
      space.dispose();
    }
  });

  test('a missing file reads as empty rather than throwing', () => {
    const space = workspace();

    try {
      // A manifest naming something absent is a planning defect worth surfacing through the budget
      // check and the assembled prompt, not a crash three layers down.
      expect(readEntry(space.root, manifestEntry('code', 'src/gone.ts', 'x'))).toBe('');
    } finally {
      space.dispose();
    }
  });

  test('size is measured over the assembled content, not the entry list', () => {
    const space = workspace({ 'src/a.ts': 'abcde', 'src/b.ts': 'fgh' });

    try {
      const size = measureManifest(space.root, [
        manifestEntry('code', 'src/a.ts', 'x'),
        manifestEntry('code', 'src/b.ts', 'y'),
      ]);
      expect(size).toBe(8);
    } finally {
      space.dispose();
    }
  });

  test('the same repository state produces the same manifest size', () => {
    const space = workspace({ 'src/a.ts': 'abcde' });

    try {
      const entries = [manifestEntry('code', 'src/a.ts', 'x')];
      expect(measureManifest(space.root, entries)).toBe(measureManifest(space.root, entries));
    } finally {
      space.dispose();
    }
  });
});

describe('the budget', () => {
  test('a manifest within budget fits', () => {
    const space = workspace({ 'src/a.ts': 'abcde' });

    try {
      const manifest = buildManifest({
        repositoryRoot: space.root,
        taskId: 'F001-T01',
        role: 'implementer',
        entries: [manifestEntry('code', 'src/a.ts', 'x')],
        budget: 10,
      });

      expect(manifest.measuredSize).toBe(5);
      expect(manifestFitsBudget(manifest)).toBe(true);
    } finally {
      space.dispose();
    }
  });

  test('a manifest over budget does not fit', () => {
    const space = workspace({ 'src/a.ts': 'abcdefghijk' });

    try {
      const manifest = buildManifest({
        repositoryRoot: space.root,
        taskId: 'F001-T01',
        role: 'implementer',
        entries: [manifestEntry('code', 'src/a.ts', 'x')],
        budget: 5,
      });

      expect(manifestFitsBudget(manifest)).toBe(false);
    } finally {
      space.dispose();
    }
  });

  test('a budget of zero means unbounded, so a config predating the field is unaffected', () => {
    const space = workspace({ 'src/a.ts': 'x'.repeat(10_000) });

    try {
      const manifest = buildManifest({
        repositoryRoot: space.root,
        taskId: 'F001-T01',
        role: 'implementer',
        entries: [manifestEntry('code', 'src/a.ts', 'x')],
        budget: 0,
      });

      expect(manifestFitsBudget(manifest)).toBe(true);
    } finally {
      space.dispose();
    }
  });
});

describe('exploration only ever grows a manifest, and only from demonstrated need', () => {
  test('files read beyond the manifest are added for the next attempt', () => {
    const merged = mergeExploration([manifestEntry('code', 'src/a.ts', 'declared')], {
      taskId: 'F001-T01',
      paths: ['src/b.ts'],
      recordedAt: '2026-08-22',
    });

    expect(merged.map((entry) => entry.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(merged[1]!.reason).toContain('previous attempt at F001-T01');
  });

  test('a file already in the manifest is not added twice', () => {
    const merged = mergeExploration([manifestEntry('code', 'src/a.ts', 'declared')], {
      taskId: 'F001-T01',
      paths: ['src/a.ts'],
      recordedAt: '2026-08-22',
    });

    expect(merged).toHaveLength(1);
  });

  test('exploration paths are normalized like every other entry', () => {
    const merged = mergeExploration([], {
      taskId: 'F001-T01',
      paths: ['src\\b.ts'],
      recordedAt: '2026-08-22',
    });

    expect(merged[0]!.path).toBe('src/b.ts');
  });

  test('no exploration record leaves the manifest exactly as declared', () => {
    const entries = [manifestEntry('code', 'src/a.ts', 'declared')];
    expect(mergeExploration(entries, null)).toEqual(entries);
  });
});

describe('rendering', () => {
  test('the prompt block names every entry with its reason, and a line range when it has one', () => {
    const space = workspace({ 'src/a.ts': 'x', 'src/b.ts': 'y' });

    try {
      const manifest = buildManifest({
        repositoryRoot: space.root,
        taskId: 'F001-T01',
        role: 'implementer',
        entries: [
          manifestEntry('code', 'src/a.ts', 'the task names it'),
          manifestEntry('code', 'src/b.ts', 'read during a previous attempt', [10, 40]),
        ],
        budget: 0,
      });

      expect(renderManifestForPrompt(manifest)).toEqual([
        '- `src/a.ts` — the task names it',
        '- `src/b.ts` (lines 10-40) — read during a previous attempt',
      ]);
    } finally {
      space.dispose();
    }
  });
});
