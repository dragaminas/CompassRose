# State: Project Identity and Foundation

## Status

In progress

## Active Feature

`002-configuration-model`

## Current Reality

- `docs/compassrose/PROJECT_STATE.md` exists as the repository-local project state document, and `docs/compassrose/CONFIG.md` already points at this path.
- Feature `001-project-identity-and-foundation` is now complete: the package metadata, TypeScript configuration, and top-level docs all align with the accepted CLI-first foundation and required repository roots.
- `package.json` points both `main` and `bin.compassrose` at `./dist/cli/main.js`, `tsconfig.json` preserves the Node CLI source/output layout without JSX assumptions, and the top-level docs expose `docs/`, `src/`, `src/contracts/`, and `docs/compassrose/PROJECT_STATE.md` in one pass.
- The active feature pointer currently targets `002-configuration-model`; the detailed task and lifecycle state for that feature lives in `docs/features/002-configuration-model/state.md`.
- Feature `002-configuration-model` now has a planned next task, `F002-T04`, ready to extend the typed config loader with the first runtime-precondition policy fields.
- `compassrose doctor` now validates `docs/compassrose/PROJECT_STATE.md` as a distinct preflight step before the broader runtime loop.

## Implemented

- `docs/compassrose/CONFIG.md` and `docs/compassrose/PROJECT_STATE.md` are present as the project-local operational documents.
- The feature-001 foundation documents are formalized under `docs/features/001-project-identity-and-foundation/`.
- The feature-002 configuration documents are formalized under `docs/features/002-configuration-model/`.
- The package metadata recovery bundle is accepted and backed by the configured validation commands.
- Feature `001-project-identity-and-foundation` now has aligned package metadata, TypeScript settings, and top-level foundation documentation.
- `compassrose doctor` now validates the configured project-state document as a dedicated runtime preflight check.

## Pending

- Execute `F002-T04` for the active feature.
- Continue updating this file with approved repository facts as feature work lands.

## Blocked

- None

## Last Approved Change

Task `F002-T03` was approved, accepting the distinct project-state preflight in `compassrose doctor` and the repository-local validation of `docs/compassrose/PROJECT_STATE.md`.

## Known Gaps

- Feature `002-configuration-model` now has a working runtime consumer for the project-local configuration contract plus a dedicated project-state preflight, but the broader runtime loop still needs validated `execution`, `roles`, and `git_policy` data from the config loader.

## Next Planning Hint

The active feature is `002-configuration-model`, and its next valid action is to execute `F002-T04`.
