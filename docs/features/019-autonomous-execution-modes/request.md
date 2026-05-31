# Request: Autonomous Execution Modes

I want CompassRose to support different levels of delegation.

The execution mode should be configurable.

Initial modes:

- interactive
- semi_automatic
- automatic

Interactive mode should require user decisions at important points.
Semi-automatic mode may continue through safe steps.
Automatic mode may run unattended when configured.

This feature should build on the deterministic orchestration loop and configured limits.

Long-running unattended execution is not required for the MVP.
