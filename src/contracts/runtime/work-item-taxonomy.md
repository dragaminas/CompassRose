# Work Item Taxonomy

## Purpose

Defines the canonical terms CompassRose uses for feature planning and execution.

The goal is to keep user-visible planning intent, executable work, and recovery work distinct.

---

## Terms

### request

A human-authored feature request stored in `request.md`.

It captures intent, not execution.

It may be formalized into the feature document set, but it is not itself an executable artifact.

### feature

The formalized feature documents: `feature.md`, `architecture.md`, and `state.md`.

A feature defines the planning scope and the high-level implementation outline.
That outline is expressed as visible task requests.

The outline is for visibility and coordination, not for execution.

### fix request

A human-authored bug report stored in `compassrose/fixes/NNN-slug/request.md`.

It captures a defect in already-shipped behavior, not a gap in an in-progress feature and not
a review finding inside an active task (see `correction task` below) — those are distinct
categories. It may be formalized into the fix document set, but it is not itself an executable
artifact.

### fix

The formalized fix documents: `fix.md` and `state.md`. A fix has no `architecture.md`.

A fix defines the planning scope, a `severity` (`critical | high | medium | low`), an
`owning_feature` (or `none` if the fix is cross-cutting/transversal), and the high-level
implementation outline. That outline is expressed as visible task requests, exactly like a
feature's.

Severity — not numeric order — governs when a fix is scheduled: a `critical`/`high` fix is
planned before any new feature work starts, but never interrupts a feature task that is
already mid-execution. `medium`/`low` fixes are ordinary backlog, scheduled after feature work
that is ready to start.

### task request

A single visible item in the feature outline: a fixed, pre-declared, locked-in scope boundary
(`{id, title, objective, scope, status, sibling_check}` — see
`src/contracts/planner/plannerContracts.ts`'s `TaskRequest`) decided once, holistically, when the
feature or fix is formalized.

It helps the user see the expected path ahead, and it constrains whatever task later elaborates it:
task planning may not invent scope beyond a task request's declared boundary without an honest,
explicit `scope_justification.deviation_reason` (see `src/orchestrator/taskRequests.ts`'s
`checkTaskRequestContainment`, enforced deterministically by the orchestrator, not by trusting the
planner's self-report alone).

It is still not itself an executable artifact and cannot be dispatched to an executor — only the
`task` that a later task-planning pass elaborates from it is.

### task

The canonical temporary execution artifact generated on demand.

It is the active unit of work for the implementer and reviewer loop.

CompassRose generates one task at a time.

### subtask

A bounded execution iteration inside the same task.

Subtasks are not independent planning units.

They exist when the same task needs another bounded pass, a narrower correction, or a resumed attempt.

A successful final subtask may complete the parent task.

### attempt

One execution pass of a task or subtask by an external implementer.

An attempt may produce repository changes, implementation notes, diagnostics, or a failure result.

Attempts preserve history.

### correction task

A narrower task produced after review returns `changes_required`.

It keeps the original intent but narrows the scope to the reviewed findings.

### state correction task

A documentation and state repair task used when repository state is malformed.

It restores canonical state without reopening feature planning.

---

## Rules

- `request`/`fix request` and the work-item outline (a feature's or a fix's) are user-visible planning intent.
- `task` is the only canonical executable planning unit.
- `subtask` and `attempt` are execution iterations, not planning units.
- `correction task` and `state correction task` are temporary recovery artifacts. There is no third kind: when the runtime cannot repair a blocker deterministically, it does not plan a task at all -- it blocks the work item for a conversation with a human (026-conversational-doctor-recovery).
- CompassRose must not treat a work-item outline as a long-lived executable task list.
- A visible work-item outline may show the intended number of implementation steps, but the runtime still generates only the next executable task.
- A task request is a binding boundary for the next executable task, not a task itself: it constrains what task planning may propose, but the runtime still elaborates and dispatches exactly one task at a time, deterministically selected as the next task request that isn't already `complete`/`superseded`.
