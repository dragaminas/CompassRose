# Task F002-T15-DOCTOR-RECOVERY-R1: Correct the generic external_cli planner handoff

## Task ID
`F002-T15-DOCTOR-RECOVERY-R1`

## Task Lineage

- previous_task_id: `F002-T15`

## Parent Feature
`002-configuration-model`

## Goal
Repair the task_planning_pending planner invocation so an empty or missing configured command fails explicitly, while a configured external_cli command and its arguments are passed unchanged and invoked exactly once, allowing recovery to restore F002-T15 to implementation_running.

## First Executable Step
Edit tests/main.test.ts first to add observable invocation-count and exact-argument assertions for the configured planner, plus empty and missing command failure cases.

## Minimum Progress Evidence
- tests/main.test.ts records and asserts exactly one planner invocation with the configured arguments received unchanged.
- tests/main.test.ts asserts that empty or missing planner commands return non-zero, emit the existing task-planning diagnostic through stderr, omit successful dispatch output, and leave task_planning_pending state unchanged.
- src/cli/main.ts passes the configured command and args directly through the existing process-invocation mechanism without extension-based interpreter substitution, and the focused task_planning_pending gate passes.

## Trace
- Roadmap objective: Define and use a repository-local configuration model as CompassRose's source of runtime policy.
- Feature goal: Connect the documented external_cli configuration and runtime policy to deterministic execution without provider-specific behavior.
- State gap: Feature 002-configuration-model is quality_failed with active_task F002-T15; the reported planner handoff defects must be corrected before restoring implementation_running.

## Context
- A recoverable quality failure requires a bounded doctor correction in the task_planning_pending external_cli handoff. The configuration contract defines adapters.external_cli.command and args, and the feature requires provider-independent, non-invasive integration. The feature and project state must remain unchanged by this source/test correction; the runtime owns restoration to the fixed target.

## Scope
Allowed:
- `src/cli/main.ts`
- `tests/main.test.ts`

Forbidden:
- `Any repository path not listed in scope.allowed_paths`
- `docs/compassrose/CONFIG.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/002-configuration-model/**`
- `src/contracts/**`
- `src/config/**`
- `src/orchestrator/**`
- `proto/**`
- `Provider-specific adapters and external-tool global configuration`

## Constraints
- Execute the configured adapters.external_cli.command as an opaque command and pass adapters.external_cli.args unchanged and in order.
- Do not substitute node, python, cmd, powershell, or another interpreter based on the command extension; do not discard configured arguments or force shell wrapping.
- For this runtime branch, an empty or missing planner command is unavailable and must follow the existing task-planning failure path; do not change the Doctor MVP rule that a present empty command key is valid configuration syntax.
- Use only the existing task_planning_pending branch, process-invocation mechanism, stdout/stderr reporting, state persistence behavior, and test workspace mechanisms.
- Do not modify feature state, project state, configuration documents, contracts, task documents, orchestrator behavior, provider selection, or global external-tool settings.
- Treat the supplied recovery lesson as advisory evidence to verify through tests; do not invent manifests, validators, or runtime artifact types.
- This is a doctor recovery executed with no_review_loop; after its re-entry gates pass, the runtime must restore the fixed target exactly.

## Development Policy
- `test_guided`

## Acceptance Criteria
- When adapters.external_cli.command is empty or missing for a task_planning_pending feature, the runtime returns non-zero, emits the existing task-planning diagnostic through stderr, does not emit the successful dispatch report, and leaves the task_planning_pending state content unchanged.
- When configured, adapters.external_cli.command is invoked exactly once through the existing process-invocation mechanism.
- The configured external_cli command and adapters.external_cli.args are forwarded verbatim; no extension-based interpreter substitution, shell rewriting, or argument loss occurs.
- Successful planner output and the existing task-planning dispatch report remain observable without changing the task_planning_pending state.
- Only src/cli/main.ts and tests/main.test.ts are changed, and all doctor re-entry quality gates pass.
- After the doctor recovery gates pass, restoration is exactly lifecycle_state=implementation_running, active_task=F002-T15, active_correction_task=none, active_unblock_task=none.

## Files Likely Affected
- `src/cli/main.ts`
- `tests/main.test.ts`
- `docs/compassrose/CONFIG.md`
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `docs/features/002-configuration-model/state.md`

## Quality Gates to Run
```bash
npx vitest run tests/main.test.ts -t "task_planning_pending"
npm run typecheck
npm test
git diff --check
```

## Expected Deliverables
- `code`
- `tests`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: unknown
- signature: unknown-quality-failed-feature-002-configuration-model-is-in-quality-failed-and-needs-diagnosis-
- recoverability: agent
- observed_state: lifecycle=quality_failed; active_task=F002-T15; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is in quality_failed and needs diagnosis/autocorrection before normal execution can resume.
- evidence: None
- evidence: lifecycle=quality_failed

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `F002-T15`
- active_correction_task: `none`
- active_unblock_task: `none`
