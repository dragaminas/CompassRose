# Task Interface Analysis Contract

## Purpose

Defines the structured diagnostic produced after a problematic review outcome so future tasks can become tighter, clearer, and more deterministic.

TypeScript contract: `src/contracts/runtime/taskInterfaceAnalysis.ts`.

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
- Every adjustment must reference a field, artifact, or mechanism that already exists in the contracts you were told to read. Do not invent new artifact types, manifests, validators, or field names — "concrete" means specific about the existing interface, not about a new one you propose.
- If satisfying the gap would require a mechanism the runtime does not implement, say so explicitly as a limitation instead of proposing one, so it does not get carried into a future task as if it already existed.
- If the failure is mostly an implementer limitation, say so explicitly.
- If both are true, record both.
- Keep recommendations bounded enough to feed future correction planning. This output is downstream input for another model call, not a verified requirement — a later reader will not re-derive whether it is grounded, so grounding it here is your responsibility.
