# Agent Invocation Context

TypeScript contract: `src/contracts/runtime/agentContext.ts`.

This contract describes the exact context that CompassRose logs before it sends
work to an external agent.

The logged artifact is intentionally self-contained:

- the run identifier and timestamp
- the agent role and invocation kind
- the exact prompt string
- the source paths referenced by the prompt
- the tool command and model used
- the repository workspace snapshot
- the project configuration snapshot

CompassRose stores these records under `.git/proto-compassrose/logs/agent-contexts/`
so a failed run can be debugged from the actual context that was sent, not only
from the downstream failure summary.
