# Request: Git Integration

I want CompassRose to use Git as the contract between implementation and review.

CompassRose should inspect Git status before and after task execution.

It should support:

- detecting clean or dirty worktrees
- capturing diffs
- identifying changed files
- using git diff as review input
- preserving traceability

For the MVP, CompassRose should not automatically commit changes unless explicitly configured later.

Branch-per-task support can be optional or future work.
