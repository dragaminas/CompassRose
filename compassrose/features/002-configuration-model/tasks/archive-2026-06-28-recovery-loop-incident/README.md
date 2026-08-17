# Archive: 2026-06-28 unbounded recovery-loop incident

This directory holds the task documents produced by a single runaway correction chain anchored
on `F002-T04-C3-U1-C1-U1`, all dated 2026-06-28. At the time, `correctState()` had no depth limit
on the `-C`/`-U` allocator: each repair attempt re-triggered the same condition, planned another
correction, committed it, and fell back into the same state — 2,804 commits and 2,805 task
documents in one day, stopped only by a manual human intervention (`chore: checkpoint compassrose
recovery cleanup`), not by any mechanism in the runtime itself.

This incident is the direct motivation for two later fixes:

- `docs/features/002-configuration-model/tasks/017-add-a-cycle-depth-limit-to-the-correction-task-id-allocator.md`
  (`F002-T17`), which bounds `-C` depth per anchor via `limitStateCorrectionTaskId`.
- `limits.max_recovery_iterations` in `docs/compassrose/CONFIG.md`, which bounds the sibling
  `doctor-recovery`/`unblock` cycle the same way (see the fragility diagnosis referenced below).

These documents are moved here, not deleted: they're the forensic record of the incident and the
concrete evidence behind both fixes above. They no longer need to sit in the active
`tasks/` directory, since:

- `F002-T04`'s own anchor is permanently superseded and never resumed (the feature's active task
  moved on long ago -- check `docs/features/002-configuration-model/state.md`'s `active_task`).
- Nothing in the runtime scans this subdirectory: `buildStateCorrectionTaskId`/`listExistingTaskIds`
  (`src/task/taskId.ts`, `src/orchestrator/taskRequests.ts`) both do a non-recursive `readdirSync`
  over `tasks/` itself and simply skip any entry that isn't a `.md` file at that top level,
  including this directory.

A handful of task documents from an earlier, unrelated `F002-T04-C2-*` sub-chain were deliberately
**not** moved here, because `tests/protoReviewableDiffHandoff.test.ts` parses them directly as
real-world fixtures for task-lineage/state-correction/unblock parsing:
`F002-T04-C2-U1-U1-C1-C1-resubmit-the-retry-restoration-target-task-with-a-single-path-diff-and-compliant-implem-77ec20d0.md`,
`F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md`,
`004.2-repair-feature-state-for-f002-t04.md`.
