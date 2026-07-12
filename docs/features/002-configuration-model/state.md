# State: Configuration Model

## Lifecycle State

blocked

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: F002-T05-C1-CORRECTION-HANDOFF
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: failed
- last_quality_gate_result: unknown
- last_review_result: blocked
- last_unblock_result: not_run

## Current Reality

The repository already contains `docs/compassrose/CONFIG.md` as a project-local CompassRose configuration document with a YAML configuration block, allowed values, override records, isolation rules, and a stabilized MVP Doctor contract.

CompassRose can load that project-local configuration, validate the MVP doctor contract, and report repository readiness checks through `compassrose doctor`, including a distinct preflight for the configured project-state document.

The accepted architecture documentation already supports repository-local state, hierarchical configuration precedence, non-invasive external tool integration, configurable review policy, and quality-gate configuration. The MVP contract for Doctor is explicit: only the project-level scope in `docs/compassrose/CONFIG.md` is in scope, the minimum required sections and fields are fixed, and command semantics distinguish missing keys from intentionally empty values.

This feature is formalized under `docs/features/002-configuration-model/`, and the first implementation tasks have been completed against the configuration target defined in `docs/compassrose/CONFIG.md`.

Task `F002-T04` was approved, extending the typed config loader to validate and expose `execution`, `roles`, and `git_policy` data from the canonical project config.

Task `F002-T05` connects the validated configuration policy to the default CLI runtime preflight. Its implementation passed, but the quality gate (`npm test`) initially failed. Diagnosis found the failure was a false negative in the `state-correction-missing-active-task` e2e scenario in `proto/protoCompassRose.e2e.ts`: the scenario's seeded fallback task artifact and its assertions referenced different task ids (`F002-T05` vs. `F002-T04`), a drift introduced by an earlier rename that never touched all occurrences. The e2e harness was fixed to derive the expected id from a single shared constant instead of duplicating it, and the full quality gate suite passed (58/58 tests, clean typecheck).

Review of `F002-T05` then requested correction task `F002-T05-C1` (resolve the default CLI preflight from the repository root instead of `cwd`). That implementation passed its quality gate, but review rejected it a second time as `F002-T05-C1-CLEANUP`, claiming the diff leaked edits into `docs/compassrose/PROJECT_STATE.md` and this feature's `state.md`. Diagnosis found this was a false rejection caused by a runtime bug: `reviewTask()` in `proto/protoCompassRose.ts` computed the reviewer's diff without excluding the state-doc bookkeeping the runtime itself writes live to the working tree during implementation (every other diff capture in the codebase already excludes those paths). The reviewer was seeing its own bookkeeping mixed into the implementer's diff. A second, related bug meant that any `changes_required`/`blocked` review verdict left the implementer's actual files permanently uncommitted, which crashed the run on the very next step's clean-worktree precondition. Both bugs are fixed: the reviewer's diff now excludes the state docs, and rejected implementations are fully committed like approved ones are. `F002-T05-C1`'s actual diff (`src/cli/main.ts`, `tests/main.test.ts`) never contained any `docs/` edits, so `F002-T05-C1-CLEANUP` had no real work to do and is dropped; `F002-T05-C1` is ready for review again with a reviewer that will now see the correct diff.

## Implemented Deliverables

- the source feature request exists at `docs/features/002-configuration-model/request.md`
- the project-local configuration contract already exists at `docs/compassrose/CONFIG.md`
- canonical feature documents now exist for feature `002-configuration-model`
- the repository already documents the configuration hierarchy and non-invasive tool expectations in project-wide architecture docs
- the runtime can load `docs/compassrose/CONFIG.md`, validate the MVP doctor contract, and report readiness through `compassrose doctor`
- `compassrose doctor` now validates `docs/compassrose/PROJECT_STATE.md` as a distinct preflight step
- `readProjectConfiguration()` now validates and exposes typed `execution`, `roles`, and `git_policy` policy data from the canonical project config

## Remaining Deliverables

- connect configuration validation to the broader runtime flow
- prove the documented configuration model works through approved implementation tasks and quality gates

## Outline Progress

- Formalize the configuration model in canonical feature documents: complete
- Stabilize the project-local configuration contract and any gaps in `docs/compassrose/CONFIG.md`: complete
- Implement configuration loading and validation for the documented MVP scope: complete
- Connect configuration validation to the doctor/runtime flow and update state based on approved behavior: complete
- Repair malformed operational-status entries in feature state: completed

## Blocked By

- - kind: state_corruption
- - signature: state-corruption-unblock-pending-doctor-recovery-f002-t05-c1-correction-handoff-doctor-recovery-
- - recoverability: agent
- - observed_state: lifecycle=unblock_pending; active_task=F002-T05-C1-CORRECTION-HANDOFF; active_correction_task=none; active_unblock_task=F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY-R3
- - evidence: Doctor recovery F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY-R3 failed its re-entry quality gates.
npm test: - 0
+ 1

 ❯ tests/protoBlockerFlows.test.ts:94:27
     92|     const result = runProtoScenario('interface-gap', { commit: true });
     93|
     94|     expect(result.status).toBe(0);
       |                           ^
     95|     expect(result.stdout).toContain('PASS: recovery lesson was recorde…
     96|     expect(result.stdout).toContain('PASS: recovery lesson recorded sc…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
- - evidence: - kind: state_corruption
- - evidence: - signature: state-corruption-unblock-pending-implementation-for-f002-t05-c1-correction-handoff-doctor-recove
- - evidence: - recoverability: agent
- - evidence: lifecycle=unblock_pending
- - reason: Doctor recovery F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY-R3 failed its re-entry quality gates. | npm test: - 0 | + 1 | ❯ tests/protoBlockerFlows.test.ts:94:27 | 92|     const result = runProtoScenario('interface-gap', { commit: true }); | 93| | 94|     expect(result.status).toBe(0); | |                           ^ | 95|     expect(result.stdout).toContain('PASS: recovery lesson was recorde… | 96|     expect(result.stdout).toContain('PASS: recovery lesson recorded sc… | ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

## Blocked From

- lifecycle_state: `task_ready`
- active_task: `F002-T05-C1-CORRECTION-HANDOFF`
- active_correction_task: `none`
- active_unblock_task: `none`
- recoverability: agent

## Last Approved Change

Fixed a false rejection of `F002-T05-C1`: `reviewTask()` did not exclude the runtime's own state-doc bookkeeping from the diff it showed the reviewer, so the reviewer mistook orchestrator bookkeeping for a scope violation. Also fixed a related bug where `changes_required`/`blocked` review verdicts left the implementer's diff uncommitted, crashing the next step's clean-worktree check. `F002-T05-C1`'s implementation (`src/cli/main.ts`, `tests/main.test.ts`) is committed and has no real `docs/` edits to clean up, so `F002-T05-C1-CLEANUP` is dropped.

## Known Gaps

- The project-local configuration flow still needs a runtime consumer that uses the validated `execution`, `roles`, and `git_policy` data during orchestration.
- The correction-task id allocator (`buildStateCorrectionTaskId` in `proto/protoCompassRose.ts`) has no cycle or depth limit; a prior recovery loop against `F002-T04-C3` generated thousands of near-duplicate correction docs before being stopped manually. Not yet addressed.

## Next Planning Hint

Plan a doctor recovery task for blocker `state-corruption-unblock-pending-doctor-recovery-f002-t05-c1-correction-handoff-doctor-recovery-` and then restore `task_ready`.
