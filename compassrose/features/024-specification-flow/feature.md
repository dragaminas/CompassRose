# Feature: Specification Flow

## Status

Formalized

## Purpose

Turn specification into a bounded conversation between a human and the agent that produces
validated feature and fix specifications, and make that conversation the only way a work item
becomes eligible for automated execution.

## Problem It Solves

Today a `request.md` is formalized by the automated loop, with no human in the conversation; the
human's only role is confirming a document the AI already wrote alone. This produces generic
specifications that describe components rather than the application, and it leaves whole dimensions
of the product unspecified without anyone noticing. It also means a repository can accumulate
unformalized requests — eighteen of them here — that no flow ever surfaces.

## Scope

This feature includes:

- detecting whether CompassRose is initialized in the target project and bootstrapping it if not
- finding work items that are pending specification (`request.md` with no `feature.md`) and pending validation, and resolving them one at a time before starting anything new
- asking for a new feature or bug statement when nothing is pending, and entering the specification cycle on it
- a per-session competency profile over three axes — product, architecture, implementation detail — declared by the human, never persisted to the repository
- free-form conversation, punctuated by structured decisions presented as concrete options with a recommendation and the consequence of each
- a declared dimensions checklist for the project, with per-dimension coverage state
- agent-proposed dimensions that only enter the checklist through an explicit human decision
- mandatory reasons for discarding a dimension, recorded with author and date, and reopenable in any later session
- a coverage report when the session closes, naming which dimensions no feature covers
- drafting a settled conversation into `feature.md` and `architecture.md`, and running the existing validation loop on the result
- recording, in each generated specification, which parts a human decided and which the agent filled

This feature does not include:

- the terminal session that hosts the conversation (`023-terminal-session`)
- planning or implementing anything that has been specified (`025-automated-development-loop`)
- automatic formalization without a human — this feature removes that capability from the loop
- detecting facts about an existing codebase to inform specification (`028-existing-project-understanding`)
- persisting a competency profile between sessions, under any circumstances

## User-Facing Behavior

The specification flow starts by resolving what is already pending, in a fixed order: items pending
specification first, then items pending validation. Only when nothing is pending does it ask for a
new feature or bug statement.

The human declares a competency profile for the session. That profile decides what gets asked: on an
axis the human owns, decisions are presented as options and the human picks; on an axis the agent
owns, the agent decides and documents its choice as settled, with its reasoning visible.

Conversation is free-form. When a real decision appears on an axis the human owns, the agent stops
and presents it as concrete options, each with its consequence, and one marked as recommended.

Throughout, the agent tracks the project's dimensions checklist. It may propose a dimension the list
does not contain, explaining why this project needs it. The human accepts it — and it joins the
declared checklist for every future session — or discards it with a reason, which is recorded and
never proposed again unless explicitly reopened.

An explicit literal command drafts the current conversation into a specification. The specification
immediately enters the existing validation loop, and an explicit literal confirmation is the only
thing that marks it validated.

At session close, the coverage report names every dimension no feature covers and every dimension
explicitly out of scope with its reason.

## Acceptance Criteria

- a folder containing only `request.md` is detected as pending specification and surfaced before any new idea
- items pending validation are surfaced after items pending specification and before any new idea
- the automated loop no longer formalizes anything; an unspecified request is reported, not processed
- the competency profile is asked once per session and is not written to any repository file
- on an axis the human owns, no specification content is settled without an explicit human choice
- on an axis the agent owns, the agent's choice is recorded in the specification as agent-filled
- a dimension proposed by the agent is never added to the checklist without an explicit human decision
- discarding a dimension without a reason is refused
- a discarded dimension is not proposed again until explicitly reopened
- reopening a discarded dimension records the new decision alongside the old one, without erasing it
- the coverage report at session close lists uncovered and out-of-scope dimensions separately
- drafting and confirming remain driven exclusively by literal human commands, never by model judgment
- a bug can be specified through the same cycle and lands as a fix, not a feature

## Implementation Deliverables

- pending-specification detection alongside the existing pending-validation detection
- removal of the formalization step from the automated loop, replaced by a report of unspecified items
- a session competency profile type, asked at session start and passed into every agent call
- a structured-decision contract: options, consequences, recommendation, and the human's choice
- `compassrose/DIMENSIONS.md`: the declared checklist and its per-dimension coverage state
- a starter dimensions checklist written by `compassrose setup`
- dimension proposal, acceptance, discard-with-reason, and reopen operations
- the session-close coverage report
- provenance recording in generated specifications: human-decided versus agent-filled

## Completion Criteria

This feature is considered implemented when a human can open a session in a repository with
unformalized requests, be walked through them one at a time, settle each through a conversation
whose structured decisions match their declared competencies, see which dimensions of the
application remain uncovered, and end with specifications the automated loop will accept — without
the loop ever having written a specification on its own.

## Implementation Outline

1. Detect and surface pending-specification items; remove formalization from the automated loop
2. Add the per-session competency profile and thread it through the agent contracts
3. Add the structured-decision contract and its rendering in the session
4. Add `DIMENSIONS.md`, its operations, and the session-close coverage report
5. Record provenance in generated specifications and connect the cycle to the existing validation loop

## Relationship to CompassRose Principles

- documentation is the primary interface: the conversation's product is a document, not a chat log
- the model proposes, a literal human action decides, the decision is persisted (ADR-0007)
- decisions about the project are durable and reopenable; facts about a person are neither stored nor inherited
- every loop is bounded: turns per idea, ideas per session, rounds per validation
