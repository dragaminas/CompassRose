# Diagnostic Autocorrection Contract

## Purpose

Defines the bounded diagnostic/autocorrection role used only when deterministic orchestration reaches a broken, blocked, failed, or otherwise invalid feature state.

This role is model-agnostic, not tied to any specific implementation. The runtime may execute it with the configured agent/model.

It reads current implementation artifacts, feature and project documentation, and the latest run data; compares them for drift; and chooses the smallest safe recovery action.

If docs or state are broken, it selects `correct_state` so the runtime applies the repair directly; if the blocker requires bounded repository recovery, it selects `plan_doctor_recovery`.

Most of this decision is deterministic and never consults a model. The one exception: when a `quality_failed`, `review_failed`, or `blocked` rejection cannot be resolved deterministically into `plan_doctor_recovery` (the point where the runtime would otherwise stop the whole run), the runtime consults the configured agent/model exactly once, offering only `plan_doctor_recovery` or `file_blocking_fix` as valid answers, to judge whether the rejection is a bounded implementation/interface gap or a systemic defect outside the blocked work item's frame. Any malformed or untrusted response from that call falls back to the same `stop_with_diagnostic` halt the deterministic path would have produced anyway — never a worse outcome.

TypeScript contract: `src/contracts/runtime/diagnosticAutocorrection.ts`.

---

## Responsibility

Diagnostic Autocorrection must:

- inspect the current implementation artifacts, state documents, and latest run evidence
- diagnose the current blocker from repository evidence
- compare implementation reality against documented state and surface mismatches explicitly
- decide whether deterministic state or documentation repair is enough and route it through `correct_state`
- decide whether a bounded doctor recovery task should tighten the task interface or repair the stale recovery path
- stop with a diagnostic when the fix needs architectural review, human judgment, or a non-obvious tradeoff
- distinguish a stale recovery interface from a fresh malformed state and call that out explicitly

Diagnostic Autocorrection must not:

- approve work
- invent repository state that cannot be justified from current artifacts
- broaden a narrow blocker into a new feature plan
- silently hand recovery documentation or state repair to the normal implementer loop
- let a `file_blocking_fix` scope include any work belonging to the blocked item's own task

---

## Required Output

Return JSON that conforms to `src/contracts/runtime/diagnostic-autocorrection.schema.json`.

---

## Action Semantics

### `correct_state`

Use only when:

- the repository state or documentation is malformed but still recoverable by the existing state-correction contract
- no broader interface-hardening task is needed first
- the drift can be repaired without changing implementation interfaces

The runtime applies the repair directly and then resumes from the restored lifecycle state.

### `plan_doctor_recovery`

Use when:

- the blocker is recoverable
- a bounded doctor recovery task can remove the blocker
- interface hardening, prompt tightening, contract cleanup, or repository-state synchronization should happen inside that doctor recovery task
- the blocker is a stale recovery interface, obsolete task ID, mismatched restoration target, or missing prior-attempt evidence that must be preserved before the feature can resume
- the recovery needs the `doctor` role because the smallest safe fix may touch docs, state, source, tests, or task interfaces together
- if that interface gap means the task must be reissued, have the successor task point back to the earlier task with `previous_task_id` instead of deleting or rewriting history
- if the issue is pure documentation or state drift, choose `correct_state` instead

When this action is chosen:

- plan exactly one bounded doctor recovery task
- preserve blocker and lineage evidence
- mark the recovery as `doctor` + `no_review_loop`
- validate re-entry through doctor quality gates instead of a reviewer pass

### `stop_with_diagnostic`

Use when:

- the blocker requires human or architectural review
- the best recovery path is not obvious
- multiple materially different solutions exist and the orchestrator should not choose silently

### `file_blocking_fix`

The runtime only asks for this choice at the one point where deterministic classification
already cannot resolve a `quality_failed`, `review_failed`, or `blocked` rejection into
`plan_doctor_recovery` on its own (recoverability `terminal`/`human`, or no safe recovery anchor
found) — i.e. exactly where the runtime would otherwise stop the whole run. At that point, choose
between exactly two outcomes:

- `plan_doctor_recovery`, if the evidence actually shows a bounded task-interface gap the normal
  doctor recovery task can tighten (prompt, scope, stale anchor, missing evidence) despite the
  deterministic classifier not finding a safe anchor.
- `file_blocking_fix`, if the evidence shows the defect is outside this task's frame entirely —
  architectural, framework-level, or otherwise systemic — so no bounded recovery task confined to
  this feature/fix could resolve it.

When choosing `file_blocking_fix`, populate `systemic_blocker` with:

- `title`: a short, specific description of the systemic defect (becomes the new fix's slug).
- `evidence_summary`: the concrete evidence that this is systemic, not implementation-local.
- `scope_note`: an explicit statement that the new fix's scope excludes the blocked work item's
  own task — the fix repairs the framework defect only, never continues the original work.
- `severity`: always `"critical"` — this blocker is by definition unproven and ambiguous enough
  to need this call in the first place, so it must outrank ordinary backlog until formalization
  (or a deterministic proof, as with the pre-existing-quality-gate-failure path) says otherwise.

The runtime then files a new fix from these fields, blocks the origin feature/fix on it, and
resumes other available work — it never halts the whole run for this outcome, unlike
`stop_with_diagnostic`.

Do not choose `file_blocking_fix` for anything `correct_state` or an ordinary
`plan_doctor_recovery` task could resolve; reserve it for defects that would otherwise force the
runtime to give up and stop with a diagnostic.

---

## Interface Hardening Rule

If the blocker was caused by a weak task, prompt, adapter, or contract interface, the diagnosis must say so explicitly.

Stale recovery interfaces include obsolete task IDs, a restoration target that no longer matches the observed active task, or recovery artifacts that omit required implementation-failure evidence such as no diff or missing Implementation Notes.

If that hardening can be applied safely through a bounded doctor recovery task, choose `plan_doctor_recovery`.

If the hardening changes architecture or needs human validation, choose `stop_with_diagnostic`.
