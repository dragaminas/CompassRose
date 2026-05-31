# Request: Configuration Model

I want CompassRose to have a project-local configuration model.

The configuration should live in documentation, primarily under:

```text
docs/compassrose/CONFIG.md
```

CompassRose should be able to read and validate this configuration without modifying global settings from external tools.

The configuration hierarchy should be:

```text
Task > Feature > Project > User > CompassRose Defaults
```

For the MVP, only project-level configuration is required.

This feature should define how CompassRose understands:

- execution mode
- roles
- generic external CLI adapter
- development policy
- review policy
- quality gates
- commands
- git policy
- limits
- supported platforms
- documentation paths

Provider-specific adapters are out of scope for the MVP.
