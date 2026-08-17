# Task 009: Enforce configured Git worktree policy at CLI preflight

## Task ID
`F002-T09`

## Parent Feature
`002-configuration-model`

## Goal
Make the no-argument CLI enforce the effective git_policy worktree rules before runtime selection can continue.

## First Executable Step
Add a failing test in tests/main.test.ts that runs main([]) from a real temporary Git repository with a dirty worktree and require_clean_worktree_before_task enabled, asserting exit code 1 with runtime preflight and git_policy diagnostics.

## Minimum Progress Evidence
- tests/main.test.ts contains rejection and allowed-dirty cases for configured worktree policy.
- src/cli/main.ts checks the repository-root worktree before reporting successful preflight.
- Focused CLI tests demonstrate dirty-worktree rejection while preserving clean-worktree success and existing preflight checks.

## Trace
- Roadmap objective: Deterministic runtime orchestration
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: The CLI consumes typed execution, role, and partial git policy fields, but it does not yet evaluate the actual repository worktree against git_policy before runtime selection.

## Context
- F002-T08 is approved and the feature is back in formalized state with no active task. main([]) resolves the repository root, loads CONFIG.md, validates runtime policy, checks platform support, and then reports that no tasks will run. validateRuntimePreconditions currently detects conflicting git flags and role wiring, while the operation-loop contract requires the configured worktree policy to be satisfied before selecting work. CONFIG.md requires a clean worktree for the MVP. The prior external_cli recovery lesson has already been addressed in the current source and tests: enabled roles using defined non-external adapters are rejected, so this task must preserve that behavior rather than reopen it.

## Scope
Allowed:
- `src/cli/main.ts`
- `tests/main.test.ts`

Forbidden:
- `docs/compassrose/CONFIG.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/002-configuration-model/`
- `src/config/`
- `src/doctor/`
- `src/contracts/`
- `proto/`
- `global external-tool configuration files`

## Constraints
- Use the repository root already resolved by findGitRepositoryRoot(); nested working directories must evaluate the root worktree.
- A dirty worktree must fail preflight when require_clean_worktree_before_task is true.
- When the effective policy explicitly allows dirty worktrees, the new check must not reject them; preserve the existing conflicting-policy validation.
- Cover tracked and untracked worktree changes in the test fixtures.
- Keep the check before runtime selection or adapter invocation and preserve the existing no-task success message for valid clean configurations.
- Preserve existing repository, platform, role-enabled, external_cli-only adapter, and nested-directory preflight behavior.
- Do not modify documentation, contracts, provider configuration, or global tool settings.

## Development Policy
- `test_guided`

## Acceptance Criteria
- main([]) evaluates the repository-root worktree against the configured git_policy before reporting preflight success.
- A dirty worktree with require_clean_worktree_before_task enabled exits with code 1 and emits diagnostics containing runtime preflight and git_policy.
- A clean worktree with the canonical CONFIG.md continues to exit with code 0 and prints CompassRose preflight passed. No tasks to run.
- A dirty worktree is accepted when the configuration explicitly sets require_clean_worktree_before_task to false and allow_dirty_worktree to true.
- Existing conflicting git-policy, unsupported-platform, missing-repository, role-wiring, and external_cli-only adapter tests continue to pass.
- Only src/cli/main.ts and tests/main.test.ts are changed.

## Files Likely Affected
- `docs/compassrose/CONFIG.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/runtime/operation-loop.md`
- `src/config/configReader.ts`
- `src/cli/main.ts`
- `tests/main.test.ts`

## Quality Gates to Run
```bash
npx vitest run tests/main.test.ts
npm run typecheck
npm test
git diff --check
```

## Expected Deliverables
- `code`
- `tests`
