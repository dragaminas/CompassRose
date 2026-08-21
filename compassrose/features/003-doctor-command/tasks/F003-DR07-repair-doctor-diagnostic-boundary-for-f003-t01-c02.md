# Task F003-DR07: Repair Doctor diagnostic boundary for F003-T01-C02

## Task ID
`F003-DR07`

## Task Lineage

- previous_task_id: `F003-DR06`

## Parent Feature
`003-doctor-command`

## Goal
Repair the existing feature-owned Doctor diagnostic boundary so the already-computed repository root, normalized platform, configuration path, normalized configuration, and ordered DoctorCheck results flow into the final report, readiness is false when any ordered check fails, and the fixed implementation task anchor can be restored.

## First Executable Step
Edit tests/doctor/doctorDiagnostics.test.ts to add failing assertions for runtime-fact propagation and readiness false for an ordered pass/fail DoctorCheck set.

## Minimum Progress Evidence
- A red test under tests/doctor/ demonstrates missing runtime facts and incorrect readiness for an ordered pass/fail check set.
- A source diff under src/doctor/ updates the existing diagnostic boundary and doctor-command wiring without null report placeholders or post-boundary metadata patching.
- After implementation, npx vitest run tests/doctor/doctorDiagnostics.test.ts and npm run typecheck both pass.

## Trace
- Roadmap objective: Make repository readiness observable before workflow execution.
- Feature goal: Provide a deterministic, read-only Doctor diagnostic model and coordinator with clear overall readiness reporting.
- State gap: The feature is quality_failed after F003-T01-C02; the diagnostic boundary and readiness evidence are insufficient, while recovery must restore implementation_running with F003-T01-C02 active.

## Context
- A review_failure blocked re-entry after F003-T01-C02 implementation. Target only the existing Doctor diagnostic boundary and its tests; use the existing ordered DoctorCheck flow and already-computed runtime facts. The provided full npm test failure is a task-scope-enforcement timeout outside this feature boundary, so it is preserved as blocker evidence and not repaired here.

## Scope
Allowed:
- `src/doctor/`
- `tests/doctor/`

Forbidden:
- `src/cli/`
- `tests/cli/`
- `src/config/`
- `src/orchestrator/`
- `src/adapters/`
- `src/roles/`
- `src/git/`
- `docs/compassrose/`
- `docs/features/`
- `all other repository paths`

## Constraints
- Execute this as a doctor recovery with executor_role=doctor and review_policy=no_review_loop; do not enter the normal reviewer loop.
- Preserve blocker signature review-failure-implementation-running-quality-gates-failed-after-implementing-f003-t01-c02-npm-t and its supplied evidence and lineage.
- Use the existing diagnostic context/report and ordered DoctorCheck mechanisms; do not invent a manifest, validator, or new artifact type.
- Carry the normalized configuration and existing repositoryRoot, currentPlatform, and configPath runtime facts through the boundary on success and failure paths; do not use null placeholders or patch report metadata after boundary construction.
- Cover all-pass and pass/fail ordered readiness, report metadata and check ordering, configuration non-mutation, success, and exitCode behavior.
- Keep later repository-readiness checks and CLI reporting/integration out of scope.
- Do not modify state or project documentation; after the listed recovery gates pass, the runtime applies the fixed restoration target exactly.
- Use only the listed doctor re-entry gates; do not inherit the active implementation task's failing npm test gate or edit unrelated task-scope tests.
- If any git diff ... --exit-code gate is added, it must use the explicit pre-recovery commit ref before the -- pathspec separator.

## Development Policy
- `test_guided`

## Acceptance Criteria
- The existing Doctor diagnostic boundary preserves normalized configuration, repository root, normalized current platform, and configuration path in the final DoctorReport on both success and failure paths without null placeholders or post-boundary patching.
- DoctorCheckContext readiness is derived from the existing ordered DoctorCheck results, is true when all checks pass, and is false when any ordered check fails.
- Tests under tests/doctor/ cover runtime-fact propagation, ordered all-pass and pass/fail readiness, report metadata and check order, configuration non-mutation, success, and exitCode behavior.
- The change remains within src/doctor/ and tests/doctor/ and does not expand into later readiness-check or CLI work.
- The recovery is accepted only through the listed targeted test and typecheck gates, with no normal review loop; successful gates permit restoration to implementation_running with F003-T01-C02 active and no correction or unblock task.

## Files Likely Affected
- `src/doctor/`
- `tests/doctor/`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`

## Quality Gates to Run
```bash
npx vitest run tests/doctor/doctorDiagnostics.test.ts
npm run typecheck
```

## Expected Deliverables
- `code`
- `tests`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: state_corruption
- signature: state-corruption-quality-failed-feature-003-doctor-command-is-in-quality-failed-and-needs-diagno
- recoverability: agent
- observed_state: lifecycle=quality_failed; active_task=F003-T01-C02; active_correction_task=none; active_unblock_task=none
- evidence: Feature 003-doctor-command is in quality_failed and needs diagnosis/autocorrection before normal execution can resume.
- evidence: - kind: review_failure
- evidence: - signature: review-failure-implementation-running-quality-gates-failed-after-implementing-f003-t01-c02-npm-t
- evidence: - recoverability: agent
- evidence: lifecycle=quality_failed

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `F003-T01-C02`
- active_correction_task: `none`
- active_unblock_task: `none`
