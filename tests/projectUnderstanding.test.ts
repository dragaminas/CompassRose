import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import {
  buildCodeInventory,
  deriveGateCandidates,
  detectProjectFacts,
  signalsChanged,
} from '../src/project/detectProject.js';
import {
  confirmFact,
  EMPTY_PROJECT_FACTS,
  mergeDetectedFacts,
  parseProjectFactsDocument,
  renderProjectFactsDocument,
} from '../src/project/projectFacts.js';
import type { ProjectFacts } from '../src/project/projectFacts.js';

// 028-project-understanding. The rule the whole feature turns on: confirmed outranks detected
// outranks inferred, and a machine never quietly replaces a human decision with its own guess.

function workspace(files: Record<string, string> = {}, directories: readonly string[] = []): { root: string; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'compassrose-project-'));
  for (const directory of directories) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  for (const [path, contents] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(join(absolute, '..'), { recursive: true });
    writeFileSync(absolute, contents, 'utf8');
  }
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

describe('detection reads facts, and only facts', () => {
  test('a Node project is read from its own manifest and lock file', () => {
    const space = workspace({
      'package.json': JSON.stringify({ scripts: { build: 'tsc', test: 'vitest run', lint: 'eslint .' } }),
      'package-lock.json': '{}',
      'tsconfig.json': '{ "compilerOptions": { "rootDir": "source" } }',
    });

    try {
      const { facts } = detectProjectFacts(space.root);

      expect(facts.languages?.value).toContain('TypeScript');
      expect(facts.packageManager?.value).toBe('npm');
      expect(facts.buildSystem?.value).toBe('npm run build');
      // Read from what the script invokes, not from its name: `npm test` is a convention,
      // `vitest` is evidence.
      expect(facts.testSystem?.value).toBe('vitest');
      expect(facts.scripts?.value).toEqual(['build', 'test', 'lint']);
      expect(facts.sourceRoots?.value).toEqual(['source']);
    } finally {
      space.dispose();
    }
  });

  test('every detected fact names the file it was read from', () => {
    const space = workspace({ 'go.mod': 'module example.com/x\n' });

    try {
      const { facts } = detectProjectFacts(space.root);
      expect(facts.languages?.provenance).toEqual({ kind: 'detected', signal: 'go.mod' });
    } finally {
      space.dispose();
    }
  });

  test('a declared source root outranks a conventional directory', () => {
    const space = workspace(
      { 'tsconfig.json': '{ "compilerOptions": { "rootDir": "source" } }' },
      ['src'],
    );

    try {
      // A `rootDir` in tsconfig is a statement; `src/` merely existing is a habit.
      expect(detectProjectFacts(space.root).facts.sourceRoots?.value).toEqual(['source']);
    } finally {
      space.dispose();
    }
  });

  test('conventional directories are used when nothing declares them', () => {
    const space = workspace({}, ['src', 'docs']);

    try {
      const { facts } = detectProjectFacts(space.root);
      expect(facts.sourceRoots?.value).toEqual(['src']);
      expect(facts.documentationRoots?.value).toEqual(['docs']);
    } finally {
      space.dispose();
    }
  });

  test('purpose is never detected, because no file states it', () => {
    const space = workspace({ 'package.json': '{}' });

    try {
      expect(detectProjectFacts(space.root).facts.purpose).toBeNull();
    } finally {
      space.dispose();
    }
  });

  test('a malformed manifest does not stop everything else being detected', () => {
    const space = workspace({ 'package.json': '{ not json', 'Cargo.toml': '[package]\n' });

    try {
      expect(detectProjectFacts(space.root).facts.languages?.value).toContain('Rust');
    } finally {
      space.dispose();
    }
  });

  test('a repository with no CompassRose documents at all still detects', () => {
    const space = workspace({ 'pyproject.toml': '[project]\n' });

    try {
      const { facts } = detectProjectFacts(space.root);
      expect(facts.languages?.value).toEqual(['Python']);
    } finally {
      space.dispose();
    }
  });
});

describe('a confirmed fact is never overwritten by a later detection', () => {
  const detected: ProjectFacts = {
    ...EMPTY_PROJECT_FACTS,
    packageManager: { value: 'pnpm', provenance: { kind: 'detected', signal: 'pnpm-lock.yaml' } },
  };

  test('the confirmed value stands, and the disagreement is reported', () => {
    const recorded: ProjectFacts = {
      ...EMPTY_PROJECT_FACTS,
      packageManager: { value: 'npm', provenance: { kind: 'confirmed', by: 'eric', at: '2026-08-22' } },
    };

    const { facts, contradictions } = mergeDetectedFacts(recorded, detected);

    expect(facts.packageManager?.value).toBe('npm');
    expect(contradictions).toEqual([
      { field: 'packageManager', confirmedValue: '"npm"', detectedValue: '"pnpm"' },
    ]);
  });

  test('agreement between a confirmation and a detection raises nothing', () => {
    const recorded: ProjectFacts = {
      ...EMPTY_PROJECT_FACTS,
      packageManager: { value: 'pnpm', provenance: { kind: 'confirmed', by: 'eric', at: '2026-08-22' } },
    };

    expect(mergeDetectedFacts(recorded, detected).contradictions).toEqual([]);
  });

  test('a detection does replace an inference, which is only ever a guess', () => {
    const recorded: ProjectFacts = {
      ...EMPTY_PROJECT_FACTS,
      packageManager: { value: 'yarn', provenance: { kind: 'inferred', at: '2026-08-01' } },
    };

    const { facts, contradictions } = mergeDetectedFacts(recorded, detected);

    expect(facts.packageManager?.value).toBe('pnpm');
    expect(contradictions).toEqual([]);
  });

  test('confirming a fact records who did it', () => {
    const confirmed = confirmFact({ value: 'npm', provenance: { kind: 'detected', signal: 'x' } }, 'dana');
    expect(confirmed?.provenance).toMatchObject({ kind: 'confirmed', by: 'dana' });
  });
});

