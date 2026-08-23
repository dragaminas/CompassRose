# CompassRose Features

Each feature starts with a human-readable `request.md`. The specification flow turns it, in
conversation with a human, into:

```text
feature.md        purpose, scope, user-facing behavior, acceptance criteria, implementation outline
architecture.md   feature-level boundaries and architectural constraints
state.md          repository reality, progress, and the next planning hint
```

The numeric prefix defines the recommended implementation order.

## Current features

| Feature | State | What it is |
|---|---|---|
| `001-project-identity-and-foundation` | completed | repository identity, structure, foundation documents |
| `002-configuration-model` | completed | project-local configuration loading and validation |
| `003-doctor-command` | completed | read-only repository readiness diagnostics |
| `023-terminal-session` | implemented | one interactive terminal session as the primary interface |
| `024-specification-flow` | in progress | the conversation that produces validated specifications |
| `025-automated-development-loop` | in progress | plan → implement → gate → review, over validated work |
| `026-conversational-doctor-recovery` | in progress | unblocking through questions instead of repair tasks |
| `027-bounded-work-item-context` | in progress | declared, budgeted context manifests per task |
| `028-project-understanding` | in progress | knowing what repository CompassRose is pointed at |
| `029-runnable-application-gate` | in progress | checking the application actually starts before closing a feature |
| `030-execution-trust` | in progress | what a run is allowed to do to the repository it is pointed at |
| `021-vscode-integration` | request only | a future visualization layer over the documents |
| `022-ecosystem-and-metrics` | request only | future CI, metrics, cost tracking, team workflows |

## Coverage

The specification round closed with a coverage report over the dimensions of the application.
Nine were covered. Three were not, and one of them — nothing verified that the application actually
runs, despite that being the stated goal of the whole loop — was specified immediately as
`029-runnable-application-gate`.

Two were left **uncovered**, deliberately recorded as uncovered rather than out of scope, because no
reason was given for excluding them:

| Dimension | Why it matters | State |
|---|---|---|
| distribution and installation | `bin` exists in `package.json` but is never published; all real use runs through `npm run` inside this repository. If the interface is the terminal, installing it is part of the product. | still uncovered |
| execution trust | CompassRose ran shell commands and external CLIs inside the user's repository with full permissions and no declared limit on what they may touch. | covered by `030-execution-trust` |

Reading the code to specify execution trust turned up that it had not been unspecified so much as
decided the other way: every agent call disabled the CLI's own sandbox, overriding what the user had
declared in their own tool configuration. An uncovered dimension is not always an absence.

That coverage report lived only in this file until 2026-08-23, when `compassrose/DIMENSIONS.md` was
finally written. The nine dimensions the round covered are not reconstructed there — the report
names none of them, and guessing the mapping would put an invention into the project's history.

## The specification round of 2026-08-22

The original twenty-two requests decomposed CompassRose by *component* — task model, git
integration, quality gates, review runner. That decomposition described how the system would be
built, not what it does for the person using it, and in practice the implementation ran far ahead of
it: seventeen of those requests were built in the code while their documents still said
`request.md` only.

They were re-cut into six features describing the product as its author states it: two flows — a
specification conversation and an automated development loop — plus the bounded context that makes
them work, the conversation that recovers them when they fail, the terminal that hosts them, and the
understanding of whatever repository they are pointed at.

Each of the seven has working implementation; what is left in each is recorded under its own
Remaining Deliverables, not glossed as done. `compassrose/` gained three documents alongside
`CONFIG.md` and `PROJECT_STATE.md`, one per distinct concern: `DIMENSIONS.md` (what the
specification must cover), `PROJECT_FACTS.md` (what CompassRose knows about this repository, and how
it knows it), and the per-feature documents that were already there.

The absorbed requests are preserved verbatim under `../absorbed-requests/`. Each remains readable and
referenced from the feature that took over its scope; none were deleted.

| Absorbed request | Reality when absorbed | Taken over by |
|---|---|---|
| `004-project-understanding` | not built | `028-project-understanding` |
| `005-feature-request-intake` | built | `024-specification-flow` |
| `006-feature-formalization` | built | `024-specification-flow` |
| `007-documentation-engine` | partially built | `024`, `027` |
| `008-feature-centric-planning` | built | `025-automated-development-loop` |
| `009-task-model` | built | `025`, `027` |
| `010-generic-external-cli-adapter` | built, drifted to provider-specific | `025-automated-development-loop` |
| `011-configurable-ai-roles` | built | `025-automated-development-loop` |
| `012-implementation-runner` | built | `025-automated-development-loop` |
| `013-quality-gates` | built | `025-automated-development-loop` |
| `014-git-integration` | built | `025-automated-development-loop` |
| `015-review-runner` | built | `025-automated-development-loop` |
| `016-correction-task-flow` | built | `025-automated-development-loop` |
| `017-workflow-state-machine` | built | `025-automated-development-loop` |
| `018-deterministic-orchestration-loop` | built | `025-automated-development-loop` |
| `019-autonomous-execution-modes` | partially built | `023`, `025` |
| `020-self-application` | in practice, this repository | `023` through `028` |

`021` and `022` were not absorbed. They remain genuine future requests, pending specification.
