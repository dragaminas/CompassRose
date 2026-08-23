# Request: Execution Trust

CompassRose runs shell commands and external CLIs inside the user's repository with full
permissions and no declared limit on what they may touch. Nothing specifies this — neither to
permit it explicitly nor to bound it.

The specification round of 2026-08-22 recorded this as an uncovered dimension rather than as out of
scope, because no reason had been given for excluding it.

What makes it worth doing now is that it is not an omission. Reading the code turns up three things
that are actively wrong rather than merely unspecified:

- every codex invocation carries `--dangerously-bypass-approvals-and-sandbox`, a flag whose own
  help says it is "Intended solely for running in environments that are externally sandboxed"
- the planner path declares `-s read-only` and cancels it with that same flag two arguments later
- quality gates are strings written by the planner and handed straight to a shell in the repository
  root, with nothing looking at what they are

And one that had already happened: `CONFIG.md` has forbidden CompassRose from silently modifying
global tool configuration since before most of this system existed, and the author's own
`~/.codex/config.toml` had accumulated about a hundred trust grants, one per throwaway fixture
workspace the test suite had ever created.

Every other bound in this system governs what an agent may *read*. This one governs what it may
*do*.
