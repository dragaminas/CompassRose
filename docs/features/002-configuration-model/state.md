# State: Configuration Model

## Lifecycle State

unblock_pending

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_correction_task: none
- active_unblock_task: F002-T04-C2-U1-U1-C1-C1-U1
- last_review_result: blocked
- last_unblock_result: not_run
- active_task: none
- last_implementation_result: not_run
- last_quality_gate_result: unknown

## Current Reality

The repository already contains `docs/compassrose/CONFIG.md` as a project-local CompassRose configuration document with a YAML configuration block, allowed values, override records, isolation rules, and a stabilized MVP Doctor contract.

CompassRose can now load that project-local configuration, validate the MVP doctor contract, and report the repository readiness checks through `compassrose doctor`, including a distinct preflight for the configured project-state document.

The accepted architecture documentation already supports repository-local state, hierarchical configuration precedence, non-invasive external tool integration, configurable review policy, and quality-gate configuration. The MVP contract for Doctor is now explicit: only the project-level scope in `docs/compassrose/CONFIG.md` is in scope, the minimum required sections and fields are fixed, and command semantics distinguish missing keys from intentionally empty values.

This feature is now formalized under `docs/features/002-configuration-model/`, and the first implementation tasks have now been completed against the configuration target defined in `docs/compassrose/CONFIG.md`.

Task `F002-T04` was approved, extending the typed config loader to validate and expose `execution`, `roles`, and `git_policy` data from the canonical project config.

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
- Connect configuration validation to the doctor/runtime flow and update state based on approved behavior: blocked
- Repair malformed operational-status entries in feature state: in progress

## Blocked By

- - kind: implementation_failure
- - signature: implementation-failure-F002-T04-C2-U1-U1-C1-C1
- - recoverability: agent
- - observed_state: lifecycle=implementation_failed; active_task=F002-T04-C2-U1-U1-C1-C1; active_correction_task=none; active_unblock_task=none
- - evidence: Implementation for F002-T04-C2-U1-U1-C1-C1 produced no git diff (context_overflow).

## Blocked From

- lifecycle_state: `task_ready`
- active_task: `F002-T04-C2-U1-U1-C1-C1`
- active_correction_task: `none`
- active_unblock_task: `none`

## Last Approved Change

Task `F002-T04` was approved, extending the typed config loader and its tests to validate the first runtime-precondition policy fields from `docs/compassrose/CONFIG.md`.

## Known Gaps

- The project-local configuration flow still needs a runtime consumer that uses the validated `execution`, `roles`, and `git_policy` data during orchestration.
- The correction task `F002-T04-C1` has a partial implementation attempt (no-diff), so recovery must resume from the current repository state instead of assuming a fresh task start.

## Next Planning Hint

Execute unblock task `F002-T04-C2-U1-U1-C1-C1-U1` next.
