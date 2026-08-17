# Feature: Configuration Model

## Status

Formalized

## Purpose

Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.

## Problem It Solves

Without a formal configuration model, CompassRose would have no stable way to determine execution policy, role behavior, quality gates, command mappings, platform support, or documentation paths from repository-owned data.

## Scope

This feature includes:

- a project-local configuration contract centered on `docs/compassrose/CONFIG.md`
- documented configuration domains for execution mode, roles, external CLI adapter, development policy, review policy, quality gates, commands, git policy, limits, supported platforms, and documentation paths
- hierarchical configuration precedence with project-level support required for the MVP
- validation expectations for reading and checking repository-local configuration
- explicit non-invasive integration rules for external tools

This feature does not include:

- provider-specific adapters
- modifying global configuration of external tools
- full support for task-, feature-, or user-level configuration in the MVP
- implementation of unrelated orchestration features beyond the configuration contract they depend on

## User-Facing Behavior

Users should be able to inspect the repository and recognize:

- where CompassRose project configuration lives
- which configuration sections CompassRose understands
- which values and paths shape runtime behavior
- that project-local configuration is versioned with the repository
- that external tools are integrated without silently changing user-global settings

## Acceptance Criteria

- `docs/compassrose/CONFIG.md` is treated as the canonical project-level configuration document
- the configuration hierarchy is documented as `Task > Feature > Project > User > CompassRose Defaults`
- the MVP scope is explicit that only project-level configuration must be supported now
- the configuration model covers the requested policy, adapter, command, limits, platform, and documentation-path domains
- configuration validation expectations are documented clearly enough to support future doctor/runtime implementation
- the feature documentation keeps provider-specific adapters out of scope for the MVP

## Implementation Deliverables

- formalized feature documents under `docs/features/002-configuration-model/`
- a documented project-local configuration contract in `docs/compassrose/CONFIG.md`
- a defined set of configuration sections, allowed values, and validation expectations for the MVP
- explicit repository-local rules for non-invasive external tool integration

## Completion Criteria

This feature is considered implemented when:

- CompassRose can read the project-local configuration from `docs/compassrose/CONFIG.md`
- the configuration structure and validation rules are implemented consistently with the documented contract
- the doctor/runtime flow can report configuration validity and required repository paths from this model
- the acceptance criteria are satisfied without introducing provider-specific behavior or global-tool mutation

## Implementation Outline

1. Formalize the configuration model in canonical feature documents
2. Stabilize the project-local configuration contract and any gaps in `docs/compassrose/CONFIG.md`
3. Implement configuration loading and validation for the documented MVP scope
4. Connect configuration validation to the doctor/runtime flow and update state based on approved behavior
5. Add a cycle/depth limit to the correction-task id allocator (`buildStateCorrectionTaskId`)

## Relationship to CompassRose Principles

This feature reinforces the core CompassRose principles:

- repository-local documentation is the source of truth for project intent
- configuration should be explicit, versioned, and reviewable
- more specific scopes override less specific scopes
- external AI tooling must remain provider-independent and non-invasive at the project boundary
