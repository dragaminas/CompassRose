import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import {
  confirmFact,
  describeFactsForPrompt,
  mergeDetectedFacts,
  parseProjectFactsDocument,
  renderProjectFactsDocument,
  EMPTY_PROJECT_FACTS,
} from '../src/project/projectFacts.js';
import { copyContractsIntoWorkspace, readFixtureConfigMarkdown } from './testUtils.js';
import type { ProjectInference } from '../src/contracts/project/projectInference.js';

// 028-project-understanding: detection reads facts. Two things it can never read, because nothing
// declares them -- what the project is for, and which of its declared scripts are actually gates.
// Both are inferred, and everything inferred enters below both `detected` and `confirmed`, which is
// the whole safety property: a wrong guess is a visibly-marked wrong guess, never a corrupted fact.

interface Workspace {
  readonly root: string;
  readonly factsPath: string;
  readonly dispose: () => void;
}

function writeInferenceMock(root: string, inference: ProjectInference): string {
  const path = join(root, 'codex-mock-inference.cjs');
  writeFileSync(
    path,
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
const outputPath = outputIndex === -1 ? null : args[outputIndex + 1];
if (outputPath) {
  fs.writeFileSync(outputPath, ${JSON.stringify(`${JSON.stringify(inference, null, 2)}\n`)}, 'utf8');
}
process.exit(0);
`,
    'utf8',
  );
  chmodSync(path, 0o755);
  return path;
}

function createWorkspace(): Workspace {
  const root = mkdtempSync(join(tmpdir(), 'compassrose-inference-'));
  mkdirSync(join(root, 'compassrose'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });

  writeFileSync(join(root, 'compassrose', 'CONFIG.md'), readFixtureConfigMarkdown(), 'utf8');
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify(
      {
        name: 'fixture-project',
        scripts: { build: 'tsc', test: 'vitest run', start: 'node dist/main.js' },
        devDependencies: { typescript: '^5.0.0' },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  writeFileSync(join(root, 'README.md'), '# Fixture Project\n\nIt does a thing.\n', 'utf8');
  writeFileSync(join(root, 'src', 'main.ts'), 'export const main = 1;\n', 'utf8');
  copyContractsIntoWorkspace(root);

  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '--quiet', '-m', 'initial commit'], { cwd: root });

  return {
    root,
    factsPath: join(root, 'compassrose', 'PROJECT_FACTS.md'),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe('describing what is already known to an inference call', () => {
  test('carries provenance with each fact', () => {
    // An inference that knows the package manager was *read from a file* treats it differently
    // from one that knows it was itself guessed last week.
    const lines = describeFactsForPrompt({
      ...EMPTY_PROJECT_FACTS,
      packageManager: { value: 'npm', provenance: { kind: 'detected', signal: 'package-lock.json' } },
      purpose: { value: 'an old guess', provenance: { kind: 'inferred', at: '2026-01-01' } },
    });

    expect(lines).toContain('- packageManager: npm (detected)');
    expect(lines).toContain('- purpose: an old guess (inferred)');
  });

  test('says so when nothing has been detected yet', () => {
    expect(describeFactsForPrompt(EMPTY_PROJECT_FACTS)).toEqual(['- nothing has been detected yet']);
  });
});

describe('inferring what the repository does not state', () => {
  let workspace: Workspace | null = null;

  afterEach(() => {
    workspace?.dispose();
    workspace = null;
    vi.unstubAllEnvs();
  });

  function buildOrchestrator(): CompassRoseOrchestrator {
    return new CompassRoseOrchestrator({
      loop: false,
      commit: false,
      cwd: (workspace as Workspace).root,
      implementer: 'opencode',
    });
  }

  test('records an inferred purpose as inferred, never as detected', () => {
    workspace = createWorkspace();
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', writeInferenceMock(workspace.root, {
      purpose: 'It does a thing, on a schedule.',
      gate_commands: ['build', 'test'],
      start_command: 'start',
    }));

    const { inference } = buildOrchestrator().inferProjectGaps();

    expect(inference.start_command).toBe('start');
    const facts = readFileSync(workspace.factsPath, 'utf8');
    expect(facts).toContain('It does a thing, on a schedule.');
    expect(facts).toContain('inferred');
    expect(facts).toContain('confirm or correct this');
  });

  test('leaves the gate and start commands out of the facts document', () => {
    // They are proposals for configuration, not facts about the repository. Writing them here
    // would blur "what this project is" with "how we have decided to work on it".
    workspace = createWorkspace();
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', writeInferenceMock(workspace.root, {
      purpose: null,
      gate_commands: ['build', 'test'],
      start_command: 'start',
    }));

    buildOrchestrator().inferProjectGaps();

    const facts = readFileSync(workspace.factsPath, 'utf8');
    expect(facts).not.toContain('gate_commands');
    expect(facts).not.toContain('start_command');
  });

  test('never overwrites a purpose a human confirmed', () => {
    // This is the safety property the whole provenance model exists for.
    workspace = createWorkspace();
    const orchestrator = buildOrchestrator();
    orchestrator.refreshProjectFacts();
    writeFileSync(
      workspace.factsPath,
      renderProjectFactsDocument({
        ...parseProjectFactsDocument(readFileSync(workspace.factsPath, 'utf8')),
        purpose: { value: 'What a person said it is for.', provenance: { kind: 'confirmed', by: 'Test', at: '2026-08-01' } },
      }),
      'utf8',
    );

    vi.stubEnv('PROTO_COMPASSROSE_CODEX_COMMAND', writeInferenceMock(workspace.root, {
      purpose: 'What a machine guessed it is for.',
      gate_commands: [],
      start_command: null,
    }));

    buildOrchestrator().inferProjectGaps();

    const facts = readFileSync(workspace.factsPath, 'utf8');
    expect(facts).toContain('What a person said it is for.');
    expect(facts).not.toContain('What a machine guessed it is for.');
  });
});

describe('confirming a fact', () => {
  let workspace: Workspace | null = null;

  afterEach(() => {
    workspace?.dispose();
    workspace = null;
  });

  test('raises provenance, and a later detection can no longer overwrite it', () => {
    const detected = { value: 'npm', provenance: { kind: 'detected' as const, signal: 'package-lock.json' } };
    const confirmed = confirmFact(detected, 'Test');

    expect(confirmed?.provenance.kind).toBe('confirmed');

    const { facts, contradictions } = mergeDetectedFacts(
      { ...EMPTY_PROJECT_FACTS, packageManager: confirmed },
      { ...EMPTY_PROJECT_FACTS, packageManager: { value: 'pnpm', provenance: { kind: 'detected', signal: 'pnpm-lock.yaml' } } },
    );

    expect(facts.packageManager?.value).toBe('npm');
    expect(contradictions).toHaveLength(1);
  });

  test('offers everything nobody has vouched for, detected facts included', () => {
    // Detection can be wrong about a repository with two package managers or a vestigial config,
    // and only a person can say which one is real.
    workspace = createWorkspace();
    const orchestrator = new CompassRoseOrchestrator({
      loop: false,
      commit: false,
      cwd: workspace.root,
      implementer: 'opencode',
    });
    orchestrator.refreshProjectFacts();

    const unconfirmed = orchestrator.unconfirmedProjectFacts();
    expect(unconfirmed.length).toBeGreaterThan(0);
    expect(unconfirmed.every((entry) => entry.kind !== 'confirmed')).toBe(true);

    orchestrator.confirmProjectFact(unconfirmed[0]!.field, 'Test');

    expect(orchestrator.unconfirmedProjectFacts()).toHaveLength(unconfirmed.length - 1);
  });

  test('refuses to confirm something nothing has ever recorded', () => {
    // Confirming an absent fact would invent one rather than promote one.
    workspace = createWorkspace();
    const orchestrator = new CompassRoseOrchestrator({
      loop: false,
      commit: false,
      cwd: workspace.root,
      implementer: 'opencode',
    });
    orchestrator.refreshProjectFacts();

    expect(() => orchestrator.confirmProjectFact('purpose', 'Test')).toThrow(/nothing to confirm/);
  });
});
