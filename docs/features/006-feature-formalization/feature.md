# Feature: Feature Formalization

## Status

Formalized

## Purpose

Define how CompassRose transforms a pending feature request into the canonical feature documentation set used for later planning and execution.

## Problem It Solves

When a feature exists only as `request.md`, the repository lacks the structured purpose, architecture, and state documents needed to plan work deterministically and keep feature intent aligned with repository reality.

## Scope

This feature includes:

- detecting feature folders that contain `request.md` but do not yet contain the canonical generated documents
- generating `feature.md`, `architecture.md`, and `state.md` in the same feature folder
- preserving the existing CompassRose templates and documentation model
- clarifying purpose, scope, out-of-scope boundaries, expected behavior, dependencies, current status, and next implementation direction
- keeping the generated documents editable by humans after formalization

This feature does not include:

- implementing the requested feature itself
- generating a long-lived task backlog
- replacing human ownership of the generated documentation
- changing repository behavior outside the documentation flow required for feature formalization

## User-Facing Behavior

Users should be able to place a plain-language feature request in a numbered feature folder and expect CompassRose to produce the standard documentation set that:

- keeps the original request alongside the generated documents
- makes the feature ready for task planning without implementing it yet
- documents architectural boundaries and dependencies for the feature
- records the current repository reality and the next planning hint

## Acceptance Criteria

- a pending feature request can be formalized into `feature.md`, `architecture.md`, and `state.md`
- the generated documents follow CompassRose templates and documentation conventions
- the generated documents clearly separate scope from out-of-scope work
- the generated state document records formalization status and the next implementation direction
- formalization does not perform implementation work for the requested feature

## Implementation Deliverables

- canonical feature formalization documents under `docs/features/006-feature-formalization/`
- a documented rule for converting `request.md` into `feature.md`, `architecture.md`, and `state.md`
- documented boundaries for what formalization may and must not do
- a state model entry point that allows later task planning to start from a formalized feature

## Completion Criteria

This feature is considered implemented when:

- CompassRose can detect a pending feature request and create the canonical feature documents
- the generated documents are structurally consistent with the repository templates and documentation model
- the resulting feature state is ready to transition into task planning
- the acceptance criteria are satisfied without implementing the requested feature itself

## Implementation Outline

1. Formalize the feature-formalization request into canonical feature documents
2. Define the repository boundaries, inputs, and outputs for the formalization flow
3. Implement the workflow that detects pending feature requests and generates the canonical documents
4. Connect the resulting feature state to the next-step planning flow

## Relationship to CompassRose Principles

This feature reinforces the core CompassRose principles:

- documentation is the primary interface for project intent
- the repository is the source of truth for planning inputs
- features must be formalized before task planning begins
- generated documentation must remain human-readable and human-editable
