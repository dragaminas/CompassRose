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
