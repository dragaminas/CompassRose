# Request: Configurable AI Roles

I want CompassRose to support configurable roles without hardcoding providers.

The main roles are:

- planner
- implementer
- reviewer

Each role should be configured independently.
A role may use the generic external CLI adapter.
A role may be disabled where allowed by policy.

CompassRose should report role configuration clearly in diagnostics.

The same external tool or model may be used for multiple roles, but this should be visible to the user.

This feature should not add provider SDK integrations.
