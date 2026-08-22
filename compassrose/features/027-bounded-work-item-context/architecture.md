# Architecture: Bounded Work Item Context

## The Manifest

```ts
type ManifestEntryKind = 'specification' | 'architecture' | 'state' | 'contract' | 'code' | 'task';

interface ManifestEntry {
  readonly kind: ManifestEntryKind;
  readonly path: string;              // repository-relative, forward slashes
  readonly lines: readonly [number, number] | null;  // null = whole file
  readonly reason: string;            // why the planner included it
}

interface ContextManifest {
  readonly taskId: string;
  readonly role: 'planner' | 'implementer' | 'reviewer';
  readonly entries: readonly ManifestEntry[];
  readonly measuredSize: number;
  readonly budget: number;
}
```

Two properties carry the design:

- **`reason` is mandatory.** An entry nobody can justify is an entry that got in by habit. This is
  the field that keeps manifests from growing into "include the whole `src/` tree".
- **`lines` is available.** A 6,000-line `orchestrator.ts` is not a context entry; a named range of
  it is. Whole-file inclusion is legitimate for documents and contracts, rarely for code.

Paths are normalized to forward slashes on construction. This repository has already been bitten
once by a Windows separator reaching a comparison that assumed POSIX; the manifest is a new
comparison surface and takes the normalization at the boundary.

## Measurement

Size is measured in characters, not tokens. Token counts differ per provider, are unavailable
without a tokenizer dependency, and the project has none. A character budget is a deterministic,
provider-independent proxy, and the budget value in configuration is calibrated against it.

Measurement is over the assembled content, not the entry list, so a manifest's size is exactly the
size of what the agent receives.

## Where Manifests Come From

Task planning produces the manifest as part of the planned task, not as a separate step. The planner
already decides what a task touches; declaring it is making an existing decision explicit rather
than adding a new one.

Each role gets its own manifest for the same task, because they need different things: the
implementer needs the code and the task; the reviewer needs the diff, the acceptance criteria, and
the specification, but not the implementer's prompt.

## Budget Check and Replanning

The check happens at planning time, and its outcome is a planning verdict, not a runtime failure:

```
manifest.measuredSize > manifest.budget
  → reject the planned task
  → replan, with the overflow reported as the reason
  → bounded by the existing replan limit
```

This inverts the current failure shape. `context_overflow` today is discovered by an implementer
call that has already been paid for and has already half-written something. Moving the check to
planning means an oversized task costs one planning call.

If replanning cannot produce a task that fits — after its bound — the item is blocked with a
recoverability of `human`, because a feature whose smallest sensible task does not fit is a
specification problem, and `026-conversational-doctor-recovery`'s specification-correction exit is
where it belongs.

## Exploration Allowance

The manifest is the floor, not a cage. An implementer that finds its manifest insufficient may read
additional files, capped at a declared maximum count.

What makes this bounded rather than a loophole:

- the cap is a count, declared in configuration, enforced by the adapter layer
- every read beyond the manifest is recorded against the task with its path
- recorded reads are added to the manifest of that task's *next attempt* — a correction or a retry
- they are never added to a *different* task's manifest automatically; that would let one task's
  exploration silently inflate every later one

The asymmetry mirrors the dimensions checklist in `024-specification-flow`: the agent may grow a
declared floor, the growth is recorded, and it never happens silently.

## Cross-Task Inheritance

Removed entirely as an implicit mechanism. The replacement is a required output field:

```ts
interface ImplementationHandoff {
  readonly factsForNextTask: readonly string[];
}
```

These are written into the feature's `state.md` under Current Reality when the task is approved, and
that document is a manifest entry for every subsequent task in the feature. The path from "task A
learned something" to "task B knows it" runs through a human-readable document that a person can
read, correct, or delete.

An empty `factsForNextTask` is valid and common. What is not valid is a task that discovered
something material and did not write it — the reviewer contract gains that as a check.

## What Changes in `promptBuilding.ts`

Today prompts are assembled by call sites choosing what to include. The module becomes a renderer:
it takes a `ContextManifest`, reads exactly its entries, and emits the prompt. It gains no authority
to include anything a manifest does not name.

Existing agent-context logging (`logs/agent-contexts/`) already writes what each call received; it
becomes the verification surface for "the agent got exactly the manifest", and its records gain the
manifest itself.

## Constraints

- No new runtime dependencies, including tokenizers
- The manifest is the sole input; no call site may add to it
- Manifests are deterministic: same repository state, same manifest
- Exploration is capped, recorded, and scoped to the same task's next attempt
- No summaries, transcripts, or histories cross a task boundary
