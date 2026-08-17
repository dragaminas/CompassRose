# Task F002-T04-C2-U1-U1-C1-C1-U1: Tighten the F002-T04-C2-U1-U1-C1-C1 resubmission task so the compliant diff stays visible

## Task ID
`F002-T04-C2-U1-U1-C1-C1-U1`

## Parent Feature
`002-configuration-model`

## Goal
Update the current correction-task document so the next retry recreates the already-diagnosed single-path resubmission for `F002-T04-C2-U1` without committing away the reviewable diff, allowing CompassRose to restore `task_ready` for `F002-T04-C2-U1-U1-C1-C1`.

## First Executable Step
Edit `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-U1-C1-C1-resubmit-the-retry-restoration-target-task-with-a-single-path-diff-and-compliant-implementation-notes.md` to add a submission-preservation section that cites `.git/proto-compassrose/implementation-attempts/F002-T04-C2-U1-U1-C1-C1.json`, records `changed_files: []`, and states that the next retry must leave the single allowed path visible in `git diff --name-only` instead of running `git commit` before handoff.

## Minimum Progress Evidence
- `git diff --name-only` returns exactly `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-U1-C1-C1-resubmit-the-retry-restoration-target-task-with-a-single-path-diff-and-compliant-implementation-notes.md`.
- The diff adds explicit failure evidence from `.git/proto-compassrose/implementation-attempts/F002-T04-C2-U1-U1-C1-C1.json`, including the empty `changed_files` outcome and the requirement that the next retry keep the downstream task-document change visible in the live reviewable diff while preserving the nested `implementation.notes` requirement.

## Trace
- Roadmap objective: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- Feature goal: Connect configuration validation to the doctor/runtime flow and update state based on approved behavior.
- State gap: Feature `002-configuration-model` is stuck in `implementation_failed` because the last recovery attempt for `F002-T04-C2-U1-U1-C1-C1` described the intended single-path resubmission in raw output but left no live reviewable diff for the runtime to capture.

## Context
- The prior review already narrowed the correction scope to a single task-document diff and required a non-empty nested `implementation.notes` field. The latest attempt artifact shows that the implementer understood those requirements, reverted the forbidden state-file edits, and reported the correct single-path diff in raw output, but then committed the change so the normalized attempt no longer exposed repository progress. This unblock task should only tighten the current correction-task interface so the next retry leaves the compliant change visible to the runtime and does not reopen the downstream code fix or state cleanup.

## Scope
Allowed:
- `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-U1-C1-C1-resubmit-the-retry-restoration-target-task-with-a-single-path-diff-and-compliant-implementation-notes.md`

Forbidden:
- `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `.git/proto-compassrose/implementation-attempts/F002-T04-C2-U1-U1-C1-C1.json`
- `proto/protoCompassRose.ts`
- `tests/resolveImplementationFailureActiveTask.test.ts`

## Constraints
- Keep this unblock task documentation-only and edit only the current correction-task document.
- `docs/features/002-configuration-model/state.md`, `docs/compassrose/PROJECT_STATE.md`, and `.git/proto-compassrose/implementation-attempts/F002-T04-C2-U1-U1-C1-C1.json` are background evidence only for this recovery and must not appear in the submitted diff.
- Preserve the downstream single-path retry contract for `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md`, including its `context_overflow` evidence and its `blockedBy` / two-file retry scope for `proto/protoCompassRose.ts` and `tests/resolveImplementationFailureActiveTask.test.ts`.
- Make the current failure mode explicit: the next retry must leave the reviewable change visible in the live worktree diff and must not run `git commit` or otherwise clean away the diff before handoff.
- Retain the requirement that the implementation artifact expose a non-empty nested `implementation.notes` field rather than only a top-level `implementation_notes` value.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The updated correction-task document explicitly cites `.git/proto-compassrose/implementation-attempts/F002-T04-C2-U1-U1-C1-C1.json` as the current blocker evidence and explains that the last attempt ended with a clean reviewable diff (`changed_files: []`) even though the raw output described a compliant resubmission.
- The updated correction-task document keeps the previous single-path submission scope intact: `docs/features/002-configuration-model/state.md` and `docs/compassrose/PROJECT_STATE.md` remain background evidence only, and the downstream `F002-T04-C2-U1` task document remains the only intended reviewable diff for the later retry.
- The updated correction-task document states that the later retry must leave the one-file reviewable diff visible in live `git diff --name-only`, must not run `git commit` or otherwise clear the diff before handoff, and must still satisfy the nested `implementation.notes` requirement.
- The submitted diff for this unblock task contains exactly one changed file: `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-U1-C1-C1-resubmit-the-retry-restoration-target-task-with-a-single-path-diff-and-compliant-implementation-notes.md`.

## Files Likely Affected
- `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-U1-C1-C1-resubmit-the-retry-restoration-target-task-with-a-single-path-diff-and-compliant-implementation-notes.md`
- `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md`
- `.git/proto-compassrose/implementation-attempts/F002-T04-C2-U1-U1-C1-C1.json`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/runtime/operation-loop.md`

## Quality Gates to Run
```bash
git diff --check
test "$(git diff --name-only)" = "docs/features/002-configuration-model/tasks/F002-T04-C2-U1-U1-C1-C1-resubmit-the-retry-restoration-target-task-with-a-single-path-diff-and-compliant-implementation-notes.md"
grep -F '.git/proto-compassrose/implementation-attempts/F002-T04-C2-U1-U1-C1-C1.json' 'docs/features/002-configuration-model/tasks/F002-T04-C2-U1-U1-C1-C1-resubmit-the-retry-restoration-target-task-with-a-single-path-diff-and-compliant-implementation-notes.md'
grep -F 'changed_files: []' 'docs/features/002-configuration-model/tasks/F002-T04-C2-U1-U1-C1-C1-resubmit-the-retry-restoration-target-task-with-a-single-path-diff-and-compliant-implementation-notes.md'
grep -F 'git diff --name-only' 'docs/features/002-configuration-model/tasks/F002-T04-C2-U1-U1-C1-C1-resubmit-the-retry-restoration-target-task-with-a-single-path-diff-and-compliant-implementation-notes.md'
grep -F 'git commit' 'docs/features/002-configuration-model/tasks/F002-T04-C2-U1-U1-C1-C1-resubmit-the-retry-restoration-target-task-with-a-single-path-diff-and-compliant-implementation-notes.md'
grep -F 'implementation.notes' 'docs/features/002-configuration-model/tasks/F002-T04-C2-U1-U1-C1-C1-resubmit-the-retry-restoration-target-task-with-a-single-path-diff-and-compliant-implementation-notes.md'
```

## Expected Deliverables
- `documentation`

## Blocker Context

- kind: implementation_failure
- signature: implementation-failure-implementation-failed-feature-002-configuration-model-is-in-implementatio
- recoverability: agent
- observed_state: lifecycle=implementation_failed; active_task=none; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is in implementation_failed; plan a bounded recovery unblock task that restores task readiness for F002-T04-C2-U1-U1-C1-C1.
- evidence: - kind: implementation_failure
- evidence: lifecycle=implementation_failed

## Restoration Target

- lifecycle_state: task_ready
- active_task: `F002-T04-C2-U1-U1-C1-C1`
- active_correction_task: `none`
- active_unblock_task: `none`
