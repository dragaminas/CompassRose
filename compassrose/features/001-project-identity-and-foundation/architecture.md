# Architecture: Project Identity and Foundation

## Purpose

Define the repository-level structure and documentation boundaries that make CompassRose recognizable as a project and usable as a foundation for later features.

## Relevant Modules

- `docs/`
- `docs/features/001-project-identity-and-foundation/`
- `docs/features/`
- `docs/templates/`
- `docs/compassrose/`
- `docs/ROADMAP.md`
- `docs/README.md`
- `docs/SAD.md`
- `docs/ADR.md`
- `docs/DMS.md`
- `docs/UX.md`
- `docs/compassrose/CONFIG.md`
- `src/`
- `src/cli/`
- `src/contracts/`
- `src/config/`
- `src/filesystem/`
- `src/git/`
- `src/doctor/`
- `src/platform/`
- `src/shared/`
- `package.json`
- `tsconfig.json`

## Documentation Structure

This feature validates the documentation layout used by CompassRose:

- feature requests live in `docs/features/<nnn>-<name>/request.md`
- formalized feature docs live alongside the request as `feature.md`, `architecture.md`, and `state.md`
- project-wide documentation lives under `docs/`
- operational CompassRose docs live under `docs/compassrose/`
- reusable templates live under `docs/templates/`

## Expected Project Foundation Files

The foundation should keep the following project artifacts coherent:

- `package.json` for CLI metadata and scripts
- `tsconfig.json` for TypeScript root/output conventions
- `src/` as the source root
- `src/contracts/` as the shared contract root
- `src/cli/main.ts` as the CLI entrypoint
- `docs/` as the documentation root
- `docs/ROADMAP.md` as the high-level roadmap
- `docs/compassrose/CONFIG.md` as the project-local configuration contract
- `docs/compassrose/PROJECT_STATE.md` as the project state document expected by later features

## Boundaries

This feature may affect:

- repository structure expectations
- documentation naming and placement
- project identity statements
- cross-platform assumptions

This feature must not affect:

- application behavior
- task generation
- orchestration loops
- provider-specific adapter design
- implementation details that belong to later features

## Dependencies

- the existing docs structure under `docs/`
- the current TypeScript CLI project layout
- the contract documents already present under `src/contracts/`
- the repository being the source of truth

## Constraints

- keep the foundation portable across Linux and Windows
- avoid introducing implementation-only assumptions into documentation
- keep the folder names stable for later feature references
- do not overfit the architecture to a single tool provider or execution mode

## Design Notes

- This feature is intentionally structural, not behavioral.
- The current repository already contains the main roots this feature names, so the work here is primarily about formalizing and preserving them.
- `docs/compassrose/PROJECT_STATE.md` is an important expected artifact for later features, but it is not created by this formalization step.

## Risks and Open Questions

- `docs/compassrose/PROJECT_STATE.md` is referenced in configuration but is not yet present in the repository.
- The package metadata currently treats the project as a CLI application; later features must preserve that identity while introducing behavior.
- Cross-platform expectations need to stay descriptive rather than drifting into platform-specific implementation prematurely.

