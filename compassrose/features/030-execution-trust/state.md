# State: Execution Trust

## Lifecycle State

implementation_running

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: none
- active_correction_task: none
- last_implementation_result: succeeded
- last_quality_gate_result: passed
- last_review_result: not_run
- validation: confirmed

## Current Reality

Specified after the user ranked it first among the four remaining gaps, ahead of distribution and
ahead of the specification-audit work it shipped alongside. The two decisions that fork the design —
what sandbox the implementer runs under, and whether planner-authored gate commands are refused or
merely recorded — were put to the user as choices and answered by them: `workspace-write` with the
network denied, and a declared allowlist that refuses.

Every bound this system had governed what an agent may *read*. This is the first that governs what
it may *do*.

The starting point was worse than "unspecified", which is what the coverage report had recorded. It
was decided, in code, against the user's own declared preference:

- every codex invocation carried `--dangerously-bypass-approvals-and-sandbox`, whose own help reads "Intended solely for running in environments that are externally sandboxed". CompassRose runs in the user's repository on the user's machine.
- the planner path wrote the correct bound and cancelled it two arguments later: `-s read-only`, then the bypass.
- the user's own `~/.codex/config.toml` declares `sandbox_mode = "workspace-write"`. CompassRose overrode it on every call.
- quality gates are strings the planner writes, handed to `spawnSync(command, { shell: true })` in the repository root. `validateQualityGateRefs` checks one narrow property of `git diff --exit-code` refs; nothing looked at what the command is.
- `CONFIG.md`'s "External tool isolation" rule had been broken about a hundred times: one trust grant in the user's global codex config per throwaway fixture workspace the test suite had ever created, each naming a directory that no longer exists.

Recorded as ADR-0048.

## Implemented Deliverables

- the `execution_trust` configuration section (`src/config/executionTrust.ts`, `configReader.ts`): sandbox, network, and gate allowlist, resolved per field so a partial declaration keeps the bounded defaults for what it did not mention.
- absence resolves to the **bounded** default, inverting how `limits` treats absence. Argued in ADR-0048: a missing limit means nobody thought about pacing, and running unpaced is how it already worked; a missing trust declaration means nobody thought about what is being let loose, and how it already worked is the defect.
- `codexSandboxArguments` (`src/agents/sandboxArguments.ts`), a pure function so the argv can be asserted without spawning anything — which matters here, because what flags a process is launched with is not something a type checker can prove.
- structured calls pinned to `read-only` regardless of configuration. Planning, review, diagnosis, classification and inference have no business writing to the repository, and a configuration surface that could grant it would be a way to lose that property by accident.
- the network denied explicitly rather than by relying on the CLI's default, so the user's own global config cannot quietly widen it.
- the bypass flag removed from both codex paths, and asserted absent under every sandbox value and both call kinds.
- the gate-command policy (`src/task/gateCommandPolicy.ts`): quote-aware segmentation, every segment checked, substitution and redirection refused outright, prefixes required to end at a word boundary.
- enforced at planning time in all three paths (feature task, fix task, correction task) and again in `runQualityGates`. The second is not redundant: a task document is a file on disk, and every task planned before this check existed is still in the repository.
- `tests/setup/isolateAgentHome.ts`, wired as a vitest `setupFile` rather than `globalSetup` — globalSetup runs in a different process and the environment it sets would never reach the workers that actually spawn the CLIs.
- the `execution-trust` doctor check: the policy in one line, `pass` on a clean agent home, `info` when the isolation rule has been broken, never `fail` — an external tool's own config is not this repository's readiness.
- `tests/executionTrust.test.ts` (24) and one wiring test in `tests/taskPlanValidationWiring.test.ts` proving a disallowed gate is refused before any task document is written.

## Remaining Deliverables

- **this repository's own allowlist admits `node -e`, which is an arbitrary program with a different name on the front.** The planner emits it routinely — structural assertions over `implementation.json` and `quality-gates.json` are written exactly that way, across the e2e harness and three test files. Declaring it is the honest option and it is declared with a comment saying what it costs, but the effect is that this project's allowlist bounds nothing it could not already do. The default allowlist does not include it, so this is this repository's exposure and not every project's. Closing it needs a real assertion mechanism to replace `node -e`, which is work rather than configuration.
- `CONFIG.md`'s isolation rule has a **detector**, not a mechanism. During a real run an external CLI writing to its own configuration is something CompassRose can observe and cannot prevent. The test suite no longer contributes to it; a real run still can.
- `coreRuntimeSmokeGateCommands` hardcodes `src/orchestrator/`, `src/cli/`, `src/task/` and `npx tsx scripts/runtimeSmokeTest.mjs src/cli/main.ts` — this repository's own layout inside logic any project's runtime executes. Same class of self-hosting leak as the planner manifest entries recorded under `027`, found while reading the gate execution path and left rather than fixed silently.
- the opencode adapter is unchanged. It takes `--auto --pure` and the installed CLI exposes no sandbox flag equivalent to codex's, so there was nothing to ask for. The policy is declared for it and does not reach it.

## Outline Progress

- 1. Add the `execution_trust` section with bounded defaults and validation: complete
- 2. Build the sandbox arguments as a pure function and use both codex paths: complete
- 3. Build the gate-command policy: complete
- 4. Wire it into the three planning paths and into gate execution: complete
- 5. Point the test suite at a throwaway agent-CLI configuration home: complete
- 6. Add the doctor check: complete

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none

## Last Approved Change

The execution-trust policy, the gate allowlist, and the removal of every sandbox bypass.

## Known Gaps

- See Remaining Deliverables. The `node -e` entry is the one that matters: it is the difference between a bound and a bound-shaped thing, for this repository specifically.

## Next Planning Hint

Replacing `node -e` gates with a declarative assertion mechanism would make this repository's own
allowlist mean what the default one means. It is the only remaining item here that changes what the
feature is worth rather than what it documents.
