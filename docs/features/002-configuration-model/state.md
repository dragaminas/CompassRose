# State: Configuration Model

## Lifecycle State

task_ready

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: F002-T04
- active_correction_task: none
- last_implementation_result: passed
- last_quality_gate_result: passed
- last_review_result: approved

## Current Reality

The repository already contains `docs/compassrose/CONFIG.md` as a project-local CompassRose configuration document with a YAML configuration block, allowed values, override records, isolation rules, and a stabilized MVP Doctor contract.

CompassRose can now load that project-local configuration, validate the MVP doctor contract, and report the repository readiness checks through `compassrose doctor`, including a distinct preflight for the configured project-state document.

The accepted architecture documentation already supports repository-local state, hierarchical configuration precedence, non-invasive external tool integration, configurable review policy, and quality-gate configuration. The MVP contract for Doctor is now explicit: only the project-level scope in `docs/compassrose/CONFIG.md` is in scope, the minimum required sections and fields are fixed, and command semantics distinguish missing keys from intentionally empty values.

This feature is now formalized under `docs/features/002-configuration-model/`, and the first implementation tasks have now been completed against the configuration target defined in `docs/compassrose/CONFIG.md`.

Task `F002-T04` is now planned and ready to execute. It extends the typed configuration loader to validate and expose the first runtime-precondition policy fields needed by the broader orchestration loop.

## Implemented Deliverables

- the source feature request exists at `docs/features/002-configuration-model/request.md`
- the project-local configuration contract already exists at `docs/compassrose/CONFIG.md`
- canonical feature documents now exist for feature `002-configuration-model`
- the repository already documents the configuration hierarchy and non-invasive tool expectations in project-wide architecture docs
- the runtime can now load `docs/compassrose/CONFIG.md`, validate the MVP doctor contract, and report readiness through `compassrose doctor`
- `compassrose doctor` now validates `docs/compassrose/PROJECT_STATE.md` as a distinct preflight step

## Remaining Deliverables

- connect configuration validation to the broader runtime flow
- prove the documented configuration model works through approved implementation tasks and quality gates

## Outline Progress

- Formalize the configuration model in canonical feature documents: complete
- Stabilize the project-local configuration contract and any gaps in `docs/compassrose/CONFIG.md`: complete
- Implement configuration loading and validation for the documented MVP scope: complete
- Connect configuration validation to the doctor/runtime flow and update state based on approved behavior: complete

## Blocked By

- None

## Last Approved Change

Added the distinct project-state preflight to `compassrose doctor` and validated repository-local project-state inspection (`F002-T03`).

## Known Gaps

- The project-local configuration flow still needs to be connected to the broader runtime orchestration loop.
- The active task should build on the validated configuration loader and doctor checks rather than redefining the schema.

## Next Planning Hint

Execute `F002-T04` when the current execution mode allows it.
