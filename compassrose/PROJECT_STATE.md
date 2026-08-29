# State: Project Identity and Foundation

## Status

In progress

## Active Feature

`023-terminal-session`

## Current Reality

- The specification round of 2026-08-22 re-cut the original twenty-two component requests into seven product features, `023` through `029`. See `features/README.md` for the full mapping and the round's coverage report.
- Features `001-project-identity-and-foundation`, `002-configuration-model`, and `003-doctor-command` are complete.
- Feature `023-terminal-session` is implemented and usable: `compassrose` with no arguments opens the interactive session, and the old no-argument behavior moved to `compassrose run`. `/run` executes the loop in a child process, so the progress frame animates while a step is in flight and `esc` is read: once asks the run to stop at its next checkpoint, twice terminates the process tree.
- Feature `024-specification-flow`: the loop can no longer author a specification. Unspecified items are reported by name, the session surfaces them first, and the competency profile now changes how the agent converses — a decision on an axis the human owns is surfaced as a choice rather than taken as prose, and who gave each answer is recorded on the specification itself. `/crear` now also audits the finished draft against the transcript and records, as its own list, every commitment the specification makes that nobody in the conversation ever chose.
- Feature `025-automated-development-loop`: a blocked work item is set aside instead of ending the run, runs can be targeted at one item, the runtime can close a feature whose acceptance criteria it has verified, and one unit of work is now one commit with the intermediate bookkeeping as its body. The structured run summary remains.
- Feature `026-conversational-doctor-recovery`: automatic repair is no longer attempted at all; a blocker is diagnosed and handed to a human through `/desbloquear`. The pipeline that used to attempt it is deleted, not merely unreachable — with the `unblock_pending` lifecycle state, four Operational Status fields, two config limits, and five contract documents that existed only to serve it. Recorded as ADR-0047, which supersedes ADR-0040. The `open_fix` exit and two turn bounds remain.
- Feature `027-bounded-work-item-context`: every agent call the loop makes is driven by a declared, measured manifest, checked against the budget at planning time. The implementer reports what it read beyond its manifest, capped, and it reaches that task's next attempt. No task is handed a history of prior tasks any more; what must cross that boundary crosses it as a written hand-off.
- Feature `028-project-understanding`: CompassRose reads a repository it has never seen, records every fact with its provenance, and infers what no file states — what the project is for, which scripts are gates — as a visibly-marked guess. `/proyecto confirmar` is the only thing that turns a guess into a fact, and a confirmed fact is never overwritten by a later detection.
- Feature `029-runnable-application-gate`: a feature cannot close unless the application starts. Start-command proposal remains, and belongs to `028`.
- Feature `030-execution-trust`: what a run is allowed to *do* to a repository is declared and bounded. Every codex call used to carry `--dangerously-bypass-approvals-and-sandbox`; none do now, structured calls are pinned read-only, and quality-gate commands are checked against a declared allowlist at planning time and again before running. Recorded as ADR-0048.
- Feature `031-installation-boundary`: CompassRose can be pointed at a repository that is not this one. Its contracts are read from where it is installed instead of from the target and are never copied in, `documentation.contracts_root` is gone, every command takes `--cwd`, `setup` commits what it creates and seeds `CONFIG.md` from what it read, and the package is linkable. Verified end to end against a foreign repository, deterministically — no agent call has crossed that boundary yet. Recorded as ADR-0049.
- Requests `021-vscode-integration` and `022-ecosystem-and-metrics` remain pending specification, deliberately.
- One dimension remains recorded as uncovered, not out of scope: distribution and installation. `031` made the package linkable and every command targetable, which is what a validation run needs; publishing it is still nobody's decision. Execution trust was the other, and `030` covers it.
- `compassrose/DIMENSIONS.md` exists for the first time. It had never been written, so the coverage checklist the brainstormer is shown every turn reported everything uncovered.
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
- `npm run proto:smoke` fails: the control scenario reaches `review_pending` with the implementation passed, then sets `002-configuration-model` aside instead of reviewing it, having made one opencode call and no codex call. Verified pre-existing by running it at `e7c61709`, where it fails identically. `proto:e2e` and `proto:typecheck` both pass.
- `tests/featurePlanningOutline.test.ts` belongs to the same family: it clones the repository and spawns `tsx`, takes about 9 seconds alone, and has exceeded the 30-second timeout under full-suite parallel load. Green on a re-run with nothing changed.
- The provider-specific adapters in `src/agents/` (`codexCli.ts`, `openCodeCli.ts`) contradict absorbed request `010-generic-external-cli-adapter`, which explicitly excluded them. Feature `025-automated-development-loop` owns the reconciliation.
- This repository's own e2e suite clones the current `HEAD`, so a feature or fix sitting in a non-terminal lifecycle state can make unrelated tests fail. The standing cause of that — feature `003` recorded as blocked, plus `tests/stateCorrectionLimit.test.ts` mutating the live repository on every run — is fixed; the harness's dependence on `HEAD` remains.

## Next Planning Hint

Every feature has working implementation; what remains is listed under each one's Remaining
Deliverables.

The next thing that changes what this system is worth, rather than what it documents, is **a real
run against a repository that is not this one**. `031` removed everything that stopped one from
starting: bootstrap, readiness and the deterministic loop have all been walked end to end against a
foreign repository from outside both. What has not happened is a single agent call across that
boundary — no specification conversation, no plan → implement → gate → review cycle. Until one has
run, what is known is that CompassRose *starts* correctly somewhere else.

Behind it: the self-hosting leaks recorded under `027` and `030` are the same family as the one
`031` closed and are still open, and `proto/`'s e2e harness still clones `HEAD`.

Within `030`, the one item that changes the feature's worth is replacing `node -e` quality gates
with a declarative assertion mechanism; until then this repository's own gate allowlist admits
arbitrary code, which the default allowlist does not.
