# Task F002-T07-C2-DOCTOR-RECOVERY-R2: Enforce MVP external_cli-only role wiring

## Task ID
`F002-T07-C2-DOCTOR-RECOVERY-R2`

## Task Lineage

- previous_task_id: `F002-T07-C2-DOCTOR-RECOVERY-R1`

## Parent Feature
`002-configuration-model`

## Goal
Tighten the existing runtime-preflight role-to-adapter validation and focused tests so every enabled runtime role accepts only the documented generic external_cli adapter, allowing the runtime to restore F002-T07-C2 to implementation_running.

## First Executable Step
Edit tests/main.test.ts to add a failing main([]) case where an enabled role references a defined adapter other than external_cli and assert exit code 1 with roles.<role>.adapter and runtime preflight diagnostics.

## Minimum Progress Evidence
- tests/main.test.ts contains rejection coverage for an enabled role referencing a defined non-external_cli adapter, while preserving missing-adapter rejection coverage.
- src/config/configReader.ts enforces that enabled planner, implementer, and reviewer roles use external_cli rather than merely accepting any defined adapter key.
- Focused role-wiring tests, npm run typecheck, npm test, and git diff --check pass with changes limited to the allowed paths.

## Trace
- Roadmap objective: Use the repository-local configuration model as the runtime source of policy for CompassRose.
- Feature goal: Complete configuration-model runtime integration with the documented MVP generic external_cli adapter boundary.
- State gap: The feature is blocked in unblock_pending because doctor recovery R1 failed its re-entry gates; its role validation accepts any defined adapter key instead of enforcing the documented external_cli-only MVP behavior.

## Context
- docs/compassrose/CONFIG.md and the configuration architecture state that the MVP supports only one generic external_cli adapter; provider-specific or additional adapter keys do not expand supported runtime behavior. The prior recovery added missing-adapter diagnostics but only checked adapter-key existence. Use the existing runtime-preflight path in src/config/configReader.ts and main([]) test coverage to enforce exact external_cli wiring. Do not edit state or project documents; the runtime restores the recorded implementation_running target after doctor gates pass.

## Scope
Allowed:
- `src/config/configReader.ts`
- `tests/main.test.ts`

Forbidden:
- `Any path not listed in scope.allowed_paths`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/compassrose/CONFIG.md`
- `src/cli/main.ts`
- `src/contracts/**`
- `docs/features/002-configuration-model/tasks/**`
- `tests/protoBlockerFlows.test.ts`
- `Global user or external-tool configuration files`

## Constraints
- Execute as the doctor role with no_review_loop semantics.
- Preserve F002-T07-C2 as the active task anchor; do not replan or replace it.
- An enabled planner, implementer, or reviewer role is valid only when its adapter is external_cli; preserve the existing field-specific roles.<role>.adapter runtime-preflight diagnostics.
- Preserve rejection of missing adapters, valid external_cli wiring, disabled-role behavior, existing execution/no-task behavior, and git-policy checks.
- Use the existing configuration fields and runtime-preflight mechanism; do not introduce provider-specific adapters, manifests, new validators, or new artifact types.
- Do not modify documentation, feature state, project state, task artifacts, or global tool configuration.

## Development Policy
- `test_guided`

## Acceptance Criteria
- An enabled planner, implementer, or reviewer role referencing a missing adapter produces a roles.<role>.adapter runtime-preflight issue and exits with code 1.
- An enabled planner, implementer, or reviewer role referencing a defined adapter other than external_cli produces a roles.<role>.adapter runtime-preflight issue and exits with code 1.
- An enabled role using external_cli with the valid documented adapters.external_cli configuration continues through preflight without adapter invocation or state mutation.
- Existing execution, disabled-role, git-policy, and no-task CLI behavior remains passing.
- The doctor recovery passes all re-entry quality gates with changes confined to src/config/configReader.ts and tests/main.test.ts.

## Files Likely Affected
- `docs/compassrose/CONFIG.md`
- `src/config/configReader.ts`
- `src/cli/main.ts`
- `tests/main.test.ts`

## Quality Gates to Run
```bash
npm run typecheck
npm test
git diff --check -- src/config/configReader.ts tests/main.test.ts
```

## Expected Deliverables
- `code`
- `tests`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: state_corruption
- signature: state-corruption-blocked-feature-002-configuration-model-is-blocked-and-needs-diagnosis-autocorr
- recoverability: agent
- observed_state: lifecycle=blocked; active_task=F002-T07-C2; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is blocked and needs diagnosis/autocorrection to choose bounded recovery or an explicit stop.
- evidence: - kind: unknown
- evidence: - signature: unknown-unblock-pending-doctor-recovery-f002-t07-c2-doctor-recovery-r1-failed-its-re-entry-quali
- evidence: - recoverability: agent
- evidence: lifecycle=blocked

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `F002-T07-C2`
- active_correction_task: `none`
- active_unblock_task: `none`
