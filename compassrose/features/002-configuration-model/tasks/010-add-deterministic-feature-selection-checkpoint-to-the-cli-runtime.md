# Task 010: Add deterministic feature-selection checkpoint to the CLI runtime

## Task ID
`F002-T10`

## Parent Feature
`002-configuration-model`

## Goal
After the existing no-argument repository and configuration preflight succeeds, inventory repository feature folders and report the first non-completed feature according to the deterministic operation-loop rules.

## First Executable Step
Edit tests/main.test.ts to add a failing main([]) integration test with an earlier completed feature and a later formalized feature, asserting that the CLI selects the later feature after preflight passes.

## Minimum Progress Evidence
- tests/main.test.ts contains an executable feature-selection fixture and assertion.
- src/cli/main.ts contains the corresponding post-preflight feature-selection behavior.
- npx vitest run tests/main.test.ts passes after implementation.

## Trace
- Roadmap objective: Connect configuration validation to the broader runtime flow.
- Feature goal: CompassRose reads and uses the repository-local CONFIG.md contract as explicit runtime policy without provider-specific or global-tool behavior.
- State gap: The CLI currently stops after successful preflight with 'No tasks to run' and does not yet perform the deterministic feature inventory and selection required by the runtime operation loop.

## Context
- The feature state is formalized with no active task, so a new normal task is appropriate. The advisory F002-T09-C1 correction is already present in tests/main.ts: tracked-file coverage exists and both Git setup failure paths clean up with rmSync(root, ...) rather than referencing an undefined workspace handle. Do not duplicate that recovery work. The next bounded increment is the first deterministic runtime-loop checkpoint in the existing CLI entrypoint.

## Scope
Allowed:
- `src/cli/main.ts`
- `tests/main.test.ts`

Forbidden:
- `src/config/`
- `src/doctor/`
- `src/contracts/`
- `docs/`
- `Any other source or test path not listed in allowed_paths`

## Constraints
- Preserve the existing repository, configuration, platform, role, and Git preflight behavior and diagnostics.
- Run feature selection only after all existing no-argument preflight checks pass.
- Order feature directories by their numeric prefix and select at most one feature.
- Treat ## Lifecycle State as the primary lifecycle source; derive request_pending only when request.md exists and a required formalized file is missing, as defined by the feature-state contract.
- Ignore completed features; do not execute tasks, invoke an external adapter, mutate feature state, or implement provider-specific behavior.
- Report malformed or unknown feature lifecycle data as a deterministic runtime diagnostic and non-zero exit.
- Keep the doctor command routing unchanged.
- Do not modify documentation or contract files.

## Development Policy
- `test_guided`

## Acceptance Criteria
- With existing preflight checks passing, the CLI inventories numeric feature directories under docs/features and selects the first feature that is not completed.
- The lifecycle state used for selection follows the feature-state contract, including repository-derived request_pending and the ## Lifecycle State value for formalized feature folders.
- A fixture with an earlier completed feature and a later formalized feature produces exit code 0 and a deterministic stdout message identifying the selected feature and lifecycle state.
- When every discovered feature is completed, the CLI exits successfully with a deterministic no-selectable-feature message and does not invoke any role or task execution.
- Missing or malformed lifecycle data produces exit code 1 with a runtime feature-selection diagnostic and no successful selection message.
- All existing main([]) preflight failure tests and main(['doctor']) regression coverage continue to pass.

## Files Likely Affected
- `src/cli/main.ts`
- `tests/main.test.ts`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/CONFIG.md`
- `src/contracts/runtime/operation-loop.md`
- `src/contracts/state/feature-state.md`

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
