# Request: Project Understanding

I want CompassRose to understand the current repository before planning or implementing anything.

CompassRose should inspect the repository and detect basic project facts such as:

- programming languages
- package manager
- build system
- test system
- source folders
- documentation folders
- Git status
- relevant config files

It should support both:

- initializing from an existing repository
- initializing from an empty or almost empty repository

The result should be written into project-local documentation, especially:

```text
docs/compassrose/PROJECT_STATE.md
```

This feature should not call implementers or reviewers.
Its purpose is repository diagnosis and state creation.
