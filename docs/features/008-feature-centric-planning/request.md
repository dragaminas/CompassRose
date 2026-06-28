# Request: Feature-Centric Planning

I want CompassRose planning to operate at the feature level.

CompassRose should not generate a long-lived executable task list upfront.
Instead, it should inspect the current feature state and repository state, then generate the next small task only when needed.

Planning should use:

- feature documentation
- architecture documentation
- feature state
- project state
- repository reality

The planner should produce one small task at a time.

This feature should reduce context size and avoid stale long-term task plans.
