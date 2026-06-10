# Request: Implementation Runner

I want CompassRose to delegate a generated task to an implementer.

The implementation runner should:

- receive a task file
- call the configured implementer role
- wait for the external process to finish
- capture exit status
- collect relevant output
- inspect resulting repository changes
- verify that task-defined minimum progress evidence exists
- distinguish read-only/passive tool completion from provider, permission, context, or CLI failures

The implementation runner should not decide whether the result is good.
It only executes the implementation step and prepares the result for quality gates and review.

For the MVP, implementation should be explicit and controlled, not fully autonomous.
