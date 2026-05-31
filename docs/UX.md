# CompassRose UX Specification

This document defines the user experience principles and interaction model for CompassRose.

## Core Principle

Documentation is the primary user interface.
The CLI is the execution interface.

## UX Highlights

- Documentation-centric workflow
- Roadmap-driven planning
- Feature-centric organization
- Manual, Assisted and Autonomous modes
- Explainable task generation
- Human-editable project intent
- Repository as source of truth

## Documentation Structure

```text
/docs
├── roadmap.md
└── features/
    ├── authentication/
    │   ├── feature.md
    │   ├── architecture.md
    │   └── state.md
    └── ...
```

## User Journey

1. Initialize project.
2. Review generated roadmap.
3. Adjust features and priorities.
4. Execute tasks.
5. Review progress.
6. Continue iterating.

## Control Modes

### Manual
User approves every task.

### Assisted
User approves feature completion.

### Autonomous
User approves roadmap intent and CompassRose executes until blocked.

## Success Criteria

A technical user should be able to understand the project state directly from repository documentation.
