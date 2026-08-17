# Task F002-T05-C1-CLEANUP: Remove forbidden state-doc edits from the repo-root preflight fix handoff

## Task ID
`F002-T05-C1-CLEANUP`

## Parent Task
`F002-T05-C1`

## Parent Feature
`002-configuration-model`

## Goal
Produce a scope-clean follow-up handoff for `F002-T05-C1` by removing the accidental `docs/` state-file edits, while leaving the existing repo-root CLI preflight fix and regression tests intact.

## First Executable Step
Restore `docs/compassrose/PROJECT_STATE.md` and `docs/features/002-configuration-model/state.md` to their pre-attempt contents, then run `git diff --name-only` and confirm only `src/cli/main.ts` and `tests/main.test.ts` remain.

## Minimum Progress Evidence
- `git diff --name-only` lists only `src/cli/main.ts` and `tests/main.test.ts`.
- `npm run typecheck` passes.
- `npm test` passes.

## Review Findings
- The submitted diff leaks repository-state edits into `docs/compassrose/PROJECT_STATE.md`.
- The submitted diff leaks feature-state edits into `docs/features/002-configuration-model/state.md`.

## Scope
Allowed:
- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/002-configuration-model/state.md`

Forbidden:
- `src/cli/main.ts`
- `tests/main.test.ts`
- `src/contracts/`
- `src/doctor/`
- `src/config/`
- `src/git/`
- `proto/`
- `docs/compassrose/CONFIG.md`
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`

## Constraints
- Do not change the CLI root-resolution fix in `src/cli/main.ts`.
- Do not change the nested-directory regression coverage in `tests/main.test.ts`.
- Keep all repository-state/documentation changes out of the implementation handoff for this task.

## Acceptance Criteria
- The submitted diff no longer contains any changes under `docs/`.
- `src/cli/main.ts` still resolves `docs/compassrose/CONFIG.md` from the repository root before loading the default config.
- `tests/main.test.ts` still covers nested-directory passing and failing preflight behavior.
- `main(['doctor'])` remains unchanged.

## Quality Gates to Run
```bash
npm run typecheck
npm test
```
