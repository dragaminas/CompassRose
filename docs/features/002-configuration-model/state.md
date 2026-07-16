# State: Configuration Model

## Lifecycle State

task_ready

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: F002-T16
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: passed
- last_quality_gate_result: passed
- last_review_result: approved
- last_unblock_result: passed

## Current Reality

The repository already contains `docs/compassrose/CONFIG.md` as a project-local CompassRose configuration document with a YAML configuration block, allowed values, override records, isolation rules, and a stabilized MVP Doctor contract.

CompassRose can load that project-local configuration, validate the MVP doctor contract, and report repository readiness checks through `compassrose doctor`, including a distinct preflight for the configured project-state document.

The accepted architecture documentation already supports repository-local state, hierarchical configuration precedence, non-invasive external tool integration, configurable review policy, and quality-gate configuration. The MVP contract for Doctor is explicit: only the project-level scope in `docs/compassrose/CONFIG.md` is in scope, the minimum required sections and fields are fixed, and command semantics distinguish missing keys from intentionally empty values.

This feature is formalized under `docs/features/002-configuration-model/`, and the first implementation tasks have been completed against the configuration target defined in `docs/compassrose/CONFIG.md`.

Task `F002-T04` was approved, extending the typed config loader to validate and expose `execution`, `roles`, and `git_policy` data from the canonical project config.

Task `F002-T05` connects the validated configuration policy to the default CLI runtime preflight. Its implementation passed, but the quality gate (`npm test`) initially failed. Diagnosis found the failure was a false negative in the `state-correction-missing-active-task` e2e scenario in `proto/protoCompassRose.e2e.ts`: the scenario's seeded fallback task artifact and its assertions referenced different task ids (`F002-T05` vs. `F002-T04`), a drift introduced by an earlier rename that never touched all occurrences. The e2e harness was fixed to derive the expected id from a single shared constant instead of duplicating it, and the full quality gate suite passed (58/58 tests, clean typecheck).

Review of `F002-T05` then requested correction task `F002-T05-C1` (resolve the default CLI preflight from the repository root instead of `cwd`). That implementation passed its quality gate, but review rejected it a second time as `F002-T05-C1-CLEANUP`, claiming the diff leaked edits into `docs/compassrose/PROJECT_STATE.md` and this feature's `state.md`. Diagnosis found this was a false rejection caused by a runtime bug: `reviewTask()` in `proto/protoCompassRose.ts` computed the reviewer's diff without excluding the state-doc bookkeeping the runtime itself writes live to the working tree during implementation (every other diff capture in the codebase already excludes those paths). The reviewer was seeing its own bookkeeping mixed into the implementer's diff. A second, related bug meant that any `changes_required`/`blocked` review verdict left the implementer's actual files permanently uncommitted, which crashed the run on the very next step's clean-worktree precondition. Both bugs are fixed: the reviewer's diff now excludes the state docs, and rejected implementations are fully committed like approved ones are. `F002-T05-C1`'s actual diff (`src/cli/main.ts`, `tests/main.test.ts`) never contained any `docs/` edits, so `F002-T05-C1-CLEANUP` had no real work to do and is dropped; `F002-T05-C1` is ready for review again with a reviewer that will now see the correct diff.

Doctor recovery task `F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-DOCTOR-RECOVERY-R2` restored the recorded `implementation_running` state after its doctor re-entry gate passed. Resume the active repair-handoff task without changing the feature scope.

Task `F002-T06` is now planned and ready to execute. Expose the remaining documented runtime policy in the configuration loader.

Task `F002-T07` is now planned and ready to execute. Consume project runtime policy at the CLI entrypoint.

Task `F002-T07-C2` is now planned and ready to execute. Enforce MVP external_cli-only role wiring for the planner and reviewer roles (the implementer role was already covered by the approved `F002-T07-C1` correction). This task was originally planned with a colliding id (`F002-T07-C1`, already used by the approved correction above); the runtime now rejects a proposed task id that collides with an existing task document, and this task was renumbered to `F002-T07-C2` to resolve the existing collision.

Task `F002-T08` is now planned and ready to execute. Enforce repository and platform preconditions at CLI preflight.

Task `F002-T09` is now planned and ready to execute. Enforce configured Git worktree policy at CLI preflight.

Task `F002-T10` is now planned and ready to execute. Add deterministic feature-selection checkpoint to the CLI runtime.

Task `F002-T11` is now planned and ready to execute. Advance formalized features to task planning.

Task `F002-T12` is now planned and ready to execute. Align the CLI handoff report with the persisted lifecycle state.

Task `F002-T13` is now planned and ready to execute. Dispatch task planning from the selected lifecycle state.

Task `F002-T14` is now planned and ready to execute. Invoke the configured planner for task_planning_pending features.

Tasks `F002-T10` through `F002-T14` (and the pending correction `F002-T14-C1`) are superseded, not completed and not silently discarded. They drifted outside this feature's own declared scope (`feature.md`'s "this feature does not include" list explicitly excludes "implementation of unrelated orchestration features beyond the configuration contract they depend on") and reconstructed — more thinly and with real bugs (no prompt construction, no heartbeat, no signal handling, a broken extension-based command interpreter) — behavior that already existed in `proto/protoCompassRose.ts`'s orchestrator: feature selection, lifecycle-transition persistence, and external-CLI-adapter invocation. Rather than complete that reimplementation, the real orchestrator (`PrototypeCompassRose`, renamed `CompassRoseOrchestrator`) was moved into `src/orchestrator/orchestrator.ts`, and `src/cli/main.ts`'s no-args path now constructs and runs it directly after this feature's own legitimate preflight chain (`F002-T04` through `F002-T09`: config load/validate, role/adapter wiring, platform check, dirty-worktree check) passes. `compassrose` (no args) reaches the same "no selectable feature" / feature-selection outcome the removed code produced, now backed by the real, already-battle-tested orchestration loop instead of a parallel, thinner copy of it.

Task `F002-T15` is now planned and ready to execute. Handle missing project configuration during runtime preflight.

Task `F002-T16` is now planned and ready to execute. Align loader with the documented Doctor MVP boundary.

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

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none
- active_unblock_task: none

## Last Approved Change

Subtask `F002-T15` was approved by the prototype orchestrator.

## Known Gaps

- The correction-task id allocator (`buildStateCorrectionTaskId` in `src/orchestrator/orchestrator.ts`) has no cycle or depth limit; a prior recovery loop against `F002-T04-C3` generated thousands of near-duplicate correction docs before being stopped manually. Not yet addressed.

## Next Planning Hint

Execute `F002-T16` when the current execution mode allows it.
