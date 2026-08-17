import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { AgentToolName } from '../src/contracts/runtime/agentContext.js';
import { isolateFeatureDirectories } from './protoE2eSupport.js';

// The only feature this scenario seeds (see seedSmokeFeatureStateDocs below). See
// ADR-0034/ADR-0035: the clone must be built by declaring this set, not by inheriting every
// feature directory the bare clone happens to carry from HEAD.
const SCENARIO_FEATURE_IDS = ['002-configuration-model'] as const;

interface LogEntry {
  readonly tool: AgentToolName;
  readonly kind: string;
  readonly call: number;
}

function main(): number {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const tempRoot = mkdtempSync(join(tmpdir(), 'proto-compassrose-smoke-'));
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

  // The bare clone inherits every docs/features/* directory as committed at HEAD, not just
  // 002-configuration-model's. This scenario only ever seeds and asserts on that one feature (see
  // seedSmokeFeatureStateDocs below), so remove every other feature directory before anything
  // else touches the clone -- see ADR-0034/ADR-0035, and the identical live contamination this
  // fixed in protoCompassRose.e2e.ts (commit c90b090d).
  isolateFeatureDirectories(cloneRoot, SCENARIO_FEATURE_IDS);

  // See protoCompassRose.e2e.ts: a fresh local clone can leave the index stat-cache out
  // of sync with the checked-out files, making `git status` report every file as modified
  // even though content matches HEAD byte for byte. Re-add now so later checks reflect
  // only what this run itself changes.
  spawnSync('git', ['add', '-A'], { cwd: cloneRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

  syncPrototypeRuntime(repoRoot, cloneRoot);
  pinScenarioConfigLimits(cloneRoot);
  seedSmokeFeatureStateDocs(cloneRoot);

  const codexMock = join(tempRoot, 'codex-mock.cjs');
  const opencodeMock = join(tempRoot, 'opencode-mock.cjs');
  const callLog = join(tempRoot, 'calls.log');
  const countFile = join(tempRoot, 'codex-count.txt');
  const binPath = join(repoRoot, 'node_modules', '.bin');

  seedTaskArtifacts(cloneRoot);
  writeExecutableScript(codexMock, CODEX_MOCK_SCRIPT);
  writeExecutableScript(opencodeMock, OPENCODE_MOCK_SCRIPT);

  const runResult = spawnSync(
    tsxBinary,
    ['src/cli/main.ts', '--loop', '--no-commit'],
    {
      cwd: cloneRoot,
      env: {
        ...process.env,
        PATH: `${binPath}:${process.env.PATH ?? ''}`,
        PROTO_COMPASSROSE_CODEX_COMMAND: codexMock,
        PROTO_COMPASSROSE_OPENCODE_COMMAND: opencodeMock,
        PROTO_COMPASSROSE_SKIP_CLEAN_CHECK: '1',
        PROTO_E2E_CALL_LOG: callLog,
        PROTO_E2E_CODEX_COUNT: countFile,
      },
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      shell: process.platform === 'win32',
    },
  );

  if (runResult.status !== 0) {
    process.stderr.write(`proto run failed:\n${runResult.stderr || runResult.stdout}\n`);
    process.stderr.write(`temp workspace preserved at ${tempRoot}\n`);
    return 1;
  }

  const entries = readLogEntries(callLog);
  const sequence = entries.map((entry) => `${entry.tool}:${entry.kind}`);
  const markerPath = join(cloneRoot, 'proto', 'e2e-control.txt');

  const expectedSequence = [
    'opencode:implementer',
    'codex:reviewer',
  ];

  const checks = [
    {
      name: 'control sequence matched implementer -> reviewer',
      ok: sequence.length === expectedSequence.length
        && expectedSequence.every((item, index) => sequence[index] === item),
    },
    { name: 'opencode touched the repo', ok: existsSync(markerPath) },
    { name: 'run completed successfully', ok: runResult.status === 0 },
  ];

  for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'}: ${check.name}`);
  }

  if (checks.every((check) => check.ok)) {
    console.log(`sequence: ${sequence.join(' -> ')}`);
    rmSync(tempRoot, { recursive: true, force: true });
    return 0;
  }

  process.stderr.write(`sequence observed: ${sequence.join(' -> ')}\n`);
  process.stderr.write(`temp workspace preserved at ${tempRoot}\n`);
  return 1;
}

function syncPrototypeRuntime(repoRoot: string, cloneRoot: string): void {
  copyTree(join(repoRoot, 'src'), join(cloneRoot, 'src'));
}

// This scenario and its mocked codex response are scripted around exactly one primary task
// per `run --loop` invocation (the mock always returns the same hardcoded task_id for any
// planner-kind call). Pin the limit here instead of inheriting whatever the live repository's
// docs/compassrose/CONFIG.md happens to say today, so a real project tuning change (e.g.
// raising limits.max_tasks_per_run) can't silently make the runtime plan a second, unscripted
// task mid-run and collide on that reused task_id.
function pinScenarioConfigLimits(cloneRoot: string): void {
  const configPath = join(cloneRoot, 'docs', 'compassrose', 'CONFIG.md');
  const config = readFileSync(configPath, 'utf8');
  const pinned = config.replace(/max_tasks_per_run:\s*\d+/, 'max_tasks_per_run: 1');
  writeFileSync(configPath, pinned, 'utf8');
}

function copyTree(sourceRoot: string, targetRoot: string): void {
  if (!existsSync(sourceRoot)) {
    return;
  }

  if (statSync(sourceRoot).isFile()) {
    mkdirSync(dirname(targetRoot), { recursive: true });
    writeFileSync(targetRoot, readFileSync(sourceRoot, 'utf8'), 'utf8');
    return;
  }

  mkdirSync(targetRoot, { recursive: true });
  for (const entry of readdirSync(sourceRoot)) {
    copyTree(join(sourceRoot, entry), join(targetRoot, entry));
  }
}

function seedSmokeFeatureStateDocs(cloneRoot: string): void {
  const targetState = join(cloneRoot, 'docs', 'features', '002-configuration-model', 'state.md');
  mkdirSync(dirname(targetState), { recursive: true });
  writeFileSync(
    targetState,
    [
      '# State: Configuration Model',
      '',
      '## Lifecycle State',
      '',
      'task_ready',
      '',
      '## Source Request',
      '',
      '`request.md`',
      '',
      '## Operational Status',
      '',
      '- formalization: complete',
      '- active_task: F002-T04',
      '- active_correction_task: none',
      '- active_unblock_task: none',
      '- last_implementation_result: not_run',
      '- last_quality_gate_result: unknown',
      '- last_review_result: not_run',
      '- last_unblock_result: not_run',
      '',
      '## Current Reality',
      '',
      'Smoke control task `F002-T04` is ready to execute.',
      '',
      '## Blocked By',
      '',
      '- None',
      '',
      '## Blocked From',
      '',
      '- lifecycle_state: none',
      '- active_task: none',
      '- active_correction_task: none',
      '- active_unblock_task: none',
      '',
      '## Last Approved Change',
      '',
      'Smoke control task `F002-T04` was seeded by the smoke harness.',
      '',
      '## Known Gaps',
      '',
      '- The smoke harness verifies the control flow only.',
      '',
      '## Next Planning Hint',
      '',
      'Execute `F002-T04` when the current execution mode allows it.',
      '',
    ].join('\n'),
    'utf8',
  );
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

function seedTaskArtifacts(cloneRoot: string): void {
  const artifactsRoot = join(cloneRoot, '.git', 'proto-compassrose', 'tasks');
  mkdirSync(artifactsRoot, { recursive: true });
  writeFileSync(
    join(artifactsRoot, 'F002-T04.json'),
    `${JSON.stringify(SEEDED_TASK, null, 2)}\n`,
    'utf8',
  );
}

function writeExecutableScript(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf8');
  chmodSync(path, 0o755);
}

function readLogEntries(path: string): LogEntry[] {
  if (!existsSync(path)) {
    return [];
  }

  const lines = readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.map((line) => JSON.parse(line) as LogEntry);
}

const CODEX_MOCK_SCRIPT = `#!/usr/bin/env node
const fs = require('node:fs');

const args = process.argv.slice(2);
const prompt = fs.readFileSync(0, 'utf8');
const countFile = process.env.PROTO_E2E_CODEX_COUNT;
const logFile = process.env.PROTO_E2E_CALL_LOG;
const outputPath = readArgValue(args, '-o');
const count = readCount(countFile) + 1;
const kind = detectPromptKind(prompt);

appendLog(logFile, {
  tool: 'codex',
  kind,
  call: count,
});
writeCount(countFile, count);

let payload;
if (kind === 'diagnostic') {
  payload = {
    feature_id: '002-configuration-model',
    diagnosis_summary: 'Smoke test diagnostic: the recovery path is deterministic and should continue through a bounded doctor recovery task.',
    blocker: {
      kind: 'task_interface_gap',
      signature: 'smoke-diagnostic-002-configuration-model',
      recoverability: 'agent',
      evidence: [
        'The smoke harness is verifying a recovery scenario.',
        'The runtime should not crash when the diagnostic path is invoked.',
      ],
    },
    next_step: 'plan_doctor_recovery',
    next_step_reason: 'The smoke scenario is recoverable and should continue through a bounded doctor recovery task.',
      interface_response: {
        mode: 'apply_in_doctor_recovery',
        summary: 'Tighten the recovery interface inside a bounded doctor recovery task.',
        target_paths: [
          'src/doctor/projectState.ts',
          'src/cli/main.ts',
        ],
      },
    };
} else if (kind === 'planner' || kind === 'doctor_recovery_planner') {
  const taskId = kind === 'doctor_recovery_planner' ? 'F002-T04-U1' : 'F002-T04-P1';
  const title = kind === 'doctor_recovery_planner' ? 'Smoke doctor recovery' : 'Smoke follow-up task planning';
  payload = {
      task: {
        task_id: taskId,
        feature_id: '002-configuration-model',
        title,
        objective: 'Keep the recovery path deterministic and restore the active task after the smoke correction pass.',
        first_executable_step: 'Update src/doctor/projectState.ts so the smoke can observe a visible diff.',
        minimum_progress_evidence: [
          'The prototype writes a reviewable diff for the recovery path.',
          'The runtime can continue from doctor recovery planning to implementation.',
        ],
        trace: {
        roadmap_objective: 'Prototype control flow',
        feature_goal: 'Smoke-test the orchestration recovery loop.',
        state_gap: 'The recovery path should be exercised end to end.',
      },
        context: {
          summary: 'Minimal doctor recovery task used by the smoke harness.',
          relevant_paths: [
            'src/doctor/projectState.ts',
            'src/cli/main.ts',
            'src/config/configReader.ts',
          ],
          relevant_modules: ['PrototypeCompassRose', 'CodexCli', 'OpenCodeCli'],
        },
        scope: {
          allowed_paths: [
            'src/doctor/projectState.ts',
            'src/cli/main.ts',
            'src/config/configReader.ts',
          ],
          forbidden_paths: [
            'docs/compassrose/CONFIG.md',
            'docs/compassrose/PROJECT_STATE.md',
            'docs/features/002-configuration-model/state.md',
          ],
        },
        constraints: [
          'Keep the change minimal.',
          'Do not modify the forbidden paths.',
        ],
        development_policy: {
          mode: 'test_guided',
        },
        quality_gates: {
          before_review: ['node -e "process.exit(0)"'],
        },
        acceptance_criteria: [
          'The prototype can continue deterministically after the doctor recovery task.',
          'The smoke harness observes a visible repository change.',
        ],
        expected_deliverables: ['code', 'tests'],
      },
    };
} else if (kind === 'reviewer') {
  const taskId = readTaskId(prompt, 'Review task') ?? readTaskId(prompt, 'task') ?? 'F002-T04';
  payload = {
    task_id: taskId,
    status: 'approved',
    summary: 'Smoke test review approved ' + taskId + '.',
    acceptance: {
      criteria: [
        {
          criterion: 'prototype invokes codex and opencode in the expected control-flow roles',
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
    task_id: 'F002-T04',
    status: 'approved',
    summary: 'Smoke test default approval.',
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

function appendLog(filePath, entry) {
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\\n', 'utf8');
}

function detectPromptKind(prompt) {
  if (prompt.includes('Act as the CompassRose Diagnostic/Autocorrection role.')) {
    return 'diagnostic';
  }

  if (prompt.includes('Act as the CompassRose Planner.')) {
    // Both normal task planning and doctor-recovery task planning open with the identical
    // "Act as the CompassRose Planner." line (see src/orchestrator/orchestrator.ts's planTask
    // and planDoctorRecoveryTask); only the second line tells them apart. Returning the same
    // 'planner' kind for both used to make this mock hand back an identical hardcoded
    // task_id regardless of which one actually ran, which collides the moment both are
    // exercised in the same run.
    return prompt.includes('Plan the next doctor recovery task') ? 'doctor_recovery_planner' : 'planner';
  }

  if (prompt.includes('Act as the CompassRose Doctor.')) {
    return 'doctor';
  }

  if (prompt.includes('Act as the CompassRose Reviewer.')) {
    return 'reviewer';
  }

  if (prompt.includes('Act as the CompassRose Implementer.')) {
    return 'implementer';
  }

  if (prompt.includes('Act as the CompassRose task-interface analyst.')) {
    return 'task_interface_analyst';
  }

  return 'unknown';
}

function readTaskId(prompt, prefix) {
  const marker = prefix + ' \`';
  const start = prompt.indexOf(marker);
  if (start === -1) {
    return null;
  }

  const remainder = prompt.slice(start + marker.length);
  const end = remainder.indexOf('\`');
  return end === -1 ? null : remainder.slice(0, end);
}
`;

const OPENCODE_MOCK_SCRIPT = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = process.cwd();
const logFile = process.env.PROTO_E2E_CALL_LOG;
const markerPath = path.join(repoRoot, 'proto', 'e2e-control.txt');
const prompt = readStdinIfAvailable() || process.argv.slice(2).join(' ');

fs.mkdirSync(path.dirname(markerPath), { recursive: true });
fs.writeFileSync(markerPath, 'opencode smoke test touched this file\\n', 'utf8');
process.stdout.write([
  '## Implementation Notes',
  '- smoke test implementation completed successfully.',
  '- the fake implementer touched proto/e2e-control.txt to create a visible diff.',
  '',
].join('\\n'));
fs.appendFileSync(
  logFile,
  JSON.stringify({
    tool: 'opencode',
    kind: detectPromptKind(prompt),
    call: 1,
  }) + '\\n',
  'utf8',
);

process.exit(0);

function detectPromptKind(prompt) {
  if (prompt.includes('Act as the CompassRose Implementer.')) {
    return 'implementer';
  }

  if (prompt.includes('Act as the CompassRose Doctor.')) {
    return 'doctor';
  }

  return 'unknown';
}

function readStdinIfAvailable() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}
`;

const SEEDED_TASK = {
  task: {
    task_id: 'F002-T04',
    feature_id: '002-configuration-model',
    title: 'Handshaked prototype control smoke',
    objective: 'Verify that the prototype can coordinate codex and opencode in the expected order.',
    first_executable_step: 'Update proto/e2e-control.txt so the prototype has a visible diff to review.',
    minimum_progress_evidence: [
      'The repository shows at least one changed file after the implementer runs.',
      'The prototype can proceed from implementation to review without stalling.',
    ],
    trace: {
      roadmap_objective: 'Prototype control flow',
      feature_goal: 'Smoke-test the orchestration control flow.',
      state_gap: 'No dedicated smoke path had been exercised end to end.',
    },
    context: {
      summary: 'Minimal control-flow smoke task for the prototype harness.',
      relevant_paths: [
        'proto/e2e-control.txt',
        'docs/compassrose/PROJECT_STATE.md',
        'docs/compassrose/CONFIG.md',
      ],
      relevant_modules: ['PrototypeCompassRose', 'CodexCli', 'OpenCodeCli'],
    },
    scope: {
      allowed_paths: [
        'proto/e2e-control.txt',
        'docs/compassrose/PROJECT_STATE.md',
      ],
      forbidden_paths: [
        'docs/compassrose/CONFIG.md',
        'src/cli/main.ts',
      ],
    },
    constraints: [
      'Keep the change minimal.',
      'Do not modify the forbidden paths.',
      'Treat the smoke task as a control-flow check, not a feature implementation.',
    ],
    development_policy: {
      mode: 'test_guided',
    },
    quality_gates: {
      before_review: ['node -e "process.exit(0)"'],
    },
    acceptance_criteria: [
      'The prototype calls codex to select a step.',
      'The prototype calls opencode to implement the selected task.',
      'The prototype calls codex again to review the implementation.',
    ],
    expected_deliverables: ['code', 'tests'],
  },
};

const exitCode = main();
process.exitCode = exitCode;
