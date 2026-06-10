# State: Configuration Model

## Lifecycle State

formalized

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: none
- active_correction_task: none
- last_implementation_result: not_run
- last_quality_gate_result: unknown
- last_review_result: not_run

## Current Reality

The repository already contains `docs/compassrose/CONFIG.md` as a project-local CompassRose configuration document with a YAML configuration block, allowed values, override records, isolation rules, and a stabilized MVP Doctor contract.

The accepted architecture documentation already supports repository-local state, hierarchical configuration precedence, non-invasive external tool integration, configurable review policy, and quality-gate configuration. The MVP contract for Doctor is now explicit: only the project-level scope in `docs/compassrose/CONFIG.md` is in scope, the minimum required sections and fields are fixed, and command semantics distinguish missing keys from intentionally empty values.

This feature is now formalized under `docs/features/002-configuration-model/`, and its first documentation task has stabilized the configuration target that implementation should read and validate next.

## Implemented Deliverables

- the source feature request exists at `docs/features/002-configuration-model/request.md`
- the project-local configuration contract already exists at `docs/compassrose/CONFIG.md`
- canonical feature documents now exist for feature `002-configuration-model`
- the repository already documents the configuration hierarchy and non-invasive tool expectations in project-wide architecture docs

## Remaining Deliverables

- implement project-level configuration loading from `docs/compassrose/CONFIG.md`
- implement validation for the stabilized Doctor MVP contract, supported platforms, and referenced repository paths
- connect configuration validation to the doctor/runtime flow
- prove the documented configuration model works through approved implementation tasks and quality gates

## Outline Progress

- Formalize the configuration model in canonical feature documents: complete
- Stabilize the project-local configuration contract and any gaps in `docs/compassrose/CONFIG.md`: complete
- Implement configuration loading and validation for the documented MVP scope: not started
- Connect configuration validation to the doctor/runtime flow and update state based on approved behavior: not started

## Blocked By

- None

## Last Approved Change

Stabilized the MVP project configuration contract for `compassrose doctor` documentation (`F002-T01`).

## Known Gaps

- No runtime code currently reads or validates `docs/compassrose/CONFIG.md`.
- The next implementation task still needs to read the YAML block from `docs/compassrose/CONFIG.md` and apply the documented minimum Doctor validation.

## Next Planning Hint

Implement project-level configuration loading from the YAML block in `docs/compassrose/CONFIG.md` and enforce the documented minimum validation behavior for `compassrose doctor`.
