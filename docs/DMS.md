# CompassRose Documentation Model Specification

## Purpose

This document defines the documentation model used by CompassRose.

CompassRose treats documentation as the primary user interface.

The documentation model defines:

- Which documents exist
- What each document is responsible for
- Who owns each document
- Which documents are human-editable
- Which documents are generated or updated by CompassRose
- How roadmap, features, tasks, configuration, and project state relate to each other

---

## Core Principle

Documentation is not a secondary output artifact.

Documentation is the control surface of CompassRose.

The user controls CompassRose by reading, editing, approving, and maintaining project documentation.

---

## Documentation Layers

CompassRose documentation is organized into four layers:

```text
Project Layer
Feature Layer
Execution Layer
Configuration Layer
```

---

# 1. Project Layer

The Project Layer describes the whole project.

Suggested structure:

```text
docs/
├── README.md
├── ROADMAP.md
├── SAD.md
├── UX.md
├── ADR.md
└── DMS.md
```

## 1.1 README.md

### Responsibility

Explains what the project is.

### Ownership

Human-owned.

### Editable by User

Yes.

### Updated by CompassRose

Only with explicit user approval.

---

## 1.2 ROADMAP.md

### Responsibility

Defines project direction.

The roadmap describes outcomes, not implementation tasks.
The actionable order is represented by numbered feature folders under `docs/features/`.

### Ownership

Human-owned, CompassRose-assisted.

### Editable by User

Yes.

### Updated by CompassRose

Only with explicit user approval.

### Contains

- Vision
- Features
- Milestones
- Status
- High-level goals
- Success criteria

### Does Not Contain

- Implementation tasks
- File-level instructions
- Temporary subtasks
- Detailed technical plans

---

## 1.3 SAD.md

### Responsibility

Defines the software architecture of the project.

### Ownership

Human-owned, CompassRose-assisted.

### Editable by User

Yes.

### Updated by CompassRose

Only with explicit user approval.

### Contains

- Architectural principles
- System context
- Major components
- Integration model
- Constraints
- Risks
- Non-goals

---

## 1.4 UX.md

### Responsibility

Defines how users interact with CompassRose.

### Ownership

Human-owned.

### Editable by User

Yes.

### Updated by CompassRose

Only with explicit user approval.

---

## 1.5 ADR.md

### Responsibility

Records accepted architectural decisions.

### Ownership

Human-owned.

### Editable by User

Yes.

### Updated by CompassRose

Only with explicit user approval.

### Rule

ADR entries are short, decisive, and non-argumentative.

---

## 1.6 DMS.md

### Responsibility

Defines the documentation model.

### Ownership

Human-owned.

### Editable by User

Yes.

### Updated by CompassRose

Only with explicit user approval.

---

## Feature Intake Model

A feature does not need to start as a fully structured CompassRose feature.

A feature may start as:

```text
docs/features/001-doctor-command/request.md
```

`request.md` is human-authored plain-text or Markdown input.

If a feature folder contains `request.md` but does not yet contain `feature.md`, `architecture.md`, and `state.md`, it is a pending feature request.

CompassRose formalizes that request into the standard feature documentation set:

```text
request.md
feature.md
architecture.md
state.md
```

The generated files are CompassRose-structured documentation.

Formalization is not the same as task generation.

Feature formalization creates the canonical feature documents.
Task planning uses those documents plus current repository reality to produce the next task only.

The numeric prefix defines the recommended implementation order.

# 2. Feature Layer

The Feature Layer organizes project knowledge by feature.

Feature-centric documentation is required to reduce context size and avoid project-wide noise.
Feature folders are numbered. The numeric prefix defines the recommended implementation order.

Suggested structure:

```text
docs/
└── features/
    └── <number>-<kebab-case-name>/
        ├── request.md
        ├── feature.md
        ├── architecture.md
        ├── state.md
        ├── tasks/
        └── config.md
```

`config.md` is optional.
`tasks/` is optional and may contain archived or approved task documents, but it is not the canonical source for future planning.

---

## 2.1 feature.md

### Responsibility

Defines feature intent.

### Ownership

Human-owned, CompassRose-assisted.

### Editable by User

Yes.

### Updated by CompassRose

Only with explicit user approval.

### Contains

- Purpose
- Scope
- Out of scope
- User value
- Goals
- Acceptance criteria
- Implementation deliverables
- Completion criteria
- High-level implementation outline

### Does Not Contain

- The active task contract
- A long-lived generated backlog
- Detailed code instructions
- Temporary review comments

---

## 2.2 architecture.md

### Responsibility

Defines architecture relevant to the feature.

### Ownership

Shared.

### Editable by User

Yes.

### Updated by CompassRose

Only with explicit user approval.

### Contains

