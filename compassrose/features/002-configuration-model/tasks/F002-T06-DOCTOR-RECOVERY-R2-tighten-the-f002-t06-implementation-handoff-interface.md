# Task F002-T06-DOCTOR-RECOVERY-R2: Tighten the F002-T06 implementation handoff interface

## Task ID
`F002-T06-DOCTOR-RECOVERY-R2`

## Task Lineage

- previous_task_id: `F002-T06-DOCTOR-RECOVERY-R1`

## Parent Feature
`002-configuration-model`

## Goal
Repair only the active F002-T06 task interface so the next implementation attempt explicitly records the runtime-supported changed-files, Git-diff, implementation-diagnostics, and Implementation Notes evidence needed to diagnose the unknown quality failure, then restore the fixed implementation-running anchor.

## First Executable Step
Edit only docs/features/002-configuration-model/tasks/006-expose-the-remaining-documented-runtime-policy-in-the-configuration-loader.md to make the existing runtime handoff requirements explicit, without adding unsupported fields, artifacts, or validators.

## Minimum Progress Evidence
- The live Git diff contains a change only to the F002-T06 task document.
- The task document explicitly requires changed-files capture, Git-diff capture, implementation diagnostics, and a non-empty Implementation Notes justification.
- The task document does not require a new manifest, validator, fallback field, structured context-path field, or separate doctor handoff artifact.

## Trace
- Roadmap objective: Define and implement a repository-local configuration model that CompassRose can read, validate, and use as runtime policy.
- Feature goal: Expose the remaining documented runtime policy in the configuration loader and connect validated configuration to the doctor/runtime flow.
- State gap: The feature is recorded as quality_failed with active_task F002-T06 and no active correction or unblock task; the supplied evidence does not identify a gate-specific or source-specific defect, so the bounded recovery must tighten the existing handoff interface without guessing.

## Context
- The runtime diagnostic is authoritative: lifecycle=quality_failed, active task=F002-T06, and recovery is agent-recoverable. Prior recovery R1 restored this same anchor. The recent lesson is advisory; only handoff requirements already supported by the runtime contracts are carried forward. State and project-state bookkeeping remain runtime-owned.

## Scope
Allowed:
- `docs/features/002-configuration-model/tasks/006-expose-the-remaining-documented-runtime-policy-in-the-configuration-loader.md`

Forbidden:
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/compassrose/CONFIG.md`
- `src/**`
- `tests/**`
- `docs/features/001-project-identity-and-foundation/**`
- `any new implementation, review, quality-gate, or doctor-handoff artifact`

## Constraints
- Execute as the doctor role with no_review_loop semantics.
- Preserve blocker kind unknown and the exact blocker signature unknown-quality-failed-feature-002-configuration-model-is-in-quality-failed-and-needs-diagnosis-.
- Preserve F002-T06 as the task anchor; do not rename, replace, or complete it.
- Do not change feature state or project state; the runtime owns restoration and bookkeeping.
- Use only contract-supported handoff concepts: changed files, Git diff, raw or normalized implementation diagnostics, and required Implementation Notes justification.
- Do not add or require fallback_changed_files, fallback_git_diff, implementation_context_paths, a separate final doctor handoff artifact, a new manifest, or a validator.
- Do not modify source code or tests because the supplied blocker evidence does not identify a source or test defect.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- Only the active F002-T06 task document is modified.
- The active task interface explicitly requires the runtime-supported changed-files, Git-diff, implementation-diagnostics, and non-empty Implementation Notes evidence.
- The interface adjustment is limited to recovery and does not widen F002-T06 feature scope.
- No unsupported field, artifact type, manifest, or validator is introduced.
- The doctor recovery is not sent through the normal reviewer loop.
- After the doctor quality gate passes, restoration is exactly lifecycle_state=implementation_running, active_task=F002-T06, active_correction_task=none, active_unblock_task=none.

## Files Likely Affected
- `docs/features/002-configuration-model/tasks/006-expose-the-remaining-documented-runtime-policy-in-the-configuration-loader.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`
- `docs/compassrose/CONFIG.md`

## Quality Gates to Run
```bash
git diff --check -- docs/features/002-configuration-model/tasks/006-expose-the-remaining-documented-runtime-policy-in-the-configuration-loader.md
```

## Expected Deliverables
- `documentation`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: unknown
- signature: unknown-quality-failed-feature-002-configuration-model-is-in-quality-failed-and-needs-diagnosis-
- recoverability: agent
- observed_state: lifecycle=quality_failed; active_task=F002-T06; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is in quality_failed and needs diagnosis/autocorrection before normal execution can resume.
- evidence: None
- evidence: lifecycle=quality_failed

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `F002-T06`
- active_correction_task: `none`
- active_unblock_task: `none`
