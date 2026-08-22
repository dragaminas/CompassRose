# Request: Conversational Doctor Recovery

When the automated flow fails, it should be recoverable by a doctor recovery that, in case of total
blockage, interacts with me to discover the root of the blockage and unblock it together — not
through opaque artifacts and overflowing documentation, but through simple questions and answers.

Today the opposite happens. Two automatic mechanisms chain: a cheap diagnostic autocorrection, and
an expensive doctor-recovery task that plans and executes a whole repair task, writes recovery
lessons, and compacts recovery history. Feature `003` accumulated nine of the second kind —
`F003-DR01` through `F003-DR09` — without ever unblocking, and produced exactly the overflowing
documentation I do not want. At no point did it ask me anything.

What I want instead:

- one cheap retry, then a conversation
- the agent arrives with ordered hypotheses about the root cause, each with the evidence supporting
  it and the question that would confirm or rule it out
- I answer only what I actually know and the agent cannot read from the repository
- the conversation ends in one concrete decision, not in a document

## Origin

Specified jointly with the user in the specification round of 2026-08-22. Replaces the agentic
doctor-recovery task pipeline.
