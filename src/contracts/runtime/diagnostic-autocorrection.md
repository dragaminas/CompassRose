# Diagnostic Autocorrection Contract

## Purpose

Defines the bounded Codex role used only when deterministic orchestration reaches a broken, blocked, failed, or otherwise invalid feature state.

This role explains the blocker, chooses the next safe recovery action, and decides whether interface-hardening should be executed through an unblock task or escalated for human review.

---

## Responsibility

Diagnostic Autocorrection must:

- diagnose the current blocker from repository evidence
- decide whether deterministic state repair is enough
- decide whether a bounded unblock task should tighten the task interface
- stop with a diagnostic when the fix needs architectural review, human judgment, or a non-obvious tradeoff

Diagnostic Autocorrection must not:

- approve work
- invent repository state that cannot be justified from current artifacts
- broaden a narrow blocker into a new feature backlog

---

## Required Output

Return JSON that conforms to `src/contracts/runtime/diagnostic-autocorrection.schema.json`.

---

## Action Semantics

### `correct_state`

Use only when:

- the repository state is malformed but still recoverable by the existing state-correction contract
- no broader interface-hardening task is needed first

### `plan_unblock_task`

Use when:

- the blocker is recoverable
- a bounded unblock task can remove the blocker
- interface hardening, prompt tightening, or contract cleanup should happen inside that unblock task

### `stop_with_diagnostic`

Use when:

- the blocker requires human or architectural review
- the best recovery path is not obvious
- multiple materially different solutions exist and the orchestrator should not choose silently

---

## Interface Hardening Rule

If the blocker was caused by a weak task, prompt, adapter, or contract interface, the diagnosis must say so explicitly.

If that hardening can be applied safely through a bounded unblock task, choose `plan_unblock_task`.

If the hardening changes architecture or needs human validation, choose `stop_with_diagnostic`.
