# Feature: Bounded Work Item Context

## Status

Formalized

## Purpose

Make every agent call's context an explicitly declared, budgeted manifest, so that what an agent
sees is reproducible, what it lacks is recorded rather than guessed at, and no information the
system depends on lives anywhere but in the repository.

## Problem It Solves

Context assembly today is implicit. Prompts are built per step from whatever the calling site
decides to include; nothing declares the boundary, nothing measures the size, and nothing records
what the agent turned out to need but did not get. The `context_overflow` failure classification
exists with no mechanism behind it, so an oversized task fails at runtime instead of being caught at
planning time.

The consequence is the failure mode this project exists to prevent: an agent that silently drops
what matters, and a system whose real state lives in a chat rather than in the repository.

## Scope

This feature includes:

- a declared context manifest produced when a task is planned: documents, code regions, contracts, and state
- the manifest as the sole input to the agent call; nothing else is included implicitly
- a declared context budget, checked against the manifest at planning time
- rejecting and replanning a task whose manifest exceeds the budget, before any implementation call
- a bounded exploration allowance: the agent may read a declared maximum of additional files
- recording what exploration read, and carrying it into the next attempt's manifest
- eliminating conversational carry-over between tasks: inheritance happens only through written facts in the feature's state document
- a contract requiring an implementation to write back what the next task will need

This feature does not include:

- the recovery conversation's own context (`026-conversational-doctor-recovery`)
- the specification conversation's context (`024-specification-flow`)
- which model or provider serves a role, or its window size (`011-configurable-ai-roles`, existing)
- caching, retrieval, or embedding-based context selection

## User-Facing Behavior

Planning a task also produces its manifest, and the manifest is visible: the human can see exactly
what the implementer will be given, and how much of the budget it uses.

If the manifest does not fit the budget, the task is rejected as too large and planning is asked for
smaller units. This happens before any implementation call, so an oversized task costs a planning
call rather than a failed implementation.

During implementation, the agent may read beyond its manifest up to a declared limit. What it read
is recorded against the task. If the task is retried or corrected, those files are part of the new
manifest, so the second attempt does not repeat the first attempt's discovery.

Nothing carries between tasks implicitly. An implementation that discovers something the next task
needs must write it into the feature's state document as a fact; that document is part of the next
manifest. A discovery that is not written is lost by design.

## Acceptance Criteria

- every agent call in the automated loop is driven by an explicit manifest
- a manifest names its entries by path and, where applicable, by line range
- the manifest's size is measured and compared against the declared budget at planning time
- a task whose manifest exceeds the budget is rejected and replanned, with no implementation call made
- the implementer receives exactly the manifest's contents and nothing implicit
- exploration beyond the manifest is capped at a declared maximum and is recorded per task
- files read by exploration appear in the manifest of the same task's next attempt
- no task receives a summary, transcript, or history of prior tasks
- an implementation contract requires stating what the next task needs to know, written into the feature's state document
- two runs of the same task against the same repository state produce identical manifests

## Implementation Deliverables

- a `ContextManifest` type and its measurement
- manifest construction during task planning, per role
- a declared context budget in project configuration
- the planning-time budget check and the replan-on-overflow path
- reworked `promptBuilding.ts`: prompts assembled from a manifest rather than from call-site decisions
- an exploration allowance, its cap, and its per-task record
- carrying recorded exploration into the next attempt's manifest
- removal of implicit cross-task carry-over
- an implementation-contract field for facts the next task needs

## Completion Criteria

This feature is considered implemented when every agent call the loop makes is reproducible from a
declared manifest, an oversized task is caught at planning time rather than at runtime, and nothing
the system depends on exists outside the repository.

## Implementation Outline

1. Define the manifest type and its measurement
2. Build manifests during task planning and drive prompt assembly from them
3. Add the budget, the planning-time check, and the replan-on-overflow path
4. Add the exploration allowance, its record, and its carry into the next attempt
5. Remove implicit cross-task carry-over and require written hand-off facts

## Relationship to CompassRose Principles

- bounded context is the foundational constraint; this feature makes it explicit and measurable
- the repository is the only memory; nothing of consequence lives in a conversation
- determinism where it is affordable: the same state produces the same manifest
- growth is allowed, but only when recorded and only from demonstrated need
