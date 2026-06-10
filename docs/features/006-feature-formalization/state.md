# State: Feature Formalization

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

The repository already defines the feature documentation model in `docs/features/README.md`, `docs/DMS.md`, and the templates under `docs/templates/`. Features `001-project-identity-and-foundation` and `002-configuration-model` also show the expected output shape of successful formalization.

Feature `006-feature-formalization` is now itself formalized under the canonical document set, but no runtime or CLI implementation currently detects pending feature requests or generates these files automatically.

## Implemented Deliverables

- the source feature request exists at `docs/features/006-feature-formalization/request.md`
- canonical feature documents now exist for feature `006-feature-formalization`
- the repository already contains reusable templates for `feature.md`, `architecture.md`, and `state.md`
- repository contracts already describe the transition from request-only features to formalized features

## Remaining Deliverables

- implement detection of feature folders that contain `request.md` without the canonical generated documents
- implement generation of `feature.md`, `architecture.md`, and `state.md` from repository rules and templates
- validate that generated documents remain consistent, human-editable, and ready for task planning
- connect the formalization result to the next-step feature-planning flow

## Outline Progress

- Formalize the feature-formalization request into canonical feature documents: complete
- Define the repository boundaries, inputs, and outputs for the formalization flow: not started
- Implement the workflow that detects pending feature requests and generates the canonical documents: not started
- Connect the resulting feature state to the next-step planning flow: not started

## Blocked By

- None

## Last Approved Change

None

## Known Gaps

- No runtime implementation currently performs feature formalization automatically.
- The repository has not yet established the first implementation task for this feature.

## Next Planning Hint

Create the first task for feature `006-feature-formalization`. Prefer a small task that detects pending feature folders and generates the initial canonical documents from the existing templates and lifecycle rules.
