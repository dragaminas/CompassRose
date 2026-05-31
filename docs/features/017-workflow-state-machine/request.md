# Request: Workflow State Machine

I want CompassRose to persist workflow state clearly.

CompassRose should know where each feature or task is in the process.

Example states may include:

- request_pending
- formalized
- task_ready
- implementation_running
- implemented
- quality_failed
- review_pending
- review_failed
- correction_required
- completed

The state should be stored in project-local documentation or structured project-local files.

CompassRose should be able to recover after interruption.