- Relevant modules
- Boundaries
- Interfaces
- Dependencies
- Constraints
- Feature-level architectural decisions

---

## 2.3 state.md

### Responsibility

Describes the current reality of the feature.

### Ownership

CompassRose-owned, human-reviewable.

### Editable by User

Yes, but with care.

### Updated by CompassRose

Yes, after approved changes.

### Contains

- Lifecycle state
- Runtime-oriented operational status
- Implemented deliverables
- Remaining deliverables
- Progress against the implementation outline
- Known gaps
- Blockers
- Last approved change
- Next planning hint

### Rule

`state.md` must reflect the repository as it exists now.

It must not describe an imagined future.

`state.md` must expose one operational lifecycle state that the runtime can read deterministically.
Narrative sections provide supporting context, but they must not replace the lifecycle state as the transition key.

`state.md` is updated after approved work.
`architecture.md` is updated only when feature-level structural truth changes.
`SAD.md` is updated only when the accepted change affects project-wide architecture.

The canonical operational contract for feature state is:

```text
src/contracts/state/feature-state.md
```

---

## 2.4 config.md

### Responsibility

Defines feature-local configuration overrides.

### Ownership

Human-owned.

### Editable by User

Yes.

### Updated by CompassRose

No, unless explicitly approved.

### Contains

- Development policy override
- Quality gate override
- Role override
- Task size limits
- Allowed paths
- Review policy

### Rule

Feature configuration affects only the owning feature.

---

# 3. Execution Layer

The Execution Layer contains temporary artifacts created during planning, implementation, and review.

Suggested structure:

```text
docs/
└── compassrose/
    └── runs/
        └── <run-id>/
            ├── task.md
            ├── implementation.md
            ├── review.md
            └── result.md
```

Execution artifacts are auditable, but they are not the primary planning source.

Future planning is based on current project state, not old task history.

Execution artifacts consume canonical contracts from `src/contracts/`.
They do not redefine task, review, or correction-task structure.

---

## 3.1 task.md

### Responsibility

Defines the current task.

### Ownership

CompassRose-generated, human-reviewable.

### Editable by User

Yes, before execution.

### Updated by CompassRose

Yes.

### Contains

- Task ID
- Related feature
- Objective
- Context
- Constraints
- Allowed paths
- Acceptance criteria
- Quality gates
- Development policy

---

## 3.2 implementation.md

### Responsibility

Records implementation output.

### Ownership

CompassRose-generated.

### Editable by User

Normally no.

### Updated by CompassRose

Yes.

### Contains

- Implementer used
- Model used
- Files changed
- Git diff reference
- Implementation notes
- Command output summary

---

## 3.3 review.md

### Responsibility

Records review output.

### Ownership

CompassRose-generated.

### Editable by User

Normally no.

### Updated by CompassRose

Yes.

### Contains

- Reviewer used
- Review status
- Findings
- Required corrections
- Optional correction task

The optional correction task must conform to `src/contracts/task/correction-task.md`.

---

## 3.4 result.md

### Responsibility

Records final task outcome.

### Ownership

CompassRose-generated.

### Editable by User

Normally no.

### Updated by CompassRose

Yes.

### Contains

- Final status
- Commit reference
- Merge status
- Project state update summary
- Follow-up notes

---

## 3.5 Canonical Role Prompts

Structured role prompts are repository-local source-of-truth documents.

Suggested structure:

```text
src/contracts/
├── planner/
│   ├── feature-planning-prompt.md
│   └── task-planning-prompt.md
├── implementer/
│   └── task-execution-prompt.md
└── reviewer/
    ├── review-prompt.md
    └── correction-task-prompt.md
```

These documents define how CompassRose asks external tools to:

- formalize a feature from a user request
- generate the next task from feature documents and repository reality
- execute a task
- review implementation results
- produce a correction task when review fails

The prompt documents must align with the structured contracts under `src/contracts/`.

---

## 3.6 Operational Contracts

CompassRose also relies on repository-local operational contracts that are not role prompts.

Suggested structure:

```text
src/contracts/
├── runtime/
│   └── operation-loop.md
└── state/
    └── feature-state.md
```

These documents define:

- the canonical feature lifecycle state model
- the deterministic runtime loop order
- the allowed lifecycle transitions
- the stop and recovery rules that the runtime must follow

---

# 4. Configuration Layer

The Configuration Layer defines how CompassRose operates for a project.

Suggested structure:

```text
docs/
└── compassrose/
    ├── CONFIG.md
    └── PROJECT_STATE.md
```

---

## 4.1 CONFIG.md

### Responsibility

Defines project-level CompassRose behavior.

### Ownership

Human-owned.

### Editable by User

Yes.

### Updated by CompassRose

Only with explicit user approval.

### Contains

