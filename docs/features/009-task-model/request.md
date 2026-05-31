# Request: Task Model

I want CompassRose to have a clear task model.

A task should be a small, bounded unit of work generated from a formalized feature.

The task should include:

- task id
- related feature id
- goal
- context
- constraints
- expected files or areas affected
- acceptance criteria
- quality gates
- review requirements
- explicit overrides, if any

Tasks should be generated on demand.

Task files should be project-local and suitable for passing to an external CLI implementer.
