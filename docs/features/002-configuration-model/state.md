# State: Configuration Model

## Lifecycle State

correction_pending

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: F002-T05
- active_correction_task: F002-T05-C1
- active_unblock_task: none
- last_implementation_result: passed
- last_quality_gate_result: passed
- last_review_result: changes_required
- last_unblock_result: not_run

## Current Reality

The repository already contains `docs/compassrose/CONFIG.md` as a project-local CompassRose configuration document with a YAML configuration block, allowed values, override records, isolation rules, and a stabilized MVP Doctor contract.

CompassRose can load that project-local configuration, validate the MVP doctor contract, and report repository readiness checks through `compassrose doctor`, including a distinct preflight for the configured project-state document.

The accepted architecture documentation already supports repository-local state, hierarchical configuration precedence, non-invasive external tool integration, configurable review policy, and quality-gate configuration. The MVP contract for Doctor is explicit: only the project-level scope in `docs/compassrose/CONFIG.md` is in scope, the minimum required sections and fields are fixed, and command semantics distinguish missing keys from intentionally empty values.

This feature is formalized under `docs/features/002-configuration-model/`, and the first implementation tasks have been completed against the configuration target defined in `docs/compassrose/CONFIG.md`.

Task `F002-T04` was approved, extending the typed config loader to validate and expose `execution`, `roles`, and `git_policy` data from the canonical project config.

Task `F002-T05` connects the validated configuration policy to the default CLI runtime preflight. Its implementation passed, but the quality gate (`npm test`) initially failed. Diagnosis found the failure was a false negative in the `state-correction-missing-active-task` e2e scenario in `proto/protoCompassRose.e2e.ts`: the scenario's seeded fallback task artifact and its assertions referenced different task ids (`F002-T05` vs. `F002-T04`), a drift introduced by an earlier rename that never touched all occurrences. The e2e harness was fixed to derive the expected id from a single shared constant instead of duplicating it, the full quality gate suite now passes (58/58 tests, clean typecheck), and `F002-T05` is ready for review.

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

Fixed a false-negative quality-gate failure for `F002-T05`: the `state-correction-missing-active-task` e2e scenario asserted on a stale `F002-T04` id while seeding an `F002-T05` fallback artifact. The scenario now derives both from one shared constant.

## Known Gaps

- The project-local configuration flow still needs a runtime consumer that uses the validated `execution`, `roles`, and `git_policy` data during orchestration.
- The correction-task id allocator (`buildStateCorrectionTaskId` in `proto/protoCompassRose.ts`) has no cycle or depth limit; a prior recovery loop against `F002-T04-C3` generated thousands of near-duplicate correction docs before being stopped manually. Not yet addressed.

## Next Planning Hint

Execute correction subtask `F002-T05-C1` next.
