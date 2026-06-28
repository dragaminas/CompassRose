# Diagnostic Autocorrection Contract

## Purpose

Defines the bounded diagnostic/autocorrection role used only when deterministic orchestration reaches a broken, blocked, failed, or otherwise invalid feature state.

This role is model-agnostic, not tied to any specific implementation. The runtime may execute it with the configured agent/model.

It reads current implementation artifacts, feature and project documentation, and the latest run data; compares them for drift; and chooses the smallest safe recovery action.

If docs or state are broken, it selects `correct_state` so the runtime applies the repair directly; if the blocker requires bounded repository recovery, it selects `plan_doctor_recovery`.

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

---

## Interface Hardening Rule

If the blocker was caused by a weak task, prompt, adapter, or contract interface, the diagnosis must say so explicitly.

Stale recovery interfaces include obsolete task IDs, a restoration target that no longer matches the observed active task, or recovery artifacts that omit required implementation-failure evidence such as no diff or missing Implementation Notes.

If that hardening can be applied safely through a bounded doctor recovery task, choose `plan_doctor_recovery`.

If the hardening changes architecture or needs human validation, choose `stop_with_diagnostic`.
