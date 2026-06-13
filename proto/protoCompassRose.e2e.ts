import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

function main(): number {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const tempRoot = mkdtempSync(join(tmpdir(), 'proto-compassrose-e2e-'));
  const cloneRoot = join(tempRoot, 'repo');
  const tsxBinary = join(repoRoot, 'node_modules', '.bin', 'tsx');

  if (!existsSync(tsxBinary)) {
    process.stderr.write(`Unable to find local tsx binary at ${tsxBinary}.\n`);
    return 1;
  }

  const bareRoot = join(tempRoot, 'repo.git');
  const cloneResult = spawnSync('git', ['clone', '--bare', '--quiet', repoRoot, bareRoot], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (cloneResult.status !== 0) {
    process.stderr.write(`git clone failed:\n${cloneResult.stderr || cloneResult.stdout}\n`);
    return 1;
  }

  const worktreeResult = spawnSync('git', ['clone', '--quiet', bareRoot, cloneRoot], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (worktreeResult.status !== 0) {
    process.stderr.write(`git clone from bare repo failed:\n${worktreeResult.stderr || worktreeResult.stdout}\n`);
    return 1;
  }

  syncPrototypeRuntime(repoRoot, cloneRoot);
  normalizeClonedWorktree(cloneRoot);

  const codexMock = join(tempRoot, 'codex-mock.cjs');
  const opencodeMock = join(tempRoot, 'opencode-mock.cjs');
  const codexLog = join(tempRoot, 'codex.log');
  const opencodeLog = join(tempRoot, 'opencode.log');
  const countFile = join(tempRoot, 'codex-count.txt');
  const binPath = join(repoRoot, 'node_modules', '.bin');

  seedTaskArtifacts(cloneRoot);
  writeExecutableScript(codexMock, CODEX_MOCK_SCRIPT);
  writeExecutableScript(opencodeMock, OPENCODE_MOCK_SCRIPT);

  const runResult = spawnSync(
    tsxBinary,
    ['proto/protoCompassRose.ts', 'run', '--loop', '--no-commit'],
    {
      cwd: cloneRoot,
      env: {
        ...process.env,
        PATH: `${binPath}:${process.env.PATH ?? ''}`,
        PROTO_COMPASSROSE_CODEX_COMMAND: codexMock,
        PROTO_COMPASSROSE_OPENCODE_COMMAND: opencodeMock,
        PROTO_COMPASSROSE_SKIP_CLEAN_CHECK: '1',
        PROTO_E2E_ROOT: tempRoot,
        PROTO_E2E_CODEX_LOG: codexLog,
        PROTO_E2E_OPENCODE_LOG: opencodeLog,
        PROTO_E2E_CODEX_COUNT: countFile,
      },
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  if (runResult.status !== 0) {
    process.stderr.write(`proto run failed:\n${runResult.stderr || runResult.stdout}\n`);
    process.stderr.write(`temp workspace preserved at ${tempRoot}\n`);
    return 1;
  }

  const codexCalls = countLines(codexLog);
  const opencodeCalls = countLines(opencodeLog);
  const runSummaryPath = join(cloneRoot, '.git', 'proto-compassrose', 'latest-run.json');
  const runSummary = JSON.parse(readFileSync(runSummaryPath, 'utf8')) as { status?: string; exit_code?: number };
  const markerPath = join(cloneRoot, 'proto', 'e2e-control.txt');
  const markerExists = existsSync(markerPath);

  const checks = [
    { name: 'codex was called at least three times', ok: codexCalls >= 3 },
    { name: 'opencode was called at least once', ok: opencodeCalls >= 1 },
    { name: 'run completed successfully', ok: runSummary.status === 'completed' && runSummary.exit_code === 0 },
    { name: 'opencode touched the repo', ok: markerExists },
  ];

  for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'}: ${check.name}`);
  }

  if (checks.every((check) => check.ok)) {
    console.log(`codex calls: ${codexCalls}`);
    console.log(`opencode calls: ${opencodeCalls}`);
    rmSync(tempRoot, { recursive: true, force: true });
    return 0;
  }

  process.stderr.write(`temp workspace preserved at ${tempRoot}\n`);
  return 1;
}

function syncPrototypeRuntime(repoRoot: string, cloneRoot: string): void {
  const sourcePath = join(repoRoot, 'proto', 'protoCompassRose.ts');
  const targetPath = join(cloneRoot, 'proto', 'protoCompassRose.ts');
  writeFileSync(targetPath, readFileSync(sourcePath, 'utf8'), 'utf8');
}

function normalizeClonedWorktree(cloneRoot: string): void {
  const statusResult = spawnSync('git', ['status', '--porcelain'], {
    cwd: cloneRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (statusResult.status !== 0) {
    throw new Error(`Unable to inspect clone status:\n${statusResult.stderr || statusResult.stdout}`);
  }

  const lines = (statusResult.stdout || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    const filePath = line.slice(3).trim();
    if (!filePath) {
      continue;
    }

    if (line.startsWith('?? ')) {
      rmSync(join(cloneRoot, filePath), { recursive: true, force: true });
      continue;
    }

    const restored = spawnSync('git', ['show', `HEAD:${filePath}`], {
      cwd: cloneRoot,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });

    if (restored.status !== 0) {
      throw new Error(`Unable to restore ${filePath} from HEAD:\n${restored.stderr || restored.stdout}`);
    }

    mkdirSync(dirname(join(cloneRoot, filePath)), { recursive: true });
    writeFileSync(join(cloneRoot, filePath), restored.stdout, 'utf8');
  }
}

function countLines(path: string): number {
  if (!existsSync(path)) {
    return 0;
  }

  const content = readFileSync(path, 'utf8').trim();
  if (content.length === 0) {
    return 0;
  }

  return content.split('\n').length;
}

function writeExecutableScript(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf8');
  chmodSync(path, 0o755);
}

function seedTaskArtifacts(cloneRoot: string): void {
  const artifactsRoot = join(cloneRoot, '.git', 'proto-compassrose', 'tasks');
  mkdirSync(artifactsRoot, { recursive: true });
  writeFileSync(
    join(artifactsRoot, 'F002-T04.json'),
    `${JSON.stringify(SEEDED_TASK, null, 2)}\n`,
    'utf8',
  );
}

const CODEX_MOCK_SCRIPT = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const countFile = process.env.PROTO_E2E_CODEX_COUNT;
const logFile = process.env.PROTO_E2E_CODEX_LOG;
const outputPath = readArgValue(args, '-o');
const count = readCount(countFile) + 1;

writeCount(countFile, count);
appendLog(logFile, \`call \${count}: \${args.join(' ')}\`);

let payload;
if (count === 1) {
  payload = {
    kind: 'implement_task',
    feature_id: null,
    task_id: 'F002-T04',
    correction_task_id: null,
    reason: 'e2e mock: implement task',
  };
} else if (count === 2) {
  payload = {
    kind: 'review_task',
    feature_id: null,
    task_id: 'F002-T04',
    correction_task_id: null,
    reason: 'e2e mock: review task',
  };
} else if (count === 3) {
  payload = {
    task_id: 'F002-T04',
    status: 'approved',
    summary: 'e2e mock review approved the implementation',
    acceptance: {
      criteria: [
        {
          criterion: 'prototype invokes both codex and opencode',
          status: 'passed',
          notes: 'observed through mock invocations',
        },
      ],
    },
    findings: [],
    scope_check: {
      status: 'passed',
      unrelated_changes: [],
    },
    quality_gate_check: {
      status: 'passed',
      failed_gates: [],
    },
    correction_task: null,
    project_state_update_hint: null,
  };
} else {
  payload = {
    kind: 'stop',
    feature_id: null,
    task_id: null,
    correction_task_id: null,
    reason: 'e2e mock: stop',
  };
}

if (outputPath) {
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\\n', 'utf8');
}

process.exit(0);

function readArgValue(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return args[index + 1] || null;
}

function readCount(filePath) {
  try {
    return Number.parseInt(fs.readFileSync(filePath, 'utf8'), 10) || 0;
  } catch {
    return 0;
  }
}

function writeCount(filePath, value) {
  fs.writeFileSync(filePath, String(value), 'utf8');
}

function appendLog(filePath, line) {
  fs.appendFileSync(filePath, \`\${JSON.stringify({ line })}\\n\`, 'utf8');
}
`;

const OPENCODE_MOCK_SCRIPT = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = process.cwd();
const logFile = process.env.PROTO_E2E_OPENCODE_LOG;
const markerPath = path.join(repoRoot, 'proto', 'e2e-control.txt');
const prompt = process.argv.slice(2).join(' ');

fs.mkdirSync(path.dirname(markerPath), { recursive: true });
fs.writeFileSync(markerPath, 'opencode e2e touched this file\\n', 'utf8');
fs.appendFileSync(logFile, JSON.stringify({ cwd: repoRoot, prompt }) + '\\n', 'utf8');

process.exit(0);
`;

const SEEDED_TASK = {
  task: {
    task_id: 'F002-T04',
    feature_id: '002-configuration-model',
    title: 'Validate runtime-precondition policy fields in the project config loader',
    objective:
      'Extend the repository-local configuration model so runtime orchestration can safely consume execution, roles, and git_policy from docs/compassrose/CONFIG.md.',
    first_executable_step:
      'Extend ProjectConfiguration in src/config/configTypes.ts with typed execution, roles, and git_policy sections that match the canonical keys already present in docs/compassrose/CONFIG.md.',
    minimum_progress_evidence: [
      'readProjectConfiguration() returns typed execution, roles, and git_policy data when loading the canonical project config.',
      'Invalid runtime-precondition values such as an unsupported execution.mode, a missing required role entry, or an invalid git_policy value produce field-specific ConfigurationIssue results.',
      'Config-loader tests cover the new runtime-policy fields, and the existing Doctor happy-path test still passes.',
    ],
    trace: {
      roadmap_objective: 'Deterministic Orchestration',
      feature_goal:
        'Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.',
      state_gap: 'The project-local configuration flow still needs to be connected to the broader runtime orchestration loop.',
    },
    context: {
      summary:
        'The repository already has a working Markdown-backed config loader and a Doctor preflight, but the typed configuration surface still stops at the narrow Doctor MVP contract.',
      relevant_paths: [
        'docs/features/002-configuration-model/state.md',
        'docs/compassrose/CONFIG.md',
        'src/contracts/runtime/operation-loop.md',
        'src/cli/main.ts',
        'src/config/configTypes.ts',
        'src/config/configReader.ts',
        'src/doctor/doctorCommand.ts',
        'tests/configReader.test.ts',
      ],
      relevant_modules: ['ProjectConfiguration', 'readProjectConfiguration()', 'runDoctor()'],
    },
    scope: {
      allowed_paths: [
        'src/config/configTypes.ts',
        'src/config/configReader.ts',
        'src/doctor/doctorCommand.ts',
        'tests/configReader.test.ts',
        'tests/doctorCommand.test.ts',
      ],
      forbidden_paths: [
        'docs/compassrose/CONFIG.md',
        'docs/features/002-configuration-model/',
        'src/cli/main.ts',
        'src/doctor/projectState.ts',
        'tests/projectState.test.ts',
      ],
    },
    constraints: [
      'Treat docs/compassrose/CONFIG.md as the only project-level source of truth.',
      'Validate only the runtime-precondition sections needed for the first orchestration handoff.',
      'Keep the implementation provider-independent and limited to repository-owned policy already documented in the canonical config.',
      "Preserve current Doctor behavior on the repository's existing canonical config while expanding the loader contract.",
    ],
    development_policy: {
      mode: 'test_guided',
    },
    quality_gates: {
      before_review: ['node -e "process.exit(0)"', 'test -f package.json'],
    },
    acceptance_criteria: [
      'readProjectConfiguration() succeeds on the current canonical docs/compassrose/CONFIG.md and exposes typed execution, roles, and git_policy values to callers.',
      'The loader reports field-specific validation failures for unsupported execution.mode values, missing required role entries, and invalid git_policy enum or boolean fields.',
      'runDoctor() continues to pass on the happy-path fixture without requiring changes to the documented project config.',
    ],
    expected_deliverables: ['code', 'tests'],
  },
};

const exitCode = main();
process.exitCode = exitCode;
