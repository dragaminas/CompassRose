# Architecture: Project Understanding

## Provenance Is the Core Type

Every fact carries where it came from, and the three sources are not interchangeable:

```ts
type FactProvenance =
  | { readonly kind: 'detected'; readonly signal: string }        // the file that proved it
  | { readonly kind: 'inferred'; readonly at: string }            // an AI call, unconfirmed
  | { readonly kind: 'confirmed'; readonly by: string; readonly at: string };

interface ProjectFact<T> {
  readonly value: T;
  readonly provenance: FactProvenance;
}
```

The precedence rule is one line and it governs the whole feature: **`confirmed` outranks
`detected` outranks `inferred`**. A later detection never overwrites a confirmation; it raises a
contradiction and waits.

Without this, the feature degrades into the failure mode the user rejected everywhere else in this
round — a machine quietly replacing a human decision with its own guess.

## Detection Registry

A table of signals, not a chain of heuristics:

| Signal file | Establishes |
|---|---|
| `package.json` | Node project, declared scripts, package manager hints |
| `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` | which package manager |
| `tsconfig.json` | TypeScript, source roots, output dir |
| `pyproject.toml` / `setup.py` / `requirements.txt` | Python, its build backend |
| `go.mod` | Go, module path |
| `Cargo.toml` | Rust, workspace layout |
| `*.csproj` / `*.sln` | .NET |
| `pom.xml` / `build.gradle` | Java, its build system |

Adding language support means adding a row. Each row is a pure function from file content to facts,
independently testable with a fixture, and nothing in the registry calls an AI.

Directory conventions (`src/`, `tests/`, `docs/`) are detected but always rank below a manifest that
declares the same thing explicitly.

## Where Inference Is Allowed

Deliberately narrow, because the point of the deterministic layer is that most of this is not a
judgment call:

- **What the project is for.** No file states this. Inference reads the README, the package
  description, and entry-point names.
- **Which candidate commands are the quality gates.** Detection finds every declared script;
  choosing which of `test`, `test:unit`, `test:ci`, `check` is *the* gate is a judgment.
- **Apparent responsibility of a module group** in the inventory.

Everything else — language, package manager, source roots, script names — is detected or absent.
Inference is never allowed to produce a fact the registry could have established.

## Facts Document

`compassrose/PROJECT_FACTS.md`, sitting alongside `CONFIG.md` (policy), `PROJECT_STATE.md` (progress),
and `DIMENSIONS.md` (specification coverage). Four documents, four distinct concerns, none of them
overloaded.

It records each fact with its value and provenance, so reading it answers "does CompassRose actually
know this, or did it guess?" without running anything.

Quality-gate candidates derived here feed `CONFIG.md`'s gate configuration, but do not write it:
configuration stays human-owned, and detection proposes.

## Code Inventory

Grouping is by directory structure and import relationships, both readable without analysis
tooling. Apparent responsibility per group is inferred and marked as such.

The inventory is a projection, not a stored artifact. It is computed when the specification
conversation asks for it, because a stored inventory of a moving codebase is stale by definition and
becomes another document nobody trusts.

The critical constraint, and the one that distinguishes the accepted design from the rejected one:
the inventory is **input to a conversation**, never input to a formalizer. There is no code path
from inventory to `feature.md`. The path runs inventory → conversation → human decision →
`024-specification-flow`.

## Re-Detection

Signals carry a fingerprint — path plus content hash — recorded with the facts. On session or run
start, fingerprints are compared. Unchanged signals mean no work.

A changed signal re-runs only the rows that depend on it. A re-detected value differing from a
`confirmed` fact produces a contradiction report; the confirmed value stays in force until the human
resolves it.

Re-detection never calls an AI on its own. Gap inference happens only when a human is present to
confirm it, which is the only state in which an inferred fact can become useful.

## Constraints

- No new runtime dependencies
- No network calls
- No writes outside CompassRose's own documents
- Detection alone must work on a repository with no CompassRose documents
- Inference may never produce a fact the detection registry could establish
- A confirmed fact is never overwritten by a machine
