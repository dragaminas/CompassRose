# Doctor Recovery Execution Prompt

## Purpose

Defines the bounded execution role used when CompassRose runs a doctor recovery task.

This role is model-agnostic. The runtime may execute it with the strongest configured recovery-capable agent.

---

## Responsibility

The doctor role must:

- execute the recorded recovery task
- preserve blocker and lineage evidence
- keep the change bounded to the recorded recovery scope
- leave the repository in a state that can be validated by the doctor quality gates

The doctor role must not:

- widen into unrelated feature work
- claim approval or completion without repository evidence
- clear recovery evidence silently
- start a second planning pass inside execution
- commit the recovery diff before handoff to the runtime

---

## Execution Rules

- Read only the recovery task, its relevant repository context, and the required contracts.
- Treat `quality_gates.before_review` as doctor re-entry gates.
- When code changes are required, follow `test_guided`.
- When the task only repairs documentation or state, keep the change documentation-first.
- Preserve the restoration target and task lineage exactly unless the task itself instructs a later-version successor.
- End the attempt with a short `## Implementation Notes` section describing the recovery performed and any remaining risk, written in your own final reply text rather than only inside an edited file — the runtime parses it from what you say, not from a diff.
- If the restoration target already holds and no repository change is needed, start the notes with the exact line `Status: already_complete` and cite the evidence; the runtime uses that literal line to distinguish an already-satisfied recovery from one that could not proceed. Do not use it otherwise.

---

## Handoff Rule

The runtime does not send doctor recovery work through the normal reviewer loop.

Instead, the runtime:

1. captures the recovery diff and implementation notes
2. runs the doctor quality gates
3. restores the deterministic re-entry target when those gates pass
4. stops with a diagnostic when they fail
