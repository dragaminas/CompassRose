# State: Doctor Command

## Lifecycle State

unblock_pending

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: F003-T01-C02
- active_correction_task: none
- active_unblock_task: F003-DR07
- last_implementation_result: passed
- last_quality_gate_result: failed
- last_review_result: blocked
- last_unblock_result: not_run
- doctor_recovery_attempts: 1
- blocked_on_fix: none
- doctor_recovery_lifetime_count: 1
- validation: confirmed

## Current Reality

- `docs/features/003-doctor-command/request.md` is the human-authored request being formalized.
- `docs/compassrose/CONFIG.md` contains the canonical project-level configuration example, the Doctor MVP configuration contract, command-presence semantics, and the expected successful Doctor output shape.
- Feature `002-configuration-model` is recorded as complete and provides repository-local configuration loading/validation plus Doctor/runtime integration.
- `docs/compassrose/PROJECT_STATE.md` records an existing dedicated runtime preflight check for the configured project-state document, but it does not establish that the full `compassrose doctor` readiness command is complete.
- No feature-specific implementation deliverable for the complete Doctor command is claimed complete by this feature state.

Task `F003-T01` remains the active implementation target in `implementation_running` for deterministic re-entry. Doctor recovery task `F003-DR06`, the successor to `F003-DR05`, reconciled the state and recovery handoff only; it did not change the implementation attempt. Its doctor re-entry gates passed and applied the fixed restoration target `implementation_running` with `F003-T01` active and no correction or unblock task. The implementation remains incomplete.

## Implemented Deliverables

- The canonical feature documentation set is formalized for this feature.
- The repository-local configuration contract and its Doctor MVP rules already exist as shared project inputs.
- A project-state preflight behavior is already recorded as part of feature `002-configuration-model`; it is treated as a reusable prerequisite or partial existing behavior, not re-owned here.

## Remaining Deliverables

- Define the feature-owned structured diagnostic boundary for Doctor.
- Implement the read-only MVP readiness checks for configuration, required documentation, platform, Git repository membership, and configured-command semantics.
- Expose the checks through `compassrose doctor` with clear human-readable output and an overall readiness result.
- Add automated coverage for passing and failing checks, cross-platform behavior, path containment, output, and read-only/no-external-execution guarantees.

## Outline Progress

- 1. Doctor diagnostic contract: in progress
- 2. Repository readiness checks: not started
- 3. CLI reporting and command integration: not started

## Historical Blocker Evidence

