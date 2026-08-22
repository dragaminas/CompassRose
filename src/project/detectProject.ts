/**
 * Reading a repository's facts from its own signals (028-project-understanding).
 *
 * A table of signals, not a chain of heuristics: each row is a pure function from one file's
 * contents to facts, independently testable with a fixture, and nothing here calls an AI. Adding
 * language support means adding a row.
 *
 * The boundary this module holds is what makes the whole feature honest: everything establishable
 * by reading is established here, so inference is left the narrow set of things no file states.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { ProjectFact, ProjectFacts } from './projectFacts.js';

interface DetectedSignal {
  readonly languages?: readonly string[] | undefined;
  readonly packageManager?: string | undefined;
  readonly buildSystem?: string | undefined;
  readonly testSystem?: string | undefined;
  readonly sourceRoots?: readonly string[] | undefined;
  readonly scripts?: readonly string[] | undefined;
}

interface SignalRow {
  readonly file: string;
  readonly read: (contents: string) => DetectedSignal;
}

function parseJsonSafely(contents: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(contents);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    // A malformed manifest is the project's own problem to fix; it must not stop detection of
    // everything else.
    return null;
  }
}

/**
 * Which of a Node project's scripts looks like a test runner, read from what the script actually
 * invokes rather than from its name -- `npm test` is a convention, `vitest` is evidence.
 */
function detectTestSystem(scripts: Record<string, unknown>): string | undefined {
  const values = Object.values(scripts).filter((value): value is string => typeof value === 'string').join(' ');
  for (const runner of ['vitest', 'jest', 'mocha', 'ava', 'node --test', 'playwright', 'cypress']) {
    if (values.includes(runner)) {
      return runner;
    }
  }
  return typeof scripts.test === 'string' ? 'npm test' : undefined;
}

const SIGNAL_ROWS: readonly SignalRow[] = [
  {
    file: 'package.json',
    read: (contents) => {
      const parsed = parseJsonSafely(contents);
      if (!parsed) {
        return {};
      }

      const scripts = (parsed.scripts && typeof parsed.scripts === 'object' ? parsed.scripts : {}) as Record<string, unknown>;
      return {
        languages: ['JavaScript'],
        buildSystem: typeof scripts.build === 'string' ? 'npm run build' : undefined,
        testSystem: detectTestSystem(scripts),
        scripts: Object.keys(scripts),
      };
    },
  },
  { file: 'package-lock.json', read: () => ({ packageManager: 'npm' }) },
  { file: 'yarn.lock', read: () => ({ packageManager: 'yarn' }) },
  { file: 'pnpm-lock.yaml', read: () => ({ packageManager: 'pnpm' }) },
  {
    file: 'tsconfig.json',
    read: (contents) => {
      // Deliberately not JSON.parse: tsconfig files legitimately carry comments, and a regex for
      // the one field wanted is more robust here than a JSON5 dependency this project will not add.
      const rootDir = contents.match(/"rootDir"\s*:\s*"([^"]+)"/)?.[1];
      return { languages: ['TypeScript'], sourceRoots: rootDir ? [rootDir] : undefined };
    },
  },
  { file: 'pyproject.toml', read: () => ({ languages: ['Python'], packageManager: 'pip' }) },
  { file: 'requirements.txt', read: () => ({ languages: ['Python'], packageManager: 'pip' }) },
  { file: 'setup.py', read: () => ({ languages: ['Python'], packageManager: 'pip' }) },
  { file: 'go.mod', read: () => ({ languages: ['Go'], packageManager: 'go modules', buildSystem: 'go build', testSystem: 'go test' }) },
  { file: 'Cargo.toml', read: () => ({ languages: ['Rust'], packageManager: 'cargo', buildSystem: 'cargo build', testSystem: 'cargo test' }) },
  { file: 'pom.xml', read: () => ({ languages: ['Java'], packageManager: 'maven', buildSystem: 'mvn package', testSystem: 'mvn test' }) },
  { file: 'build.gradle', read: () => ({ languages: ['Java'], packageManager: 'gradle', buildSystem: 'gradle build', testSystem: 'gradle test' }) },
  { file: 'Gemfile', read: () => ({ languages: ['Ruby'], packageManager: 'bundler' }) },
  { file: 'composer.json', read: () => ({ languages: ['PHP'], packageManager: 'composer' }) },
];

