# Feature Scope Guard

## Purpose

Defines how a planned task's `scope_justification` (see `src/contracts/planner/output.md`) must be
grounded, so a task that quietly extends beyond its feature's declared scope — or duplicates work
that actually belongs to a sibling feature — is caught at planning time instead of accumulating
one plausible-looking task at a time.

This same reasoning now runs at two points, not one:

- **Once per task request, at feature formalization time** (`planFeature()`), filling that task
  request's own `sibling_check` (see `src/contracts/planner/plannerContracts.ts`'s `TaskRequest`)
  while the planner has full feature-and-architecture context — cheaper than re-deriving it fresh
  for every later task, and the mechanism this document was originally written for.
- **Once per task, at elaboration time** (`planTask()`), filling `scope_justification` as before —
  now a rarer secondary fallback, since the task request it elaborates was already vetted once.
  Elaboration also enforces a second, independent, deterministic check that has nothing to do with
  siblings: whether the elaborated task's `scope.allowed_paths` stays within its task request's own
  pre-declared boundary (see `src/orchestrator/taskRequests.ts`'s `checkTaskRequestContainment`). An
  honest `scope_justification.deviation_reason` lets a task legitimately widen that boundary instead
  of being silently rejected or silently allowed to drift.

This exists because of a real incident: `002-configuration-model` (a feature whose own `feature.md`
explicitly excludes "implementation of unrelated orchestration features beyond the configuration
contract they depend on") drifted across five consecutive tasks into feature selection, lifecycle
transitions, and external-CLI-adapter invocation — behavior that already existed, better, in the
orchestrator itself, and that belonged to features `009`, `012`, `014`, `017`, and `018` instead.
Each task looked like a reasonable next step from the one before it; nothing ever checked the
proposal against the feature's own boundaries or against what its siblings already claim.

---

## Responsibility

The planner must fill `scope_justification` from the repository's own documents, not from memory:

- `included_by` names the specific bullet under the target feature's `feature.md` `## Scope`
  "This feature includes:" list (or, if the feature isn't formalized yet, the specific sentence in
  `request.md` that the task serves) that the task satisfies.
- `excluded_by` lists every bullet under that same feature's "This feature does not include:" list
  that the planner checked the task against — even when none apply, return the checked list with a
  note that none matched, not an empty list produced without looking.
- `belongs_to_other_feature` is `null` unless a sibling feature's summary (see
  `src/planner/siblingFeatureIndex.ts`, supplied as planner input) describes the task's real subject
  more specifically than the target feature's own scope does — in which case it is that sibling's
  `feature_id` exactly as given in the index, never an invented or guessed id.

---

## Required Sources

The planner should read, in addition to what `src/contracts/planner/task-planning-prompt.md` already
requires:

- the target feature's `feature.md` `## Scope` section in full (both "includes" and "does not
  include"), or `request.md` if the feature isn't formalized yet
- the supplied sibling-feature index (`{feature_id, title, summary}` for every other feature under
  `docs/features/`)

---

## Rules

The planner must:

- name the exact scope bullet or request sentence being satisfied in `included_by`; a paraphrase
  that doesn't correspond to actual document text is not acceptable
- check the task against every "does not include" bullet before setting `excluded_by`, even when
  the task clearly fits inside scope
- treat a sibling feature's summary as a stronger match than the target feature's own scope only
  when the task's actual subject (not just a keyword overlap) is what that sibling describes —
  general infrastructure the target feature legitimately depends on is not, by itself, a match
- set `belongs_to_other_feature` to a `feature_id` that appears in the supplied sibling index,
  exactly as given there
- still return the rest of the task fields honestly when `belongs_to_other_feature` is set; the
  orchestrator (not the planner) decides what happens next — see `## Runtime Enforcement` below

The planner must not:

- leave `belongs_to_other_feature` null to avoid a task being blocked; a false negative here is
  exactly the failure this guard exists to prevent
- invent a scope bullet, request sentence, or sibling feature id that doesn't exist in the sources
  it was given
- treat "this feature will eventually need X" as in-scope justification for building X now, when a
  sibling feature already claims X

---

## Runtime Enforcement

When `belongs_to_other_feature` is non-null, the orchestrator refuses to write the proposed task
document. Instead, it records the target feature as blocked, pending the named sibling feature's
formalization, using the same blocker/state-update machinery as any other recoverable blocker (see
`src/orchestrator/orchestrator.ts`'s `planTaskFreely`/`planTaskFromRequest`/`planSubtask`). This is
deterministic and does not depend on the planner "getting it right" beyond honestly reporting what
it found — the enforcement is what actually stops the drift; the planner's job is only to surface
the match.

When a task elaborates a pre-declared task request, a second, independent check applies: the
orchestrator itself compares `task.scope.allowed_paths` against that task request's own
`scope.allowed_paths` (directory-prefix containment, not exact-set equality — see
`src/shared/pathPrefix.ts`). This check does not depend on the planner reporting anything at all;
it is computed from the two scope lists directly. If the elaborated task exceeds its boundary and
`scope_justification.deviation_reason` is null, the orchestrator refuses to write the task and
blocks the feature, citing exactly which paths exceeded the boundary. If `deviation_reason` is set,
the orchestrator accepts the widened task and persists the wider boundary back into the task
request's own `allowed_paths`, so later rendering and later task requests both see the feature's
current, real boundaries rather than a stale one from formalization time.