- - kind: state_corruption
- - signature: state-corruption-implementation-running-quality-gates-failed-after-implementing-f003-t01-npm-tes
- - recoverability: agent
- - observed_state: lifecycle=implementation_running
- - evidence: Quality gates failed after implementing F003-T01.
npm test: - 0
+ 1

 ❯ tests/protoBlockerFlows.test.ts:162:27
    160|     const result = runProtoScenario('state-correction-missing-active-t…
    161|
    162|     expect(result.status).toBe(0);
       |                           ^
    163|     expect(result.stdout).toContain('PASS: state correction artifact w…
    164|     expect(result.stdout).toContain('PASS: state correction document w…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/10]⎯
- - evidence: npm run typecheck: passed: > compassrose@1.0.0 typecheck
> tsc --noEmit
- - evidence: npm test: failed: - 0
+ 1

 ❯ tests/protoBlockerFlows.test.ts:162:27
    160|     const result = runProtoScenario('state-correction-missing-active-t…
    161|
    162|     expect(result.status).toBe(0);
       |                           ^
    163|     expect(result.stdout).toContain('PASS: state correction artifact w…
    164|     expect(result.stdout).toContain('PASS: state correction document w…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/10]⎯
- - evidence: lifecycle=implementation_running
- - reason: Quality gates failed after implementing F003-T01. | npm test: - 0 | + 1 | ❯ tests/protoBlockerFlows.test.ts:162:27 | 160|     const result = runProtoScenario('state-correction-missing-active-t… | 161| | 162|     expect(result.status).toBe(0); | |                           ^ | 163|     expect(result.stdout).toContain('PASS: state correction artifact w… | 164|     expect(result.stdout).toContain('PASS: state correction document w… | ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/10]⎯

## Blocked By

- - kind: review_failure
- - signature: review-failure-implementation-running-quality-gates-failed-after-implementing-f003-t01-c02-npm-t
- - recoverability: agent
- - observed_state: lifecycle=implementation_running
- - evidence: Quality gates failed after implementing F003-T01-C02.
npm test: [41m[1m FAIL [22m[49m tests/taskRequestScopeEnforcement.test.ts[2m > [22mtask-request scope enforcement[2m > [22mrefuses a task whose scope exceeds its task request boundary without a deviation_reason
[31m[1mError[22m: Test timed out in 30000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".[39m
[36m [2m❯[22m tests/taskRequestScopeEnforcement.test.ts:[2m28:3[22m[39m
    [90m 26|[39m   // caught deterministically (checkTaskRequestContainment), not by tr…
    [90m 27|[39m   [90m// self-reported scope_justification.deviation_reason honesty.[39m
    [90m 28|[39m   test('refuses a task whose scope exceeds its task request boundary w…
    [90m   |[39m   [31m^[39m
    [90m 29|[39m     [35mconst[39m workspace [33m=[39m [34mprepareWorkspace[39m()[33m;[39m
    [90m 30|[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[13/13]⎯[22m[39m
- - evidence: npm run typecheck: passed: > compassrose@1.0.0 typecheck
> tsc --noEmit
- - evidence: npx vitest run tests/doctor/doctorDiagnostics.test.ts: passed: [1m[30m[46m RUN [49m[39m[22m [36mv4.1.7 [39m[90mC:/Users/Eric/Documents/Repos/CompassRose[39m

 [32m✓[39m tests/doctor/doctorDiagnostics.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 27[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m19 passed[39m[22m[90m (19)[39m
[2m   Start at [22m 12:50:44
[2m   Duration [22m 334ms[2m (transform 109ms, setup 0ms, import 143ms, tests 27ms, environment 0ms)[22m
- - evidence: npm test: failed: [41m[1m FAIL [22m[49m tests/taskRequestScopeEnforcement.test.ts[2m > [22mtask-request scope enforcement[2m > [22mrefuses a task whose scope exceeds its task request boundary without a deviation_reason
[31m[1mError[22m: Test timed out in 30000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".[39m
[36m [2m❯[22m tests/taskRequestScopeEnforcement.test.ts:[2m28:3[22m[39m
    [90m 26|[39m   // caught deterministically (checkTaskRequestContainment), not by tr…
    [90m 27|[39m   [90m// self-reported scope_justification.deviation_reason honesty.[39m
    [90m 28|[39m   test('refuses a task whose scope exceeds its task request boundary w…
    [90m   |[39m   [31m^[39m
    [90m 29|[39m     [35mconst[39m workspace [33m=[39m [34mprepareWorkspace[39m()[33m;[39m
    [90m 30|[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[13/13]⎯[22m[39m
- - evidence: lifecycle=implementation_running
- - reason: Quality gates failed after implementing F003-T01-C02. | npm test: [41m[1m FAIL [22m[49m tests/taskRequestScopeEnforcement.test.ts[2m > [22mtask-request scope enforcement[2m > [22mrefuses a task whose scope exceeds its task request boundary without a deviation_reason | [31m[1mError[22m: Test timed out in 30000ms. | If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".[39m | [36m [2m❯[22m tests/taskRequestScopeEnforcement.test.ts:[2m28:3[22m[39m | [90m 26|[39m   // caught deterministically (checkTaskRequestContainment), not by tr… | [90m 27|[39m   [90m// self-reported scope_justification.deviation_reason honesty.[39m | [90m 28|[39m   test('refuses a task whose scope exceeds its task request boundary w… | [90m   |[39m   [31m^[39m | [90m 29|[39m     [35mconst[39m workspace [33m=[39m [34mprepareWorkspace[39m()[33m;[39m | [90m 30|[39m | [31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[13/13]⎯[22m[39m

## Blocked From

- lifecycle_state: `implementation_running`
- active_task: `F003-T01-C02`
- active_correction_task: `none`
- active_unblock_task: `none`

## Last Approved Change

Doctor recovery task `F003-DR06` passed re-entry quality gates and was applied by the prototype orchestrator.

## Recovery History

- Compacted 5 doctor recovery cycle(s) recorded before this point (F003-DR01, F003-DR03, F003-DR04, F003-DR05, F003-DR06). Full detail: `.git/proto-compassrose/blockers/`, `.git/proto-compassrose/recovery-lessons/`, and git history.

## Known Gaps

- The supplied planning sources do not identify the current CLI entrypoint or the physical configuration-loader path, so those bindings remain for task planning.
- The existing project-state preflight may need to be reused or folded into the Doctor diagnostic report without duplicating configuration or runtime policy.
- The full readiness command, its complete check set, and its automated coverage remain unimplemented by this feature.
- `npm test` run as part of F003-T01's own quality gates can still intermittently fail for a
  reason unrelated to any code defect: this repository's own e2e test suite
  (`tests/protoBlockerFlows.test.ts` and similar) clones the *current* repository HEAD, so while
  feature `003-doctor-command` itself sits in a non-terminal lifecycle state, those tests can pick
  up that in-progress state and fail in ways their scripted mock CLI responses don't anticipate.
  Not a defect in F003-T01's own implementation; expected to stop once this feature reaches a
  terminal state.

## Next Planning Hint

Execute doctor recovery task `F003-DR07` next.
