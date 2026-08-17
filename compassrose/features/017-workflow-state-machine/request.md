# Request: Workflow State Machine

I want CompassRose to persist workflow state clearly.

CompassRose should know where each feature or task is in the process.

Example states may include:

- request_pending
- formalization_pending
- formalized
- task_planning_pending
- task_ready
- implementation_running
- implementation_failed
- quality_gates_pending
- quality_failed
- review_pending
- review_failed
- correction_pending
- blocked
- completed

The state should be stored in project-local documentation or structured project-local files.

CompassRose should be able to recover after interruption.

For the MVP, this should be formalized as a canonical repository-local contract that defines:

- the runtime-readable fields in `state.md`
- valid lifecycle states
- valid state transitions
- invariants
- recovery rules

Proposed contract location:

```text
src/contracts/state/feature-state.md
```
