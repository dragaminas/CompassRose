# Request: Task Model

I want CompassRose to have a clear task model.

A task should be a small, bounded unit of work generated from a formalized feature.

The task should include:

- task id
- related feature id
- goal
- first executable step
- minimum progress evidence that cannot be satisfied by reading alone
- context
- constraints
- expected files or areas affected
- acceptance criteria
- quality gates
- review requirements
- explicit overrides, if any

Tasks should be generated on demand.

Task files should be project-local and suitable for passing to an external CLI implementer.

A task should not allow a read-only context pass to count as implementation progress.
