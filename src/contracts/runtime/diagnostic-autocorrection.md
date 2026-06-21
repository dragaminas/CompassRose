# Diagnostic Autocorrection Contract

## Purpose

Defines the bounded diagnostic/autocorrection role used only when deterministic orchestration reaches a broken, blocked, failed, or otherwise invalid feature state.

This role is model-agnostic, not tied to any specific implementation. The runtime may execute it with the configured agent/model.

It reads current implementation artifacts, feature and project documentation, and the latest run data; compares them for drift; and chooses the smallest safe recovery action.

If docs or state are broken, it selects `correct_state` so the runtime applies the repair directly; if the blocker is a design or implementation interface gap, it selects `plan_unblock_task` for a source-only unblock task.

---

## Responsibility

Diagnostic Autocorrection must:

- inspect the current implementation artifacts, state documents, and latest run evidence
- diagnose the current blocker from repository evidence
- compare implementation reality against documented state and surface mismatches explicitly
- decide whether deterministic state or documentation repair is enough and route it through `correct_state`
- decide whether a bounded unblock task should tighten the task interface
- stop with a diagnostic when the fix needs architectural review, human judgment, or a non-obvious tradeoff
- distinguish a stale recovery interface from a fresh malformed state and call that out explicitly

Diagnostic Autocorrection must not:

- approve work
- invent repository state that cannot be justified from current artifacts
- broaden a narrow blocker into a new feature backlog
- ask the implementer to modify repository documentation or state

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

### `plan_unblock_task`

Use when:

- the blocker is recoverable
- a bounded unblock task can remove the blocker
- interface hardening, prompt tightening, or contract cleanup should happen inside that unblock task
- the blocker is a stale recovery interface, obsolete task ID, mismatched restoration target, or missing prior-attempt evidence that must be preserved before the feature can resume
- if the blocker is a design or implementation interface gap, the unblock task must be source-only: restrict allowed paths to implementation code under `src/` and any required tests, keep docs, contract markdown, and state files out of scope, and do not ask the implementer to modify repository documentation or project state
- if that interface gap means the task must be reissued, have the successor task point back to the earlier task with `previous_task_id` instead of deleting or rewriting history
- if the issue is pure documentation or state drift, choose `correct_state` instead

### `stop_with_diagnostic`

Use when:

- the blocker requires human or architectural review
- the best recovery path is not obvious
- multiple materially different solutions exist and the orchestrator should not choose silently

---

## Interface Hardening Rule

If the blocker was caused by a weak task, prompt, adapter, or contract interface, the diagnosis must say so explicitly.

Stale recovery interfaces include obsolete task IDs, a restoration target that no longer matches the observed active task, or recovery artifacts that omit required implementation-failure evidence such as no diff or missing Implementation Notes.

If that hardening can be applied safely through a bounded unblock task, choose `plan_unblock_task` and keep it source-only when the gap is design or implementation related.

If the hardening changes architecture or needs human validation, choose `stop_with_diagnostic`.