- Execution mode
- Role configuration
- Adapter configuration
- Development policy
- Quality gates
- Command configuration
- Git policy
- Limits

### Format

Markdown with parseable YAML blocks.

Example:

````markdown
# CompassRose Configuration

## Execution Mode

```yaml
mode: assisted
```

## Development Policy

```yaml
development_policy:
  default: test_guided
  allowed:
    - test_guided
    - implementation_first
    - documentation_first
```

## Quality Gates

```yaml
quality_gates:
  before_review:
    - typecheck
    - test

commands:
  typecheck: npm run typecheck
  test: npm test
```
````

---

## 4.2 PROJECT_STATE.md

### Responsibility

Describes the current project-wide state.

### Ownership

CompassRose-owned, human-reviewable.

### Editable by User

Yes, but with care.

### Updated by CompassRose

Yes, after approved changes.

### Contains

- Current roadmap progress
- Known features
- Implemented capabilities
- Pending capabilities
- Known architecture reality
- Current limitations
- Last approved change

### Rule

`PROJECT_STATE.md` must describe reality, not intention.

---

# Ownership Model

CompassRose documents use one of three ownership models.

## Human-Owned

The user controls the document.

CompassRose may suggest changes but must not modify it without approval.

Examples:

- ROADMAP.md
- SAD.md
- ADR.md
- UX.md
- CONFIG.md
- request.md
- feature.md

---

## CompassRose-Owned

CompassRose controls the document.

The user may inspect and occasionally correct it.

Examples:

- PROJECT_STATE.md
- feature state.md
- run result.md

---

## Shared

Both the user and CompassRose may contribute.

CompassRose must avoid silent changes.

Examples:

- feature architecture.md
- generated roadmap drafts
- generated feature drafts

---

# Configuration Precedence

CompassRose configuration is hierarchical.

More specific scopes override less specific scopes.

Precedence:

```text
Task
> Feature
> Project
> User
> CompassRose Defaults
```

Examples:

- A task may override the development policy.
- A feature may override the reviewer model.
- A project may define default quality gates.
- A user may define default provider credentials.
- CompassRose provides fallback defaults.

---

# Markdown and YAML Policy

CompassRose is Markdown-first.

Markdown is used for human-facing documentation.

YAML is used only inside Markdown blocks when strict structured configuration is required.

Rule:

```text
.md = human-facing project knowledge
yaml blocks = parseable configuration or contracts
```

CompassRose should avoid forcing users to author standalone YAML files for project intent.

---

# Task Model

Tasks are temporary execution artifacts.

Tasks are generated on demand.

Tasks are not the long-term planning source.

A task must be traceable to:

```text
Roadmap Objective
    ↓
Feature
    ↓
Current Feature State
    ↓
Task
```

---

# State Model

State documents describe reality.

They must not become wish lists.

State updates occur after approved changes.

State is used by the planner to avoid obsolete assumptions.

---

# Roadmap to Feature Relationship

The roadmap provides direction.

The actionable roadmap is represented by numbered feature folders under `docs/features/`.

The numeric prefix defines the recommended implementation order.

`ROADMAP.md` remains a high-level vision document, not the operational source of truth.

Features provide scoped intent.

Feature state provides current reality.
Feature lifecycle state provides the runtime transition key.
Tasks are generated from the gap between intent and reality.

```text
docs/features/<number>-<kebab-case-name>/request.md
    ↓
feature.md
    ↓
state.md
    ↓
task.md
```

---

# Human Review Points

The user may review CompassRose output at different levels.

## Roadmap Review

Before major work begins.

## Feature Review

Before a feature is executed or marked complete.

## Task Review

Before a specific task is implemented.

## Result Review

Before approved changes are merged or accepted.

---

# Minimum Documentation Set

A minimal CompassRose-compatible repository should contain:

```text
docs/
├── ROADMAP.md
├── SAD.md
├── ADR.md
├── UX.md
├── DMS.md
├── compassrose/
│   ├── CONFIG.md
│   └── PROJECT_STATE.md
└── features/
    └── <number>-<kebab-case-name>/
        ├── request.md
        ├── feature.md
        ├── architecture.md
        └── state.md
```

---

# Success Criteria

The documentation model is successful if:

1. A technical user can understand project direction by reading `ROADMAP.md`.
2. A technical user can create a pending feature request by writing `request.md` in a numbered feature folder.
3. A technical user can understand feature intent by reading `feature.md`.
4. A technical user can understand feature reality by reading `state.md`.
5. CompassRose can formalize a pending feature request into structured feature documentation.
6. CompassRose can generate tasks without reading the whole repository every time.
7. CompassRose can update project state after approved changes.
8. The repository remains understandable without running CompassRose.
9. CompassRose itself can use this documentation model to develop CompassRose.
