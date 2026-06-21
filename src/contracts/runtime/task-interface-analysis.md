# Task Interface Analysis Contract

## Purpose

Defines the structured diagnostic produced after a problematic review outcome so future tasks can become tighter, clearer, and more deterministic.

---

## Responsibility

Task Interface Analysis must:

- separate task-contract gaps from implementer limitations
- recommend the smallest task-interface adjustments that would improve future execution
- stay focused on interface quality rather than fixing the implementation directly

---

## Required Output

Return JSON that conforms to `src/contracts/runtime/task-interface-analysis.schema.json`.

---

## Rules

- Prefer concrete adjustments to `first_executable_step`, `minimum_progress_evidence`, context, scope, acceptance criteria, and quality gates.
- If the failure is mostly an implementer limitation, say so explicitly.
- If both are true, record both.
- Keep recommendations bounded enough to feed future doctor-recovery or correction planning.