const CONVENTIONAL_SOURCE_ROOTS = ['src', 'lib', 'app'] as const;
const CONVENTIONAL_DOCUMENTATION_ROOTS = ['docs', 'doc', 'documentation'] as const;

function detectedFact<T>(value: T, signal: string): ProjectFact<T> {
  return { value, provenance: { kind: 'detected', signal } };
}

function existingDirectories(repositoryRoot: string, candidates: readonly string[]): string[] {
  return candidates.filter((name) => {
    const path = join(repositoryRoot, name);
    return existsSync(path) && statSync(path).isDirectory();
  });
}

export interface SignalFingerprint {
  readonly file: string;
  readonly hash: string;
}

/**
 * Facts read directly from the repository, plus the fingerprints of the files they came from.
 *
 * Makes no network call, no AI call, and no write. Works on a repository with no CompassRose
 * documents at all -- which is the point: it has to work on first contact.
 */
export function detectProjectFacts(repositoryRoot: string): {
  readonly facts: ProjectFacts;
  readonly fingerprints: readonly SignalFingerprint[];
} {
  const languages = new Set<string>();
  const scripts = new Set<string>();
  const sourceRoots = new Set<string>();
  const fingerprints: SignalFingerprint[] = [];

  let packageManager: ProjectFact<string> | null = null;
  let buildSystem: ProjectFact<string> | null = null;
  let testSystem: ProjectFact<string> | null = null;
  let languageSignal = '';
  let scriptSignal = '';
  let sourceRootSignal = '';

  for (const row of SIGNAL_ROWS) {
    const path = join(repositoryRoot, row.file);
    if (!existsSync(path) || !statSync(path).isFile()) {
      continue;
    }

    const contents = readFileSync(path, 'utf8');
    fingerprints.push({ file: row.file, hash: createHash('sha256').update(contents).digest('hex').slice(0, 16) });

    const signal = row.read(contents);
    for (const language of signal.languages ?? []) {
      languages.add(language);
      languageSignal = languageSignal.length > 0 ? `${languageSignal}, ${row.file}` : row.file;
    }
    for (const script of signal.scripts ?? []) {
      scripts.add(script);
      scriptSignal = row.file;
    }
    for (const root of signal.sourceRoots ?? []) {
      sourceRoots.add(root);
      sourceRootSignal = row.file;
    }

    if (signal.packageManager && !packageManager) {
      packageManager = detectedFact(signal.packageManager, row.file);
    }
    if (signal.buildSystem && !buildSystem) {
      buildSystem = detectedFact(signal.buildSystem, row.file);
    }
    if (signal.testSystem && !testSystem) {
      testSystem = detectedFact(signal.testSystem, row.file);
    }
  }

  // Directory conventions rank below a manifest that declares the same thing: a `rootDir` in
  // tsconfig is a statement, `src/` merely existing is a habit.
  const conventionalSources = existingDirectories(repositoryRoot, CONVENTIONAL_SOURCE_ROOTS);
  const resolvedSourceRoots = sourceRoots.size > 0 ? [...sourceRoots] : conventionalSources;
  const documentationRoots = existingDirectories(repositoryRoot, CONVENTIONAL_DOCUMENTATION_ROOTS);

  return {
    facts: {
      languages: languages.size > 0 ? detectedFact([...languages], languageSignal) : null,
      packageManager,
      buildSystem,
      testSystem,
      sourceRoots: resolvedSourceRoots.length > 0
        ? detectedFact(resolvedSourceRoots, sourceRoots.size > 0 ? sourceRootSignal : 'conventional directory layout')
        : null,
      documentationRoots: documentationRoots.length > 0
        ? detectedFact(documentationRoots, 'conventional directory layout')
        : null,
      scripts: scripts.size > 0 ? detectedFact([...scripts], scriptSignal) : null,
      // No file states what a project is for, so this is left for inference or a human.
      purpose: null,
    },
    fingerprints,
  };
}

