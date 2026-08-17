# Task F002-T06-DOCTOR-RECOVERY-R1: Tighten F002-T06 implementation handoff

## Task ID
`F002-T06-DOCTOR-RECOVERY-R1`

## Task Lineage

- previous_task_id: `F002-T06`

## Parent Feature
`002-configuration-model`

## Goal
Update the recorded F002-T06 task interface to require only runtime-supported changed_files, git_diff, and implementation-notes evidence, then restore execution to F002-T06.

## First Executable Step
Open the F002-T06 task document and edit only its existing implementation/acceptance instructions to make the supported handoff requirements explicit.

## Minimum Progress Evidence
- The F002-T06 task document records the supported changed_files, git_diff, and non-empty implementation-notes requirements.
- git diff --name-only -- docs/features/002-configuration-model/tasks/006-expose-the-remaining-documented-runtime-policy-in-the-configuration-loader.md reports only that task document.
- The task-document diff passes git diff --check.

## Trace
- Roadmap objective: Implement the repository-local configuration model so CompassRose can read, validate, and use project-level runtime policy.
- Feature goal: Expose the remaining documented runtime policy through the configuration loader and continue connecting configuration validation to runtime behavior.
- State gap: Quality gates failed while F002-T06 remains the recorded active task; its recovery must tighten the supported handoff interface before re-entering implementation_running.

## Context
- The orchestrator reports a recoverable quality_failed checkpoint for F002-T06. The recent recovery lesson is advisory: use only handoff mechanisms confirmed by the runtime contract, and do not require unsupported fallback fields, context-path fields, or separate artifacts. State and project bookkeeping remain runtime-owned.

## Scope
Allowed:
- `docs\features\002-configuration-model\tasks\006-expose-the-remaining-documented-runtime-policy-in-the-configuration-loader.md`
- `src\contracts\runtime\operation-loop.md`
- `src\contracts\task\doctor-recovery-task.md`
- `docs\features\002-configuration-model\state.md`
- `docs\compassrose\PROJECT_STATE.md`

Forbidden:
- `src/config/**`
- `src/doctor/**`
- `src/cli/**`
- `tests/**`
- `all implementation or review artifacts not explicitly listed`
- `any path outside the allowed paths`

## Constraints
- Execute as the doctor role with no_review_loop semantics.
- Only the F002-T06 task document may be edited; state and project documents are read-only runtime references.
- Do not modify source, tests, configuration, or feature scope.
- Require only existing runtime evidence: changed_files, git_diff, and implementation-notes justification.
- Do not introduce fallback_changed_files, fallback_git_diff, implementation_context_paths, quality-gates.json, review.json, or a separate doctor handoff artifact.
- Preserve F002-T06 as historical lineage through previous_task_id.
- After successful recovery gates, restore exactly implementation_running with active_task F002-T06, active_correction_task none, and active_unblock_task none.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The F002-T06 task interface explicitly requires changed_files, git_diff, and a non-empty implementation-notes justification using mechanisms present in the runtime contract.
- No unsupported fallback field, context-path field, manifest, validator, or separate handoff artifact is required.
- The doctor recovery changes only the F002-T06 task document.
- The fixed restoration target is preserved exactly.
- The recovery does not enter the normal reviewer loop.

## Files Likely Affected
- `docs\features\002-configuration-model\tasks\006-expose-the-remaining-documented-runtime-policy-in-the-configuration-loader.md`
- `docs\features\002-configuration-model\state.md`
- `docs\compassrose\PROJECT_STATE.md`
- `src\contracts\task\doctor-recovery-task.md`
- `src\contracts\runtime\operation-loop.md`

## Quality Gates to Run
```bash
git diff --check -- "docs/features/002-configuration-model/tasks/006-expose-the-remaining-documented-runtime-policy-in-the-configuration-loader.md"
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
