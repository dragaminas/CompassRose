# State: Pre-existing failure in `src/doctor/doctorDiagnostics.ts`

## Lifecycle State

blocked

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: FX002-T01
- active_correction_task: none
- active_unblock_task: none
- severity: high
- owning_feature: none
- last_implementation_result: passed
- last_quality_gate_result: failed
- last_review_result: blocked
- last_unblock_result: not_run
- doctor_recovery_attempts: 1

## Current Reality

`npm test` fails on a clean checkout of the repository, confirmed unrelated to any single task.

Task `FX002-T01` is now planned and ready to execute. Repair the pre-existing DoctorDiagnostics test failure.

## Implemented Deliverables

- None yet.

## Remaining Deliverables

- Diagnosing and repairing the root cause of `npm test` failing.

## Outline Progress

- Diagnosing and repairing the root cause of `npm test` failing.: not started

## Blocked By

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

## Blocked From

- lifecycle_state: `implementation_running`
- active_task: `FX002-T01`
- active_correction_task: `none`
- active_unblock_task: `none`
- recoverability: agent

## Last Approved Change

Doctor recovery task `FX002-T02` passed re-entry quality gates and was applied by the prototype orchestrator.

## Known Gaps

- None

## Next Planning Hint

Plan a doctor recovery task for blocker `task-interface-gap-unblock-pending-doctor-recovery-fx002-t03-failed-its-re-entry-quality-gates-n` and then restore `implementation_running`.
