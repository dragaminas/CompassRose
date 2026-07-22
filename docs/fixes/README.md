# CompassRose Fix Requests

This folder contains bug reports for defects in already-shipped behavior — a genuinely
different category from a feature request (net-new capability) or a correction task
(a narrower fix produced when a review returns `changes_required` inside an active
feature task). See `src/contracts/runtime/work-item-taxonomy.md` for the full distinction.

Each fix starts with a human-readable `request.md` file.
CompassRose should later formalize each request into:

```text
fix.md
state.md
```

`fix.md` defines purpose, severity, owning feature (or `none` if cross-cutting/transversal),
scope, deliverables, completion criteria, and the high-level implementation outline expressed
as visible task requests. Fixes have no `architecture.md` — they are not expected to introduce
new architectural surface.

`state.md` follows the exact same lifecycle contract as a feature's `state.md`
(`src/contracts/state/feature-state.md`): it records repository reality, progress against
deliverables, progress against the outline, and the next planning hint. It additionally
carries `severity` and `owning_feature` under `## Operational Status` so CompassRose can
schedule fixes without re-reading `fix.md` prose on every tick.

After formalization, CompassRose plans and executes one task at a time, exactly like a
feature. Fix-owned tasks use the `FX` task-id prefix (e.g. `FX002-T01`) instead of `F`, so a
task id alone always tells you which lifecycle it belongs to.

The numeric prefix is only a fix-local ordering convenience — it does not imply priority.
**Severity, not numeric order, decides scheduling priority**: a `critical` or `high` severity
fix is planned before CompassRose starts any new feature work, though it never interrupts a
feature task that is already mid-execution. `medium`/`low` severity fixes are ordinary backlog,
scheduled after all feature work that is ready to start.

A fix's severity is unknown until formalization sets it explicitly. Until then, CompassRose
fails safe upward: any fix missing `state.md` (a fresh, unformalized request) or carrying an
unparsable `severity` value is treated as `critical`, not `medium`. A newly-detected defect must
never quietly compete in ordinary backlog before anyone has judged how serious it actually is.

## Automatically filed fixes

CompassRose can file a fix on its own, without a human writing `request.md`, in two situations:

- **A quality-gate failure proven pre-existing and unrelated to the task that hit it**
  (`blockOnUnrelatedFixFailure`): filed at `severity: high`, because the defect is real but
  already deterministically proven — the gate command demonstrably fails the same way on a clean
  checkout, with no reference to the failing task's own scope.
- **A rejection the doctor classifies as systemic rather than a bounded implementation issue**
  (`file_blocking_fix`, see `src/contracts/runtime/diagnostic-autocorrection.md`): filed at
  `severity: critical`, always. This fires only when a `quality_failed`, `review_failed`, or
  `blocked` rejection cannot be resolved into a bounded doctor recovery task — i.e. the defect is
  outside the blocked feature/fix's own frame entirely (architectural, framework-level). Because
  the evidence for this case is inherently less certain than the proven quality-gate case above,
  it always outranks it, per the fail-safe-upward rule.

Either way, the fix's own scope explicitly excludes the work of the item that surfaced it, and
that item is set `blocked_on_fix` pointing at the new fix — it resumes automatically once the fix
reaches `completed`, and in the meantime the scheduler moves on to other available work instead of
re-diagnosing the same blocker every run.
