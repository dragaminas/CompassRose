# Request: Bounded Work Item Context

The automated flow should build a bounded context for each feature, so the agent does not choke on
context and end up dropping important things from memory, and does not need to keep information in
a chat.

This is the foundational idea of CompassRose. Everything else is downstream of it.

Today the context of each step is assembled ad hoc in `promptBuilding.ts`. It works, but the limit
is implicit: nothing declares what goes in, nothing declares what stays out, and there is no budget.
When a step fails with `context_overflow`, the classification exists but there is no mechanism
behind it.

What I want:

- **A declared manifest per task.** Which documents, which code, which contracts. That is the floor,
  and it is all the agent receives. Nothing enters by accident.
- **Bounded exploration on top.** The agent may read a few more files when the manifest falls short —
  and what it read is recorded and joins the manifest of the next attempt. The manifest improves
  only when the work proves it needs to.
- **A budget that constrains task size, not runtime.** If the manifest does not fit, the task is too
  big and gets replanned smaller, before spending a single implementation call.
- **No conversational memory between tasks.** What one task learns and the next needs is written as
  a fact in the feature's state document and arrives through the manifest like anything else. If it
  is not written, it does not exist.

## Origin

Specified jointly with the user in the specification round of 2026-08-22. Absorbs request
`007-documentation-engine` in the part concerning what documentation is assembled for an agent call.
