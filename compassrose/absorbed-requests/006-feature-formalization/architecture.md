# Architecture: Feature Formalization

## Purpose

Define the documentation boundaries, required inputs, generated outputs, and constraints for turning a pending feature request into the canonical CompassRose feature documentation set.

## Relevant Modules

- `docs/features/`
- `docs/features/README.md`
- `docs/features/006-feature-formalization/`
- `docs/templates/feature.md`
- `docs/templates/architecture.md`
- `docs/templates/state.md`
- `docs/DMS.md`
- `docs/ROADMAP.md`
- `src/contracts/state/feature-state.md`
- `src/contracts/runtime/operation-loop.md`
- `src/contracts/planner/feature-planning-prompt.md`

## Documentation Structure

This feature depends on the existing CompassRose feature documentation model:

- a pending feature starts as `docs/features/<nnn>-<name>/request.md`
- formalization creates `feature.md`, `architecture.md`, and `state.md` beside that request
- the generated documents become the canonical inputs for later task planning
- the original `request.md` remains as the human-authored source request

## Boundaries

This feature may affect:

- how pending feature requests are detected
- how canonical feature documents are generated from repository templates and request content
- how feature lifecycle state moves from request-only to formalized
- how the next planning hint is captured after formalization

This feature must not affect:

- implementation of the requested feature itself
- execution of feature tasks
- review or correction behavior beyond the state shape needed after formalization
- unrelated repository documents outside the feature formalization flow

## Interfaces

### Inputs

- a numbered feature folder containing `request.md`
- the CompassRose feature document templates under `docs/templates/`
- repository documentation rules in `docs/features/README.md` and `docs/DMS.md`
- lifecycle semantics defined in `src/contracts/state/feature-state.md` and `src/contracts/runtime/operation-loop.md`

### Outputs

- `feature.md` describing feature intent, scope, acceptance criteria, and implementation outline
- `architecture.md` describing boundaries, dependencies, constraints, and design notes
- `state.md` describing lifecycle state, current reality, remaining deliverables, and the next planning hint

## Dependencies

- the numbered feature-folder structure under `docs/features/`
- the CompassRose document templates
- the feature-state lifecycle contract
- the runtime rule that formalized features become eligible for task planning

## Constraints

- preserve the human-authored `request.md` as an input, not a generated artifact
- keep generated documents editable by humans
- avoid inventing implementation details that are not supported by repository reality
- do not let formalization perform feature implementation work
- keep the generated structure consistent across all features

## Architectural Decisions

- formalization produces exactly three canonical documents: `feature.md`, `architecture.md`, and `state.md`
- generated feature documents live in the same feature folder as the source request
- `state.md` records that formalization is complete before task planning begins
- template-driven structure is preferred so later planning can rely on predictable documents

## Design Notes

- The repository already has the feature-folder layout, templates, and lifecycle contracts needed by this feature, so the missing capability is the repeatable formalization workflow.
- Formalization is a repository-documentation operation, not an implementation operation for the requested feature.
- This feature is a prerequisite for later documentation-engine and feature-centric-planning capabilities because both depend on canonical feature documents.

## Risks and Open Questions

- The repository does not yet implement an automated formalization workflow, so current formalizations are manual and may drift in style if the templates are not followed closely.
- Future work must define how much repository context may be used during formalization without turning the step into premature implementation design.
- Later automation must decide how to handle partially formalized feature folders that contain stale or incomplete generated documents.
