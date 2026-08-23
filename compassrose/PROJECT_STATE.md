# State: Project Identity and Foundation

## Status

In progress

## Active Feature

`023-terminal-session`

## Current Reality

- The specification round of 2026-08-22 re-cut the original twenty-two component requests into seven product features, `023` through `029`. See `features/README.md` for the full mapping and the round's coverage report.
- Features `001-project-identity-and-foundation`, `002-configuration-model`, and `003-doctor-command` are complete.
- Feature `023-terminal-session` is implemented and usable: `compassrose` with no arguments opens the interactive session, and the old no-argument behavior moved to `compassrose run`. `/run` executes the loop in a child process, so the progress frame animates while a step is in flight and `esc` is read: once asks the run to stop at its next checkpoint, twice terminates the process tree.
- Feature `024-specification-flow`: the loop can no longer author a specification. Unspecified items are reported by name, the session surfaces them first, and the competency profile now changes how the agent converses — a decision on an axis the human owns is surfaced as a choice rather than taken as prose, and who gave each answer is recorded on the specification itself.
- Feature `025-automated-development-loop`: a blocked work item is set aside instead of ending the run, runs can be targeted at one item, the runtime can close a feature whose acceptance criteria it has verified, and one unit of work is now one commit with the intermediate bookkeeping as its body. The structured run summary remains.
- Feature `026-conversational-doctor-recovery`: automatic repair is no longer attempted at all; a blocker is diagnosed and handed to a human through `/desbloquear`. The pipeline that used to attempt it is deleted, not merely unreachable — with the `unblock_pending` lifecycle state, four Operational Status fields, two config limits, and five contract documents that existed only to serve it. Recorded as ADR-0047, which supersedes ADR-0040. The `open_fix` exit and two turn bounds remain.
- Feature `027-bounded-work-item-context`: every agent call the loop makes is driven by a declared, measured manifest, checked against the budget at planning time. The implementer reports what it read beyond its manifest, capped, and it reaches that task's next attempt. No task is handed a history of prior tasks any more; what must cross that boundary crosses it as a written hand-off.
- Feature `028-project-understanding`: CompassRose reads a repository it has never seen, records every fact with its provenance, and infers what no file states — what the project is for, which scripts are gates — as a visibly-marked guess. `/proyecto confirmar` is the only thing that turns a guess into a fact, and a confirmed fact is never overwritten by a later detection.
- Feature `029-runnable-application-gate`: a feature cannot close unless the application starts. Start-command proposal remains, and belongs to `028`.
- Requests `021-vscode-integration` and `022-ecosystem-and-metrics` remain pending specification, deliberately.
- Two dimensions are recorded as uncovered, not out of scope: distribution/installation, and execution trust.
- Nothing is blocked.

## Implemented

- `compassrose/CONFIG.md` and `compassrose/PROJECT_STATE.md` are present as the project-local operational documents.
- Feature `001-project-identity-and-foundation` has aligned package metadata, TypeScript settings, and top-level foundation documentation.
- Feature `002-configuration-model` is complete: repository-local configuration loading and validation, Doctor and runtime integration, and the bounded correction-task allocator.
- Feature `003-doctor-command` is complete: `compassrose doctor` performs read-only readiness diagnostics for the repository, configuration, platform, documentation paths, project state, and blocked work, and satisfies all thirteen of its acceptance criteria.
- Fixes `001-blocked-feature-scope-misclassification`, `002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts`, and `003-pre-existing-failure-in-docs-features-003-doctor-command-state-md` are complete.
- Substantial machinery for the automated loop already exists across `src/orchestrator/`, `src/agents/`, `src/planner/`, `src/task/`, and `src/git/`. Features `025` through `027` rework and bound it rather than building it from nothing.

## Pending

- Finish the Remaining Deliverables recorded in each of `023` through `029`.
- Specify requests `021` and `022` when they become relevant.

## Blocked

- None

## Last Approved Change

Feature `003-doctor-command` was closed after its final outstanding acceptance criterion — the
documented success shape `CompassRose Doctor` / `Status: OK` — was satisfied.

## Known Gaps

- `git_policy.commit_after_task` is validated by the config reader and read by nothing, which now matters because `025` implements exactly what it names. Recorded under that feature's Remaining Deliverables.
- Nothing asserts that planner-output sanitization (`sanitizeAllowedPaths`, `validateQualityGateRefs`) is actually wired into the planners that call it. The only wiring test proved it through `planDoctorRecoveryTask` and went with that function; the helpers themselves stay covered. Recorded under `026`'s Remaining Deliverables.
- `tests/smokeGate.test.ts` fails intermittently under full-suite parallel load — always in teardown (`ENOTEMPTY`/timeout on removing the scratch directory), never in isolation, and on a different test each time. A killed process tree on Windows does not always release its working directory before `rmSync` runs, even with `maxRetries`.
- The provider-specific adapters in `src/agents/` (`codexCli.ts`, `openCodeCli.ts`) contradict absorbed request `010-generic-external-cli-adapter`, which explicitly excluded them. Feature `025-automated-development-loop` owns the reconciliation.
- This repository's own e2e suite clones the current `HEAD`, so a feature or fix sitting in a non-terminal lifecycle state can make unrelated tests fail. The standing cause of that — feature `003` recorded as blocked, plus `tests/stateCorrectionLimit.test.ts` mutating the live repository on every run — is fixed; the harness's dependence on `HEAD` remains.

## Next Planning Hint

Every feature from the specification round has working implementation; what remains is listed under
each one's Remaining Deliverables. The three items called out after the specification round —
deleting the doctor-recovery pipeline, commit batching, and in-step interruption — are all done. What
is left is smaller and independent: `026`'s `open_fix` exit and turn bounds, `027`'s planner and
reviewer manifests, `024`'s structured decisions, and `028`'s gap inference.