describe('the facts document survives a round trip', () => {
  test('render then parse preserves values and provenance', () => {
    const facts: ProjectFacts = {
      ...EMPTY_PROJECT_FACTS,
      languages: { value: ['TypeScript', 'JavaScript'], provenance: { kind: 'detected', signal: 'tsconfig.json' } },
      packageManager: { value: 'npm', provenance: { kind: 'confirmed', by: 'eric', at: '2026-08-22' } },
      purpose: { value: 'a CLI orchestrator', provenance: { kind: 'inferred', at: '2026-08-22' } },
    };

    const parsed = parseProjectFactsDocument(renderProjectFactsDocument(facts));

    expect(parsed.languages?.value).toEqual(['TypeScript', 'JavaScript']);
    expect(parsed.packageManager?.provenance).toEqual({ kind: 'confirmed', by: 'eric', at: '2026-08-22' });
    expect(parsed.purpose?.value).toBe('a CLI orchestrator');
    expect(parsed.purpose?.provenance.kind).toBe('inferred');
  });

  test('an unestablished fact stays unestablished', () => {
    const parsed = parseProjectFactsDocument(renderProjectFactsDocument(EMPTY_PROJECT_FACTS));
    expect(parsed.languages).toBeNull();
  });
});

describe('signal-change detection', () => {
  test('an unchanged signal reports nothing', () => {
    expect(signalsChanged([{ file: 'package.json', hash: 'a' }], [{ file: 'package.json', hash: 'a' }])).toEqual([]);
  });

  test('a changed, added, or removed signal is reported', () => {
    expect(signalsChanged([{ file: 'package.json', hash: 'a' }], [{ file: 'package.json', hash: 'b' }])).toEqual(['package.json']);
    expect(signalsChanged([], [{ file: 'go.mod', hash: 'a' }])).toEqual(['go.mod']);
    expect(signalsChanged([{ file: 'go.mod', hash: 'a' }], [])).toEqual(['go.mod']);
  });
});

describe('candidates are proposed, never chosen', () => {
  test('declared scripts are narrowed to candidates per gate', () => {
    const facts: ProjectFacts = {
      ...EMPTY_PROJECT_FACTS,
      scripts: {
        value: ['build', 'test', 'test:unit', 'lint', 'start', 'unrelated'],
        provenance: { kind: 'detected', signal: 'package.json' },
      },
    };

    const candidates = deriveGateCandidates(facts);

    // Which of `test` and `test:unit` is *the* gate is a judgment; this only narrows the field.
    expect(candidates.tests).toEqual(['test', 'test:unit']);
    expect(candidates.build).toEqual(['build']);
    expect(candidates.start).toEqual(['start']);
    expect(Object.values(candidates).flat()).not.toContain('unrelated');
  });
});

describe('the code inventory', () => {
  test('groups modules by directory and names entry points', () => {
    const space = workspace({
      'src/cli/main.ts': 'x',
      'src/cli/options.ts': 'x',
      'src/orchestrator/index.ts': 'x',
      'src/README.md': 'not source',
    });

    try {
      const inventory = buildCodeInventory(space.root, ['src']);

      expect(inventory[0]).toEqual({ directory: 'src/cli', moduleCount: 2, entryPoints: ['src/cli/main.ts'] });
      expect(inventory).toContainEqual({
        directory: 'src/orchestrator',
        moduleCount: 1,
        entryPoints: ['src/orchestrator/index.ts'],
      });
    } finally {
      space.dispose();
    }
  });

  test('node_modules and dotted directories are skipped', () => {
    const space = workspace({
      'src/a.ts': 'x',
      'src/node_modules/pkg/index.js': 'x',
      'src/.hidden/b.ts': 'x',
    });

    try {
      expect(buildCodeInventory(space.root, ['src']).map((group) => group.directory)).toEqual(['src']);
    } finally {
      space.dispose();
    }
  });

  test('a source root that does not exist yields nothing rather than throwing', () => {
    const space = workspace();

    try {
      expect(buildCodeInventory(space.root, ['nope'])).toEqual([]);
    } finally {
      space.dispose();
    }
  });
});
