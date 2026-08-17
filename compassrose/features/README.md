# CompassRose Features

This folder contains feature requests ordered by implementation dependency.

Each feature starts with a human-readable `request.md` file.
CompassRose should later formalize each request into:

```text
feature.md
architecture.md
state.md
```

`feature.md` defines purpose, scope, deliverables, completion criteria, and the high-level implementation outline expressed as visible task requests.

`architecture.md` defines the feature-level boundaries and architectural constraints.

`state.md` records repository reality, progress against deliverables, progress against the visible task requests in the implementation outline, and the next planning hint.

After formalization, CompassRose should plan and execute one task at a time.
The feature may contain a high-level implementation outline made of task requests, but the active execution contract is always the current task, not the outline itself.
Feature-local `tasks/` folders may exist for archived or approved task documents, but they are not the canonical source for future planning.

The numeric prefix defines the recommended implementation order.
Earlier features create the infrastructure required by later features.

For the MVP, focus on features 001 to 010 first, with special priority on:

```text
001-project-identity-and-foundation
002-configuration-model
003-doctor-command
005-feature-request-intake
006-feature-formalization
010-generic-external-cli-adapter
```