export function signalsChanged(
  previous: readonly SignalFingerprint[],
  current: readonly SignalFingerprint[],
): readonly string[] {
  const previousByFile = new Map(previous.map((entry) => [entry.file, entry.hash]));
  const currentByFile = new Map(current.map((entry) => [entry.file, entry.hash]));
  const changed: string[] = [];

  for (const [file, hash] of currentByFile) {
    if (previousByFile.get(file) !== hash) {
      changed.push(file);
    }
  }
  for (const file of previousByFile.keys()) {
    if (!currentByFile.has(file)) {
      changed.push(file);
    }
  }

  return changed;
}

/**
 * Quality-gate candidates derived from declared scripts.
 *
 * Proposed, never written: configuration stays human-owned. Which of `test`, `test:unit`, `test:ci`
 * is *the* gate is a judgment, and this only narrows the field.
 */
export function deriveGateCandidates(facts: ProjectFacts): Readonly<Record<string, readonly string[]>> {
  const scripts = facts.scripts?.value ?? [];
  const matching = (patterns: readonly string[]): string[] =>
    scripts.filter((script) => patterns.some((pattern) => script === pattern || script.startsWith(`${pattern}:`)));

  return {
    typecheck: matching(['typecheck', 'tsc', 'check']),
    tests: matching(['test', 'tests', 'spec']),
    lint: matching(['lint', 'eslint']),
    build: matching(['build', 'compile']),
    start: matching(['start', 'serve', 'dev']),
  };
}

export interface InventoryGroup {
  readonly directory: string;
  readonly moduleCount: number;
  readonly entryPoints: readonly string[];
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.go', '.rs', '.java', '.rb', '.php'];
const ENTRY_POINT_NAMES = ['index', 'main', 'app', 'cli', 'server', '__init__'];

/**
 * What exists in the codebase, grouped by directory.
 *
 * Computed on demand, never stored: an inventory of a moving codebase is stale by definition and
 * would become another document nobody trusts.
 *
 * The constraint that distinguishes the accepted design from the rejected one: this is input to a
 * *conversation*, never to a formalizer. There is no code path from here to `feature.md`.
 */
export function buildCodeInventory(repositoryRoot: string, sourceRoots: readonly string[]): InventoryGroup[] {
  const groups = new Map<string, { modules: number; entryPoints: string[] }>();

  const walk = (relativeDirectory: string): void => {
    const absolute = join(repositoryRoot, relativeDirectory);
    if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
      return;
    }

    for (const entry of readdirSync(absolute)) {
      if (entry.startsWith('.') || entry === 'node_modules') {
        continue;
      }

      const childRelative = `${relativeDirectory}/${entry}`;
      if (statSync(join(repositoryRoot, childRelative)).isDirectory()) {
        walk(childRelative);
        continue;
      }

      const extension = entry.slice(entry.lastIndexOf('.'));
      if (!SOURCE_EXTENSIONS.includes(extension)) {
        continue;
      }

      const group = groups.get(relativeDirectory) ?? { modules: 0, entryPoints: [] };
      group.modules += 1;
      if (ENTRY_POINT_NAMES.includes(entry.slice(0, entry.lastIndexOf('.')))) {
        group.entryPoints.push(childRelative);
      }
      groups.set(relativeDirectory, group);
    }
  };

  for (const root of sourceRoots) {
    walk(root);
  }

  return [...groups.entries()]
    .map(([directory, group]) => ({ directory, moduleCount: group.modules, entryPoints: group.entryPoints }))
    .sort((left, right) => right.moduleCount - left.moduleCount);
}
