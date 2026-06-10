# Architecture: Configuration Model

## Purpose

Define the repository-local configuration surfaces, boundaries, and constraints that future loading, validation, doctor, and orchestration code must follow.

## Relevant Modules

- `docs/features/002-configuration-model/`
- `docs/compassrose/CONFIG.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/ADR.md`
- `docs/SAD.md`
- `docs/DMS.md`
- `src/config/`
- `src/doctor/`
- `src/contracts/runtime/operation-loop.md`
- `src/contracts/state/feature-state.md`

## Documentation Structure

This feature depends on the existing CompassRose documentation model:

- the human-facing configuration contract lives in `docs/compassrose/CONFIG.md`
- structured configuration is expressed inside Markdown YAML blocks
- formalized feature docs live beside the request as `feature.md`, `architecture.md`, and `state.md`
- project-wide rationale remains in `docs/SAD.md`, `docs/ADR.md`, and `docs/DMS.md`

## Boundaries

This feature may affect:

- the schema and wording of `docs/compassrose/CONFIG.md`
- future configuration-loading and validation code under `src/config/`
- doctor checks that validate configuration presence, shape, and referenced paths
- runtime policy interpretation that depends on execution mode, review policy, quality gates, and limits

This feature must not affect:

- provider-specific adapter design
- global configuration files of external tools
- unrelated task, review, or orchestration behavior outside the documented configuration contract
- repository structure outside the configuration and state artifacts needed by this feature

## Interfaces

### Inputs

- the repository-local configuration document at `docs/compassrose/CONFIG.md`
- repository paths referenced by configuration fields
- current platform and git-repository facts used during validation
- future higher-precedence overrides from task, feature, or user scope

### Outputs

- an effective project-level configuration model for CompassRose
- validation results for missing sections, invalid values, unsupported platforms, and missing referenced paths
- doctor/runtime decisions informed by execution mode, policies, commands, and limits

## Dependencies

- ADR-0023 repository-local configuration
- ADR-0025 non-invasive tool integration
- ADR-0026 hierarchical configuration
- ADR-0029 configurable review policy
- ADR-0030 quality gates before acceptance
- the Markdown-first YAML-in-Markdown rule in `docs/DMS.md`
- the existing `docs/compassrose/CONFIG.md` document already present in the repository

## Constraints

- keep the MVP centered on project-level configuration even though the hierarchy is broader
- preserve the precedence order `Task > Feature > Project > User > CompassRose Defaults`
- keep configuration readable in Markdown and parseable from YAML blocks
- avoid hardcoding provider selection or mutating external-tool global state
- keep platform assumptions limited to Linux and Windows support already documented by the foundation

## Architectural Decisions

- the canonical project-level configuration source is `docs/compassrose/CONFIG.md`
- configuration expresses policies, commands, paths, and adapter wiring as repository-owned data
- external AI tools are integrated through a generic external CLI adapter in the MVP
- validation must include both schema-like checks and repository-path existence checks

## Design Notes

- The repository already contains a rich draft configuration document, so near-term work should align implementation to that contract instead of inventing a second source of truth.
- The hierarchy is architectural now, but only the project scope needs concrete runtime support for the MVP.
- Doctor is the first concrete consumer of this feature because it can validate file presence, structure, paths, platform support, and command availability before broader orchestration exists.

## Risks and Open Questions

- The exact runtime representation of future task-, feature-, and user-level overrides is not implemented yet.
- Some configuration fields in `docs/compassrose/CONFIG.md` describe future features, so implementation order must avoid pretending unsupported behavior already exists.
- The project will need a stable rule for intentionally empty command fields versus missing required commands during validation.
