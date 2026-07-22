# State: 001-blocked-feature-scope-misclassification

## Lifecycle State

formalized

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: none
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: not_run
- last_quality_gate_result: unknown
- last_review_result: not_run
- last_unblock_result: not_run
- severity: medium
- owning_feature: none

## Current Reality

The project state records this fix as a known gap. The reported defect is in blocker classification and recovery routing: call sites that already know the cause currently allow the system to reconstruct blocker metadata from reason text. The request identifies the relevant sibling-feature scope and exhausted-task-request paths, plus an equivalent formalization-time sibling path.

The active project feature is `002-configuration-model`. The supplied project state records that feature’s recent blocker/recovery activity and separately identifies this fix as outstanding. No implementation, quality-gate, review, or unblock result has been recorded for this fix.

## Implemented Deliverables

- Fix scope, severity, transversal ownership, acceptance criteria, deliverables, completion criteria, and implementation outline have been formalized.

## Remaining Deliverables

- Add explicit blocker-kind and next-planning-hint inputs to the blocker recording/persistence path while retaining fallback classification.
- Update sibling-feature scope, exhausted-task-request, and equivalent formalization-time sibling paths to supply deterministic metadata.
- Add regression coverage for the two reported cases and fallback classification.
- Run the configured typecheck and test quality gates.

## Outline Progress

- Define the explicit blocker metadata contract with fallback classification: not started
- Update deterministic blocker call sites: not started
- Add regression coverage and run configured validation: not started

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none
- active_unblock_task: none

## Last Approved Change

None

## Known Gaps

- The request establishes the required deterministic behavior but does not specify the canonical blocker-kind literals or exact hint wording; implementation must align those values with the existing blocker taxonomy and planner conventions.
- The fix has not yet been implemented or validated by quality gates.

## Next Planning Hint

Plan the first bounded task around the existing blocker taxonomy and recording/persistence interface, confirming the canonical kind and hint values before updating the affected call sites. Keep regex classification as the fallback for callers that lack explicit cause information.
