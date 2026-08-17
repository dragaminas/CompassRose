# Request: Doctor Command

I want CompassRose to provide a `doctor` command.

The command should validate whether the current repository is ready to be used by CompassRose.

It should not call AI tools.
It should not modify files.
It should only read project-local files and report diagnostics.

The command should validate:

- `docs/compassrose/CONFIG.md` exists
- the configuration block can be parsed
- required configuration sections exist
- required documentation paths exist
- the current platform is supported
- the current directory is inside a Git repository
- configured commands are present or intentionally empty

Expected command:

```bash
compassrose doctor
```

Expected output should be clear, human-readable, and useful for debugging.
