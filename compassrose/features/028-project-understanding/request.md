# Request: Project Understanding

CompassRose should understand the repository it is pointed at before specifying, planning, or
implementing anything. Today the only way it knows anything about a project is what a human typed
into `CONFIG.md` at setup, which works for this repository and for no other.

This flow does not always start from zero. It has to work when pointed at a project that already
exists, with code and with no documented features at all.

What it should detect:

- programming languages, package manager, build system, test system
- source folders, documentation folders, relevant config files
- git status
- which commands are the project's quality gates

How it should detect it:

- **Deterministically first.** A `package.json`, a `tsconfig.json`, a `go.mod`, a declared script —
  these are facts, not opinions, and they should be read as facts.
- **AI only for the gaps.** What the project actually does, which of five plausible commands is the
  real gate. Anything inferred is marked as inferred until I confirm it.

And when it is pointed at a large existing codebase with nothing documented, it should produce an
inventory of what exists — modules, apparent responsibilities, entry points — and bring that to the
specification conversation as *material*, not as truth. I decide which parts become documented
features and which stay as unspecified legacy. Nothing gets formalized without me.

Detection re-runs when the signals change. If what it detects contradicts what I confirmed, it tells
me instead of overwriting me.

## Origin

Specified jointly with the user in the specification round of 2026-08-22. Replaces request
`004-project-understanding`, the only one of the original twenty-two with no implementation at all.
