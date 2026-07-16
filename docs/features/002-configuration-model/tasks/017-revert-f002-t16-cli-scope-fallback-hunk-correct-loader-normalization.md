# Task 017: Revert F002-T16 CLI-scope fallback hunk + Correct loader normalization

## Task ID
`F002-T17`

## Parent Feature
`002-configuration-model`

## Goal
Remove the F002-T16 CLI-scope leak (git_policy fallback hunk in `src/cli/main.ts`) and correct loader normalization so omitted MVP policy fields remain acceptable without losing existing canonical configuration data or silently accepting malformed present values.

## First Executable Step
Add 2 new tests to tests/configReader.test.ts — "rejects malformed present optional adapter fields" and "rejects non-object optional policy sections".

## Minimum Progress Evidence
- `src/cli/main.ts` no longer contains the F002-T16 fallback hunk (`git_policy ??= { require_clean_worktree_before_task: true, allow_dirty_worktree: false }`); replaced with direct access + runtime guard returning error 1 if `git_policy` is missing.
- `src/config/configTypes.ts` has `ExternalCliAdapterSection` fields (`command`, `args`, `stdin`, `input_file_argument`, `output_file`) as optional; `git_policy` is optional in `ProjectConfiguration`.
- `src/config/configReader.ts` has no duplicate silent-default extraction block; validates present-but-malformed `external_cli` fields; guards all 7 optional policy sections with `isRecord()`; extracts `extraConfigurationFields` to preserve canonical top-level data.
- `tests/configReader.test.ts` contains 2 new tests for malformed adapter fields and non-object policy sections.
- `npm run typecheck` — clean.
- `npm test` — 334 pass, 1 skip.

## Trace
- Roadmap objective: Provide a validated repository-local configuration contract that CompassRose can read and check as its project-level runtime policy.
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: F002-T16 introduced a CLI-scope fallback hunk that leaked into `src/cli/main.ts`, violating the task boundary. The config loader also lacked validation for present-but-malformed optional fields and guards for non-object policy sections.

## Context
- F002-T16 is recorded as completed but leaked changes into `src/cli/main.ts` outside its allowed scope. This task reverts that leak and corrects the loader normalization to properly handle optional fields.

## Scope
Allowed:
- `src/config/configTypes.ts`
- `src/config/configReader.ts`
- `tests/configReader.test.ts`
- `src/cli/main.ts` (only to revert the F002-T16 fallback hunk)

Forbidden:
- `src/orchestrator/`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/compassrose/CONFIG.md`
- `docs/compassrose/CONFIG.md`
- `task artifacts outside the allowed test and configuration files`
- `provider-specific adapters`
- `external-tool global configuration`
- `planner invocation, feature selection, lifecycle transitions, or other orchestration behavior`

## Constraints
- The F002-T16 fallback hunk in `src/cli/main.ts` must be fully reverted; `git_policy` access should use direct access with a runtime guard returning error 1 if missing.
- `ExternalCliAdapterSection` optional fields must remain optional; present-but-malformed values must return diagnostics, not silently accept defaults.
- All 7 optional policy sections (`execution`, `roles`, `git_policy`, `development_policy`, `review_policy`, `quality_gates`, `limits`) must have `isRecord()` guards — null/non-object values return diagnostics.
- `extraConfigurationFields` extraction must preserve canonical top-level data without overriding explicitly typed fields.
- `as ProjectConfiguration` type assertion on return must resolve TypeScript conflict.

## Development Policy
- `test_guided`

## Acceptance Criteria
- `src/cli/main.ts` no longer contains the F002-T16 fallback hunk; `git_policy` is accessed directly with a runtime guard.
- `src/config/configTypes.ts` has all specified fields as optional.
- `src/config/configReader.ts` validates present-but-malformed optional adapter fields and policy sections.
- `src/config/configReader.ts` preserves canonical top-level data via `extraConfigurationFields`.
- `tests/configReader.test.ts` contains tests rejecting malformed adapter fields and non-object policy sections.
- `npm run typecheck` passes clean.
- `npm test` passes (334 pass, 1 skip; pre-existing failures in `protoBlockerFlows.test.ts` are unrelated).
- `git diff --check` shows no trailing whitespace issues.
- No changes to forbidden paths outside the task boundary.

## Files Likely Affected
- `src/config/configTypes.ts`
- `src/config/configReader.ts`
- `src/cli/main.ts`
- `tests/configReader.test.ts`

## Quality Gates to Run
```bash
npm run typecheck
npm test
git diff --check
```

## Expected Deliverables
- `code`
- `tests`

## Completion Record
- **Status**: Completed
- **Date**: 2026-07-16
- **Verification**:
  - `npm run typecheck` — clean
  - `npm test` — 334 pass, 1 skip
  - `git diff --check` — no trailing whitespace issues
  - Scope compliance: No changes to forbidden paths
