# CompassRose

## Overview

CompassRose is a deterministic software development orchestrator that advances a project toward a roadmap through iterative planning, implementation, and review cycles.

Unlike agent-based systems that attempt to plan and execute entire projects upfront, CompassRose continuously recalculates the next best step from the current state of the repository.

The roadmap provides direction.
The repository provides reality.
CompassRose continuously reconciles the two.

---

## Core Principles

### Roadmap-Driven

CompassRose works from milestones and goals, not predefined implementation tasks.

A roadmap describes **what must be achieved**, not **how it must be implemented**.

### Deterministic Orchestration

The orchestrator contains no AI.

Its responsibilities are:

- Load project state
- Select the next milestone
- Invoke planners
- Invoke implementers
- Invoke reviewers
- Update project state
- Repeat

All workflow decisions are explicit, deterministic, and auditable.

### Repository as Source of Truth

CompassRose treats the repository as the authoritative representation of the system.

Tasks are generated from:

- Roadmap intent
- Architecture knowledge
- Current repository state

Tasks are not long-lived artifacts. They are generated immediately before execution to avoid becoming obsolete as the codebase evolves.

### Separation of Responsibilities

Planning, implementation, and review are independent concerns.

This allows different models to be used for different activities:

- Local models for implementation
- Premium models for planning and review

---

## Philosophy

Traditional AI development systems attempt to generate a large implementation plan and then execute it.

CompassRose follows a different approach.

CompassRose does not attempt to predict the entire path.

It continuously determines the next correct step toward the destination.

Like a compass, it maintains direction while adapting to the terrain discovered along the way.

---

## High-Level Workflow

```text
Roadmap
    ↓
Planner
    ↓
Task
    ↓
Implementer
    ↓
Git Diff
    ↓
Reviewer
    ↓
Approved?
    ↓
Yes ───────────────► Update Project State
No
    ↓
Correction Task
    ↓
Implementer
```

The cycle continues until all roadmap milestones are completed.

---

## Architecture

### Core Components

```text
CompassRose
├── CLI
├── Project Analyzer
├── Planner
├── Implementer
├── Reviewer
├── Git Workspace
└── Orchestrator
```

### Project Analyzer

Responsible for understanding a repository.

Typical outputs:

- Languages
- Frameworks
- Build systems
- Test systems
- Existing architecture
- Existing documentation
- Repository structure

### Planner

Generates the next implementation task from:

- Roadmap
- Architecture
- Project state
- Planning rules

### Implementer

Executes a task and produces a Git diff.

Possible implementations:

- OpenCode
- Codex CLI
- Aider
- Local OpenAI-compatible models

### Reviewer

Validates produced changes.

Responsibilities:

- Verify task completion
- Verify acceptance criteria
- Detect architectural violations
- Generate correction tasks

### Git Workspace

Responsible for:

- Branch creation
- Commit creation
- Diff generation
- Merge operations

Git acts as the contract between implementation and review.

### Orchestrator

The deterministic engine coordinating all components.

Contains no AI.

---

## Getting Started

CompassRose supports:

- Existing repositories
- New repositories

### Existing Repository

Initialize CompassRose inside an existing repository:

```bash
compassrose init
```

CompassRose analyzes the repository and builds an initial project model.

Initialization may inspect:

- Source code
- Documentation
- Build configuration
- Test configuration
- Git history
- Repository structure

Workflow:

```text
Repository
    ↓
Repository Analysis
    ↓
Project Model
    ↓
Roadmap Generation
    ↓
User Review
    ↓
CompassRose Ready
```

### New Repository

Initialize CompassRose in an empty directory:

```bash
compassrose init
```

Example:

```text
Build a REST API for laboratory sample management.
```

CompassRose generates:

- Initial roadmap
- Initial architecture model
- Initial planning rules
- Initial execution rules

---

## Project State

CompassRose continuously maintains a representation of the project.

The project state contains:

- Architecture knowledge
- Implemented capabilities
- Pending capabilities
- Roadmap progress

```text
Roadmap
     +
Repository
     ↓
Project State
```

Future tasks are generated from the current project state rather than from a fixed task list.

This prevents planning from drifting away from the actual codebase.

---

## Creating a new feature

Create a numbered folder under `docs/features/`.

Write only `request.md` first. For example:

```text
docs/features/001-doctor-command/request.md
```

CompassRose will later formalize the request into the standard feature documentation set.
The numeric prefix defines the recommended implementation order.

---

## Documentation Model

### Roadmap

The roadmap describes intent.

Example:

```markdown
# Authentication

Users must be able to:

- Login
- Logout
- Reset passwords

# User Management

Administrators must be able to:

- Create users
- Edit users
- Disable users
```

The roadmap should describe outcomes, not implementation details.

### Software Architecture Document

The architecture model describes:

- Major modules
- Dependencies
- Constraints
- Architectural decisions

### Planning Rules

Planning rules define how implementation work should be decomposed.

Example:

```yaml
max_files_per_task: 5

requirements:
  atomic: true
  independently_testable: true
```

### Execution Rules

Execution rules constrain implementation behavior.

Example:

```yaml
tests:
  required: true

forbidden:
  - unrelated_changes
```

---

## Execution Model

CompassRose never generates the complete implementation plan upfront.

Instead it continuously navigates toward the roadmap.

```text
Roadmap
    ↓
Generate Next Task
    ↓
Implement
    ↓
Review
    ↓
Update Project State
    ↓
Generate Next Task
```

Each task is generated using:

- Current roadmap
- Current architecture
- Current repository state

Planning always reflects reality.

---

## Long-Term Vision

CompassRose is not an IDE assistant.

CompassRose is not an autonomous coding agent.

CompassRose is a navigation system for software development.

Its purpose is to automate the repetitive cycle between:

- Intent
- Planning
- Implementation
- Validation

while preserving:

- Determinism
- Auditability
- Architectural consistency
- Human control

The roadmap provides direction.

The repository provides reality.

CompassRose continuously reconciles the two.
