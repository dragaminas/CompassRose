# Feature Scope Guard

## Purpose

Defines how a planned task's `scope_justification` (see `src/contracts/planner/output.md`) must be
grounded, so a task that quietly extends beyond its feature's declared scope — or duplicates work
that actually belongs to a sibling feature — is caught at planning time instead of accumulating
one plausible-looking task at a time.

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
`src/orchestrator/orchestrator.ts`'s `planTask`/`planSubtask`). This is deterministic and does not
depend on the planner "getting it right" beyond honestly reporting what it found — the enforcement
is what actually stops the drift; the planner's job is only to surface the match.
