# State: Configuration Model

## Lifecycle State

blocked

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: F002-T04-C3-U1-C1-U1
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: passed
- last_quality_gate_result: passed
- last_review_result: approved
- last_unblock_result: not_run

## Current Reality

The repository already contains `docs/compassrose/CONFIG.md` as a project-local CompassRose configuration document with a YAML configuration block, allowed values, override records, isolation rules, and a stabilized MVP Doctor contract.

CompassRose can now load that project-local configuration, validate the MVP doctor contract, and report the repository readiness checks through `compassrose doctor`, including a distinct preflight for the configured project-state document.

The accepted architecture documentation already supports repository-local state, hierarchical configuration precedence, non-invasive external tool integration, configurable review policy, and quality-gate configuration. The MVP contract for Doctor is now explicit: only the project-level scope in `docs/compassrose/CONFIG.md` is in scope, the minimum required sections and fields are fixed, and command semantics distinguish missing keys from intentionally empty values.

This feature is now formalized under `docs/features/002-configuration-model/`, and the first implementation tasks have now been completed against the configuration target defined in `docs/compassrose/CONFIG.md`.

Task `F002-T04` was approved, extending the typed config loader to validate and expose `execution`, `roles`, and `git_policy` data from the canonical project config.

The latest recovery work repaired the stale recovery interface around `F002-T04-C3`: the earlier `implementation_failed` attempt produced no diff and omitted the required `Implementation Notes`, and the bounded doctor successor reissued the task interface under `task-interface-gap-F002-T04-C3-stale-preimage-mismatch` before restoring the feature to `task_ready` with `active_task: F002-T04-C3-U1-C1-U1`.

## Implemented Deliverables

- the source feature request exists at `docs/features/002-configuration-model/request.md`
- the project-local configuration contract already exists at `docs/compassrose/CONFIG.md`
- canonical feature documents now exist for feature `002-configuration-model`
- the repository already documents the configuration hierarchy and non-invasive tool expectations in project-wide architecture docs
- the runtime can now load `docs/compassrose/CONFIG.md`, validate the MVP doctor contract, and report readiness through `compassrose doctor`
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
- - signature: state-corruption-blocked-the-bounded-doctor-recovery-already-failed-to-prove-deterministic-re-en
- - recoverability: agent
- - observed_state: lifecycle=blocked; active_task=F002-T04-C3-U1-C1-U1; active_correction_task=none; active_unblock_task=none
- - evidence: The bounded doctor recovery already failed to prove deterministic re-entry readiness, and the remaining mismatch needs manual review before any successor task is planned or applied.
- - evidence: kind: task_interface_gap
- - evidence: signature: task-interface-gap-F002-T04-C3-stale-preimage-mismatch
- - evidence: recoverability: agent
- - evidence: lifecycle=blocked
- - reason: The bounded doctor recovery already failed to prove deterministic re-entry readiness, and the remaining mismatch needs manual review before any successor task is planned or applied.

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none
- active_unblock_task: none

## Last Approved Change

State correction artifact `F002-T04-C3-U1-C1-U1-C2352` was applied by the prototype orchestrator.

## Known Gaps

- The project-local configuration flow still needs a runtime consumer that uses the validated `execution`, `roles`, and `git_policy` data during orchestration.

## Next Planning Hint

Continue from the repaired `blocked` state for `F002-T04-C3-U1-C1-U1-C2352`.
