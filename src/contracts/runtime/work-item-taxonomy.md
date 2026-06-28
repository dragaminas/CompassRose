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

### task request

A single visible item in the feature outline that describes one intended next unit of work.

It helps the user see the expected path ahead.

It is informational only and cannot be dispatched to an executor.

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

### doctor recovery task

A bounded recovery task used when the repository is blocked or a failed attempt can be safely repaired.

It is not a feature-planning task.

It may touch docs, state, source, or tests only as needed for deterministic re-entry.

---

## Rules

- `request` and the feature outline are user-visible planning intent.
- `task` is the only canonical executable planning unit.
- `subtask` and `attempt` are execution iterations, not planning units.
- `correction task`, `state correction task`, and `doctor recovery task` are temporary recovery artifacts.
- CompassRose must not treat the feature outline as a long-lived executable task list.
- A visible feature outline may show the intended number of implementation steps, but the runtime still generates only the next executable task.
