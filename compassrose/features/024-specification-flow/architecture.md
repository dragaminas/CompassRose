# Architecture: Specification Flow

## Boundaries

This flow owns everything from "a human has an idea, or a request folder exists" up to "a validated
specification exists in the repository". It owns no planning, no task generation, and no execution.

The line it must hold is that no specification content ever reaches disk without having passed
through a human decision or an explicitly-recorded agent fill. A specification whose provenance is
unknown is a defect.

## What Moves Out of the Automated Loop

`determineNextStep` currently treats a `request.md`-only folder as a startable item and dispatches
formalization to the planner adapter. That path is removed.

In its place, an unspecified item becomes a reported fact, not a step: the loop lists what is
pending specification and continues with what is validated. The inspection kind for that state
becomes non-startable and non-continuing, joining `awaiting_validation`, `blocked_on_fix`, and
`blocked_on_human` in `isContinuingInspectionKind`'s exclusion list.

This is a deliberate narrowing of the loop's authority. It cannot create specification content any
more, only consume it.

## Competency Profile

```ts
type CompetencyAxis = 'product' | 'architecture' | 'implementation';
type CompetencyOwner = 'human' | 'agent';
type SessionCompetencyProfile = Readonly<Record<CompetencyAxis, CompetencyOwner>>;
```

Held in memory for the duration of one session. Never serialized to any repository file, never read
from one. A second person opening a session in the same repository declares their own and inherits
nothing.

The profile is an input to every agent call in the flow. It selects behavior, not content: on a
human-owned axis the agent must surface a structured decision rather than choosing; on an
agent-owned axis it must choose and state its reasoning.

What *is* persisted is provenance — a per-section marker in the generated specification recording
whether a human decided it or the agent filled it. That is a fact about the document, not about the
person, and it does not constrain any future session.

## Structured Decisions

A schema-validated agent output, mirroring the existing contract discipline in
`src/contracts/brainstormer/`:

```ts
interface StructuredDecision {
  readonly axis: CompetencyAxis;
  readonly question: string;
  readonly options: readonly {
    readonly label: string;
    readonly consequence: string;
    readonly recommended: boolean;
  }[];
}
```

Exactly one option carries `recommended: true`. The agent may emit a decision only for an axis the
human owns; emitting one for an agent-owned axis is a contract violation and is rejected by the
validator, not silently tolerated.

The human's answer is an index or a free-text alternative. Both are recorded verbatim in the
transcript that feeds the drafting call.

## Dimensions

`compassrose/DIMENSIONS.md` is a document, not configuration. `CONFIG.md` stays policy — commands,
roles, limits — and is not touched by this flow.

Each dimension carries a state, and every state transition is human-authored:

| State | Meaning | Set by |
|---|---|---|
| `uncovered` | declared, no feature covers it | initial, or a covering feature was removed |
| `covered` | one or more features cover it | drafting a feature that addresses it |
| `out_of_scope` | deliberately excluded | a human discard, with a mandatory reason |

Discards and reopenings append; they never overwrite. A reopened dimension keeps the prior decision
visible with its original author and date, so the document reads as a history of judgment rather
than a current-value store.

An agent-proposed dimension is a proposal until a human accepts it. Proposals are not written to the
document. Accepting one appends it to the declared list; discarding one records it as `out_of_scope`
with the human's reason, which is what prevents it from being re-proposed every session.

Note the asymmetry that keeps this bounded: the agent may only ever *grow* the declared list, and
only through a human decision. It can never remove a dimension, never mark one covered on its own,
and never override a discard.

## Ordering

The flow resolves in one fixed order, and the order is not negotiable by the model:

1. items pending specification (`request.md`, no `feature.md`)
2. items pending validation (`feature.md`, `validation: not_started`)
3. a new idea from the human

Each item in stages 1 and 2 is resolved to completion or explicitly deferred before the next is
offered. This is the same one-at-a-time discipline `brainstorm.ts` already applies to validation,
extended to cover the stage that was missing.

## Bounds

Every loop declares its ceiling, per the existing convention:

- turns per idea before the flow insists on drafting or dropping
- ideas per session
- validation rounds per item (existing, `validationLoop.ts`)
- structured decisions per idea, so a decision-happy model cannot turn a specification into an interrogation

## Reuse

Substantial parts already exist and are extended rather than replaced:

- `src/cli/brainstorm.ts` — the conversational loop, keyword discipline, and bootstrap check
- `src/cli/validationLoop.ts` — the validation rounds and the `listo` confirmation
- `src/contracts/brainstormer/` — turn prompt, output schema, contract types
- `orchestrator.draftBrainstormedFeature`, `confirmFeatureValidation`, `listFeaturesAwaitingValidation`

The CLI entry point (`brainstorm.ts`'s readline loop) is what is displaced: this flow becomes a set
of orchestrator operations driven by the session in `023-terminal-session`, with the standalone
`brainstorm` subcommand retained as a non-interactive-friendly alias.

## Constraints

- No specification content on disk without recorded provenance
- The competency profile never touches the filesystem
- The automated loop loses the ability to author specifications
- Dimension state changes only through human decisions
- Zero new runtime dependencies
