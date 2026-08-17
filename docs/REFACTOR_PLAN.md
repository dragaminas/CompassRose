# CompassRose Refactoring Plan

## Purpose

This document tracks refactoring work aimed at applying one architectural law across the
existing codebase: every bounded operation (a decision input, a retry limit, a test fixture, a
document's own growth, a consequential AI judgment call) must declare its scope explicitly in
advance, rather than inheriting ambient scope that gets narrowed or corrected after the fact.
That law is recorded as **ADR-0034** in `docs/ADR.md`; ADR-0031, 0032, 0033, 0035, 0036, 0037,
0038, and 0039 are specific instances of it, each closing one concrete violation found by
auditing real production incidents (see each ADR's own wording for the originating defect).

This plan exists because those six ADRs closed the instances that had already caused a live
incident. The items below are instances of the **same** law found by auditing the rest of the
codebase for the same failure shapes *before* they cause one.

Update the Status column as work lands. This document is a living plan, not a decision record —
unlike `ADR.md`, it is expected to change as items complete or get re-scoped.

## Status

| # | Item | Status | Related ADR |
|---|---|---|---|
| 1 | Compact unbounded `Recovery History` narration | **Done** | ADR-0037 |
| 2 | Extend the classification ensemble to `consultDoctorOnSystemicBlocker` | **Done** | ADR-0038 |
| 3 | Verify the reviewer's relay of quality-gate facts before trusting an approval | **Done** | ADR-0039 |
| 4 | Feature-lifetime doctor-recovery budget (separate from the per-blocker-signature counter) | **Done** | ADR-0040 |
| 5 | Run-wide AI-call budget for `--loop` (task-budget equivalent) | **Done** | ADR-0041 |
| 6 | Fix `001-blocked-feature-scope-misclassification` (self-identified, pre-existing) | **Done** | ADR-0031 |
| 7 | Prune `recovery-lessons/` storage (retrieval is already bounded; storage is not) | **Investigated -- rejected** | ADR-0034 |
| 8 | Documentation catch-up: `SAD.md` doesn't describe the doctor-recovery/diagnose-autocorrect subsystem, `heartbeatRunner`, or `artifactStore` | **Done** | ADR-0003 (Documentation as UI) |
| 9 | `stopAfterDoctorRecoveryFailure` persists a blocker reclassified from the wrong text instead of the already-known one | **Done** | ADR-0044 |
| 10 | Non-negative `limits.*` fields treat an explicit `0` the same as "unset" (all five fields, not only ADR-0040/41's two) | **Done** | ADR-0042 |
| 11 | Validated optional policy sections (`limits`, `quality_gates`, ...) get silently overwritten by their own raw, unvalidated parse | **Done** | ADR-0043 |
| 12 | Reviewer quality-gate relay check requires `skipped` specifically for zero gates, false-positive-blocking a truthful `passed` | **Done** | ADR-0045 |
| 13 | ~~Remove dead, unwired `src/doctor/doctorDiagnostics.ts` scaffolding~~ | **Reverted -- was wrong** | -- |
| 14 | Deduplicate the ensemble-voting loop and the doctor-recovery counter readers | **Done** | -- |
| 15 | `proto:smoke` fails even at the last committed HEAD (pre-existing, unrelated to items 9-14) -- config gets pinned after the review-scope-relevant `git add -A`, so the pinned `docs/compassrose/CONFIG.md` reads as an out-of-scope changed file and the review step never even calls codex | Not started (discovered, not fixed) | -- |

---

## 1. Compact unbounded Recovery History — Done

**What was wrong.** `Recovery History` in a feature's `state.md` and in `docs/compassrose/PROJECT_STATE.md` is not written by any deterministic code path — each doctor-recovery task's own planner-generated instructions tell the executing AI to append a new entry while preserving every prior one verbatim. The section only ever grew. Because a feature's own `state.md` (and `PROJECT_STATE.md`) is listed as "Read only" context on every future doctor-recovery planning and execution prompt, that growth became real, paid context on every subsequent recovery attempt for as long as the feature kept needing them.

**What shipped.** `src/orchestrator/recoveryHistoryCompaction.ts` — `compactRecoveryHistorySection()`, a pure function that collapses the section into one line naming every recovery task id it summarizes once it exceeds a size threshold, pointing at git history and the artifact store for detail instead of duplicating it. Wired into the one deterministic write site where a feature transitions to `review_pending` (`implementTask`, in `src/orchestrator/orchestrator.ts`). Also applied once by hand against the two real, already-bloated documents (`docs/features/003-doctor-command/state.md`: 12003 → 6237 chars; `docs/compassrose/PROJECT_STATE.md`: 11126 → 5386 chars).

**Known residual gap.** The same growth pattern is structurally possible in a feature's `Current Reality` section, which was out of scope for this pass — worth watching, not yet an incident.

## 2. Extend the ensemble to `consultDoctorOnSystemicBlocker` — Done

**What was wrong.** This single AI call decided `plan_doctor_recovery` vs `file_blocking_fix` off one vote. Filing a fix is expensive and hard to reverse — it creates a whole new tracked work item — yet nothing cross-checked the decision before acting on it.

**Design detour before implementing.** A fresh agent (no prior context on this conversation's reasoning) reviewed the naive plan of reusing ADR-0036's ensemble wholesale, and flagged that voting on `systemic_blocker`'s free-text payload (title/evidence/scope) would just relocate ADR-0031's prose-guessing problem one level up — three independent calls have no meaningful "agreement" on prose. Its recommendation: vote only on the closed, 2-value `next_step` choice; once unanimous, make one further call to generate the payload only if `file_blocking_fix` was confirmed.

**What shipped.** `classifySystemicBlockerNextStepByEnsemble()` votes 3x on `next_step` only. Unanimous `plan_doctor_recovery` is resolved deterministically with no extra call (the caller already has `blocker` in hand). Unanimous `file_blocking_fix` triggers one detail call to the original single-vote consultation (renamed `consultDoctorOnSystemicBlockerSingleVote`) to get the payload — and if that detail call contradicts the ensemble, it is rejected rather than trusted. Disagreement, or an unavailable ensemble, falls back to the pre-existing behavior unchanged. `resolveBlockerKindEnsemble` was generalized into a reusable `resolveUnanimousVote<T>` (`src/shared/arrays.ts`) shared by both ensembles. Recorded as ADR-0038.

## 3. Verify the reviewer's relay of quality-gate facts — Done

**What was wrong.** The reviewer's approval/rejection gates whether a diff lands, and had zero cross-check. The plan originally proposed ensembling **approvals with no quality gate already confirming them** — but research showed that trigger is the *rare* case: the reviewer is only ever called after quality gates already ran deterministically and passed, so "no gate confirmed it" almost never actually happens. That made the originally-planned fix nearly a no-op.

**The real finding.** `ReviewerOutput.quality_gate_check` is filled in by the reviewer AI *reading and relaying* the exact deterministic `QualityGateResult[]` the orchestrator already computed — and nothing downstream ever verified the AI relayed it correctly. Because a real failure can never reach this call site, ground truth has exactly one legitimate value (`passed` if any gates ran, `skipped` if none did, `failed_gates` always empty) — any other relay is proof of an error, not an alternate reading of ambiguous data. This needs no ensemble at all: it's a cheap, deterministic, always-applicable check, closer in spirit to ADR-0031 than ADR-0036.

**What shipped.** `verifyReviewerQualityGateRelay()` compares the reviewer's `quality_gate_check` against ground truth on every `approved` result; on any mismatch, downgrades the review to `blocked` (reusing the existing, already-tested blocked-review handling) instead of landing the diff. Recorded as ADR-0039.

## 4. Feature-lifetime doctor-recovery budget — Done

**What was wrong.** `doctor_recovery_attempts` resets to 0 the moment a feature makes forward progress past its *current* blocker (ADR-0032's fix). That's correct for the per-blocker-signature loop it guards against, but it means a feature that keeps hitting new, different blockers over its lifetime can accumulate unlimited total recovery cycles — nothing tracked or bounded the sum.

**What shipped.** A second Operational Status field, `doctor_recovery_lifetime_count`, incremented alongside `doctor_recovery_attempts` in `updateFeatureStateForDoctorRecovery` but never reset anywhere else (`readDoctorRecoveryLifetimeCount`/`DoctorRecoveryLifetimeLimitReachedError` in `orchestrator.ts`). Bounded by a new, deliberately **optional** config field, `limits.max_lifetime_recovery_cycles` — optional because every other `limits` field is required once the section is present, and adding a required field would have zeroed out an existing project's entire `limits` block on the next config load. Defaults to unbounded when omitted, so no existing project configuration is retroactively affected; this project's own `docs/compassrose/CONFIG.md` opts in at `10`. The new error routes through the same shared `runBoundedOperation` handler as every other bounded-operation limit (ADR-0033) — a one-line addition to its `instanceof` chain, no new call-site plumbing needed.

**Side finding fixed in passing.** `readDoctorRecoveryAttempts`'s own docstring was stale since ADR-0032 shipped (still claimed `updateFeatureStateAfterDoctorRecovery` resets the counter, which ADR-0032 deliberately stopped doing) — corrected while touching the same code.

## 5. Run-wide AI-call budget for `--loop` — Done

**What was wrong.** `max_tasks_per_run` only counts *primary task completions*. Doctor-recovery tasks, correction tasks, planning calls, and the classification ensembles don't count against it at all, and default to `Number.POSITIVE_INFINITY` when unconfigured. A long `--loop` run could spin through many recovery cycles without any counter noticing, as long as primary-task completions stayed below the configured limit.

**What shipped.** A new optional config field, `limits.max_ai_calls_per_run` (defaults to unbounded), checked once at the very top of `determineNextStep()` — before any feature or fix is even inspected — against `agentInvocationCount`, the counter every structured AI call already increments by passing through the single existing choke point (`recordAgentInvocationContext()`). No new counter, no per-call-site plumbing: exactly the "declared ceiling, checked centrally by the harness" pattern.

**Side fix in passing.** `executeStep()`'s `'stop'` case was discarding `StepDecision.reason` entirely and always logging a hardcoded `"No selectable feature remains."`, even for the pre-existing `primaryTaskLimitReached()` stop — so the *real* reason a run stopped was never actually visible. Now surfaces `decision.reason` for every stop, old and new.

**Note for future limits.** `readPositiveInteger()` (shared by every field in `limits`) treats a configured `0` as "unset," not "zero" — consistent with every sibling limit, but worth remembering if a future limit genuinely needs to allow zero.

## 6. Fix `001-blocked-feature-scope-misclassification` — Done

Self-identified in `docs/compassrose/PROJECT_STATE.md`'s own Known Gaps, formalized (`docs/fixes/001-blocked-feature-scope-misclassification/`), severity medium: `classifyBlockerKind` misrouted a blocked-feature recovery hint toward doctor-recovery instead of the correct action (seen twice — sibling-feature scope, and exhausted task requests).

**What shipped.** `buildBlockerProfile`/`recordBlockedFeature`/`persistBlockedFeature` (`src/orchestrator/orchestrator.ts`) now accept an optional explicit `{ kind, nextPlanningHint }` pair, using it directly via `finalizeBlockerProfile` instead of `classifyBlockerKind`'s regex when supplied. `blockIfBelongsToOtherFeature` (shared by `planTaskFreely` and `planTaskFromRequest`, covering the fix's own "equivalent formalization-time sibling path" requirement automatically) and `planTask`'s exhausted-task-request branch both now supply it. Every other call site is untouched -- `classifyBlockerKind` remains the fallback exactly as fix.md's scope required. Closed out in the fix's own tracking documents (`docs/fixes/001-.../fix.md` and `state.md`), not just this plan.

## 7. Prune `recovery-lessons/` storage — Investigated, rejected

**Original framing.** `loadRecentRecoveryLessons` already reads this store correctly — scoped by feature, capped at 5 — but nothing prunes the underlying files, so they accumulate one-per-task forever.

**Why this turned out to be wrong to implement.** Reading the surrounding code before touching it (per this session's own practice) surfaced that the unbounded storage is *not* an oversight -- it's load-bearing. `loadRecentRecoveryLessons`'s own docstring documents that this repository's real lesson history caught the *same* defect (implementer context artifacts missing) recurring verbatim across four distinct, unrelated task anchors (F002-T09, T10, T12, T16) specifically *because* the design reads every lesson for a feature, not just recent ones. `describeRecurringRecoveryLessonCategories()` exists specifically to surface a category repeating 2+ times across the *whole* history. Pruning old lessons would directly break the one thing this store's redesign was built to do. Bounded retrieval was already the right fix (ADR-0031/0034's own principle, applied here); bounded *storage* would have actively regressed a proven capability. No code change made. This is itself the value of researching before implementing rather than executing a punch-list item on faith.

## 8. Documentation catch-up — Done

**What was wrong.** `docs/SAD.md` did not mention the doctor-recovery / `diagnose_autocorrect` subsystem (the majority of this project's actual runtime complexity), the heartbeat runner, or the artifact store. Per ADR-0003 ("Documentation as UI"), an undocumented subsystem this large was itself a violation of the project's own stated principle.

**What shipped.** Added `5.13 Diagnostic/Autocorrection and Doctor Recovery Subsystem` and `5.14 Artifact Store`, and a paragraph in `5.6 Role Runtime` describing the recording choke point and heartbeat runner. (This entry's status was previously left stale as "Not started" in this table after the write-up had already landed -- corrected while auditing the plan during the item 9-15 pass below.)

---

Items 9-15 below came from a 12-agent code review of everything in items 1-8, followed by an attempt to actually run the hardened orchestrator against the real, live `003-doctor-command` / `F003-T01` state in an isolated clone (the real codex reviewer call hung in-sandbox and was abandoned; the state-machine wiring up to that call was confirmed correct). Same research-first, verify-after workflow as items 1-8.

## 9. `stopAfterDoctorRecoveryFailure` persisted the wrong blocker — Done

**What was wrong.** Two independent review agents flagged the same line: `stopAfterDoctorRecoveryFailure`'s diagnostic artifact correctly reads `doctorRecovery.blocker.kind`/`recoverability` directly (a fix already recorded in ADR-0031/0034), but three lines earlier, the call that *persists* the feature's blocked state still called `recordBlockedFeature(featureId, reason, taskId)` with no explicit kind -- falling through to `classifyBlockerKind(reason, ...)`, regexing the exact same "failed its re-entry quality gates" text the adjacent comment already explained was the wrong thing to classify. A terminal/human-only original blocker could get persisted as `agent`-recoverable, and the next `diagnoseAndAutocorrect` cycle would plan *another* doctor recovery for the recovery that just failed its own re-entry gates.

**What shipped.** The blocker is now built once, directly from `doctorRecovery.blocker`'s own known kind/recoverability/evidence/observed_state, and used for both the persisted blocked-state (via a new small helper, `persistBlockedFeatureWithKnownBlocker`) and the diagnostic artifact -- one source of truth instead of two independently-reconstructed guesses. Recorded as ADR-0044.

## 10. Non-negative `limits.*` fields silently coerced an explicit `0` to "unset" — Done

**What was wrong.** Every `limits.*` field is validated as non-negative (`requireNonNegativeInteger`/`optionalNonNegativeInteger`), which explicitly accepts `0` as a real, distinct, meaningful value. The runtime read every one of the five `limits.*` fields (not only ADR-0040/41's two new ones -- all five, including the pre-existing `max_tasks_per_run`, `max_review_iterations`, `max_recovery_iterations`) via `readPositiveInteger`, which requires `value > 0` and silently treats `0` the same as "absent," falling back to unbounded/default. An operator configuring `0` to mean "disable this entirely" got the opposite.

**What shipped.** A new `readNonNegativeInteger` (`src/orchestrator/runtimeHelpers.ts`) accepts `0`; all five constructor reads switched to it. Separately, `optionalNonNegativeInteger` now also treats an explicit parsed `null` (a key written with no inline value, e.g. `max_ai_calls_per_run:` with nothing after the colon) the same as "absent," matching what a config author actually means by leaving a field blank. Recorded as ADR-0042.

## 11. Validated optional policy sections got clobbered by their own raw parse — Done

**What was wrong.** Discovered while writing a regression test for item 10, not by a review agent -- a much bigger, pre-existing defect than the ADR-0042 fix alone would explain. `validateProjectConfiguration`'s `extraConfigurationFields` catch-all (meant only to pass through genuinely unrecognized top-level keys) excluded only the four *required* section names (`project`, `adapters`, `commands`, `documentation`) -- not `limits`, `quality_gates`, `review_policy`, `development_policy`, `execution`, `roles`, or `git_policy`, every one of which is also a key of the raw parsed YAML. `Object.assign(validated, extraConfigurationFields)` then let each of those sections' raw, unvalidated parse silently overwrite its own validated, normalized form. Invisible everywhere else because raw and validated happen to be identical for any well-formed value; only a field whose validated form differs from its raw parse (the ADR-0042 null-vs-undefined case) exposed it.

**What shipped.** The exclusion set now includes every key already validated into `optionalPolicySections`, not only the four required section names -- a validated section can never be re-overwritten by its own raw parse again. Recorded as ADR-0043.

## 12. Reviewer relay check false-positive-blocked a truthful "passed" on zero gates — Done

**What was wrong.** `verifyReviewerQualityGateRelay` (ADR-0039) required `quality_gate_check.status === 'skipped'` specifically when zero quality gates ran, downgrading an equally-truthful `passed` to a distrusted `blocked`. The reviewer contract documents `skipped` for gates explicitly waived by policy, never mandating it specifically for "no gates configured."

**What shipped.** Accepts either `passed` or `skipped` as trustworthy when zero gates ran; still only `passed` (no failures) when gates ran. Recorded as ADR-0045.

## 13. `doctorDiagnostics.ts` — deleted in error, then restored

**What I got wrong.** I deleted `src/doctor/doctorDiagnostics.ts` and its test, reasoning that zero committed git history plus zero call sites outside its own test meant it was throwaway scaffolding from earlier in this session. Both signals were misread: this repository's real, currently-stuck task `F003-T01` ("establish doctor diagnostic contract and read-only check context") has been sitting at `review_pending`/`blocked` through six doctor-recovery cycles specifically because its implementation was never approved -- so "never committed" is exactly what a real, in-progress, not-yet-landed deliverable looks like here, not evidence of throwaway scratch work. "Zero call sites" was also expected: the task's own formalized scope (`docs/features/003-doctor-command/tasks/001-establish-doctor-diagnostic-contract-and-read-only-check-context.md`) deliberately excludes CLI wiring as later, separate work.

**How this surfaced.** Retesting the fix against real project state (per the "probar el arreglo" request) a second time -- this time with the repository-local artifact store (`.git/proto-compassrose/`) correctly overlaid into the isolated test clone, which the first attempt had missed -- the real doctor-recovery planner's response described needing to recreate "F003-T01's feature-owned structured diagnostic boundary and read-only check context" under `src/doctor/`+`tests/doctor/`. That is this exact module. Cross-checking `.git/proto-compassrose/implementations/F003-T01.json` in the live repository (read-only) confirmed it: `status: "success"`, `changed_files: ["src/doctor/doctorDiagnostics.ts", "tests/doctor/doctorDiagnostics.test.ts"]`, with a `git_diff` byte-for-byte matching the file I had deleted.

**What I did.** Extracted the recorded `git_diff` from that artifact and reapplied it via `git apply` to restore both files exactly as they were. Full suite re-verified afterward (541 passed, 1 skipped -- the 11 tests in this file plus the 530 from items 1-12). No data was lost; the artifact store's own record of the successful implementation attempt is what made the restoration possible byte-for-byte, which is itself a point in favor of that store being unbounded/append-only (see item 7's own rejected-pruning rationale).

**Lesson for future sessions.** Before deleting anything flagged as "dead code" in this repository, cross-check the real, currently-stuck task/feature state and the repository-local artifact store (`.git/proto-compassrose/implementations/`, `.git/proto-compassrose/tasks/`) for whether it is a recorded deliverable of in-progress work, not only `git log` -- `git log` is blind to anything not yet committed, which is the normal state for a feature stuck mid-review.

## 14. Deduplicated the ensemble loop and the doctor-recovery counter readers — Done

Four independent review agents flagged each: `classifySystemicBlockerNextStepByEnsemble` and `classifyReviewBlockerKindByEnsemble` repeated an identical ~35-line "fire N independent votes, record invocation context, validate the raw response" loop with only the prompt/schema/vote-shape differing; `readDoctorRecoveryAttempts` and `readDoctorRecoveryLifetimeCount` were byte-for-byte identical except one status-key string. Extracted `runClassifierEnsemble<T>()` (generic over the vote type, taking a prompt/schema/label-prefix/`extractVote` callback) and `readOperationalStatusCounter(statePath, key)` respectively; both original methods are now thin, named wrappers.

## 15. `proto:smoke` fails even at the last committed HEAD — discovered, not fixed

While testing the fix against real project state, running `npm run proto:smoke` failed with exit code 2 and no visible error (the review step never even invoked codex). Traced to: `protoCompassRose.smoke.e2e.ts`'s `main()` runs `git add -A` (to resync the index after `isolateFeatureDirectories`) *before* `pinScenarioConfigLimits` rewrites `docs/compassrose/CONFIG.md` on disk -- so the pinned config is left dirty relative to `HEAD`, `CONFIG.md` is not in the reviewer's excluded-paths list or in the seeded task's `allowed_paths`, and the deterministic pre-reviewer scope check (`blockOnDeterministicScopeViolation`) silently blocks the review before any AI call. Confirmed via a disposable clone of the last commit (`fd257282`, before any of this session's work) that this reproduces identically -- it is not a regression from items 1-14, and `npm run proto:e2e`/`npm run proto:smoke`'s sibling scripts were unaffected. Left unfixed pending a decision on whether to reorder the harness's own setup steps or add `CONFIG.md` to its excluded paths; `npm run proto:e2e` remains the passing, relied-upon real-e2e signal for this plan's own items.
