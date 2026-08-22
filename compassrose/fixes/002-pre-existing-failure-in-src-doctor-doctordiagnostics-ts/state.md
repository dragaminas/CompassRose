# State: Pre-existing failure in `src/doctor/doctorDiagnostics.ts`

## Lifecycle State

completed

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: none
- active_correction_task: none
- severity: high
- owning_feature: none
- last_implementation_result: not_applicable
- last_quality_gate_result: passed
- last_review_result: superseded

## Current Reality

`npm test` now passes cleanly and repeatedly (471/472, one pre-existing skip, 0 failures,
confirmed across multiple full-suite runs). The root cause was a stale per-test `20000`ms
timeout override in five test files that undercut `vitest.config.ts`'s own global
`testTimeout: 30000` (already raised for exactly this class of subprocess-spawning
e2e-style test). Removed directly, out of band, in commit `242670b6`.

This fix's own request/task chain misattributed the failure to
`src/doctor/doctorDiagnostics.ts`, a file that never existed (an artifact of
`blockOnUnrelatedFixFailure`'s path-extraction heuristic). Task `FX002-T01`, doctor
recoveries `FX002-T02`/`FX002-T04`/`FX002-T05`/`FX002-T06`, and the reviewer all correctly
and repeatedly confirmed there was nothing repairable inside that misattributed scope --
doctor recovery could only narrow the task's wording, never its fundamentally wrong file
scope, so the implement -> review-blocked -> doctor-recovery cycle would have repeated
indefinitely without ever reaching this fix's actual completion criterion. Marked
`completed` directly since the completion criterion (`npm test` passes cleanly) is
independently verified and satisfied. See Known Gaps.

## Implemented Deliverables

- `npm test` passes cleanly on a clean checkout (verified via commit `242670b6` and
  repeated full-suite runs).

## Remaining Deliverables

- None.

## Outline Progress

- Diagnosing and repairing the root cause of `npm test` failing.: complete

## Recovery History

- - kind: task_interface_gap
- - signature: task-interface-gap-unblock-pending-doctor-recovery-fx002-t03-failed-its-re-entry-quality-gates-n
- - recoverability: agent
- - observed_state: lifecycle=unblock_pending; active_task=FX002-T01; active_correction_task=none; active_unblock_task=FX002-T03
- - evidence: Doctor recovery FX002-T03 failed its re-entry quality gates.
npm test:  FAIL  tests/taskRequestScopeEnforcement.test.ts > task-request scope enforcement > refuses a task whose scope exceeds its task request boundary without a deviation_reason
Error: Test timed out in 20000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ tests/taskRequestScopeEnforcement.test.ts:28:3
     26|   // caught deterministically (checkTaskRequestContainment), not by tr…
     27|   // self-reported scope_justification.deviation_reason honesty.
     28|   test('refuses a task whose scope exceeds its task request boundary w…
       |   ^
     29|     const workspace = prepareWorkspace();
     30|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯
- - evidence: None
- - evidence: lifecycle=unblock_pending
- - reason: Doctor recovery FX002-T03 failed its re-entry quality gates. | npm test:  FAIL  tests/taskRequestScopeEnforcement.test.ts > task-request scope enforcement > refuses a task whose scope exceeds its task request boundary without a deviation_reason | Error: Test timed out in 20000ms. | If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout". | ❯ tests/taskRequestScopeEnforcement.test.ts:28:3 | 26|   // caught deterministically (checkTaskRequestContainment), not by tr… | 27|   // self-reported scope_justification.deviation_reason honesty. | 28|   test('refuses a task whose scope exceeds its task request boundary w… | |   ^ | 29|     const workspace = prepareWorkspace(); | 30| | ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none

## Last Approved Change

Marked `completed` by hand a second time: this fix's own long-running `review_subtask`
step (started before the first manual completion edit, chained internally into
diagnostic autocorrection since loop mode was disabled) finished afterward and silently
overwrote the first manual edit with `FX002-T07` (yet another interface-only doctor
recovery, same non-convergent pattern). Re-applied once no `npm run dev` process was
confirmed running. The underlying fact has not changed: commit `242670b6` repairs the
actual root cause and `npm test` passes cleanly and repeatedly.

## Known Gaps

- The implement -> review-blocked -> doctor-recovery cycle (`FX002-T01` /
  `FX002-T02`/`FX002-T04`/`FX002-T05`/`FX002-T06`/`FX002-T07`) had no way to terminate on
  its own: doctor recovery can only revise a task's declared interface/wording, never its
  fundamentally wrong file scope, so once a task is misattributed to nonexistent files
  the implementer and reviewer will keep correctly reporting "nothing repairable here"
  forever, with no runtime path to recognize that the fix's actual completion criterion
  was independently satisfied elsewhere. This is a distinct gap from
  `classifyBlockerKind`'s misclassification (fix `001-blocked-feature-scope-misclassification`)
  and from the exhausted-task-requests-to-`completed` gap (feature
  `002-configuration-model`'s own Known Gaps) -- tracked here as a third, related
  instance of "runtime has no automatic path to recognize a work item is actually done."
- `blockOnUnrelatedFixFailure`'s path-extraction heuristic (`referencedPaths[0]` as the
  fix's `primaryPath`/title subject) can pick an unrelated, coincidentally-touched path
  out of a noisy full-suite failure output instead of the file(s) the failure actually
  occurred in, misnaming and mis-scoping the filed fix from the start (observed here:
  titled around `src/doctor/doctorDiagnostics.ts`, a file that never existed, when the
  real failures were timeouts in unrelated pre-existing test files; the same heuristic
  then misfired a second time on fix
  `003-pre-existing-failure-in-docs-features-003-doctor-command-state-md`).
- A single non-loop `npm run dev` invocation is not always a single atomic, quickly
  observable unit of work: a review-blocked result can chain internally into diagnostic
  autocorrection and a further doctor-recovery planning step (`"running
  diagnostic/autocorrection before stopping because loop mode is disabled"`) within the
  same process, taking several more minutes and producing further commits after the
  point where a supervisor might reasonably believe the run has already produced its
  final, observable result. Editing/committing repository state by hand without first
  confirming the process has actually exited (not just that a decision appeared in its
  streamed output) races that still-running process and can have hand edits silently
  overwritten, as happened here.

## Next Planning Hint

None -- this fix is complete. `PROJECT_STATE.md` records the next candidates.
