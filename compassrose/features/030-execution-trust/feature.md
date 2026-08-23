# Feature: Execution Trust

## Status

Formalized

## Purpose

Declare and bound what a run is allowed to *do* to the repository it is pointed at, so that the
system's central claim — that a run is bounded — covers the side that touches disk and not only the
side that reads it.

## Problem It Solves

Every bound in CompassRose governs context: what an agent may read, measured in characters, checked
against a budget at planning time. Nothing governed execution. An agent was launched with its own
sandbox explicitly disabled, and the commands it was checked against afterwards were strings another
agent had written.

The asymmetry is the problem. A system whose foundational idea is boundedness had bounded the
cheaper half.

## Scope

This feature includes:

- an `execution_trust` block in project configuration declaring the sandbox, the network, and what a quality-gate command may start with
- structured calls — planning, review, diagnosis, classification, inference — pinned to read-only regardless of what is configured
- the implementer running under the declared sandbox, with the network denied unless the project says otherwise
- removal of every use of the external CLI's approval-and-sandbox bypass
- quality-gate commands checked against a declared allowlist at planning time and again before execution
- a gate check that understands shell chaining, substitution, redirection, and quoting rather than matching a prefix
- the test suite pointed at a throwaway agent-CLI configuration home
- `doctor` reporting the policy in force, and reporting trust grants that name directories which no longer exist

This feature does not include:

- confining an external CLI. That sandbox belongs to the CLI, and what it is worth differs by platform. CompassRose controls whether it asks for it.
- preventing an external tool from writing to its own configuration during a real run. There is a detector for this; there is no mechanism.
- sandboxing CompassRose's own git plumbing, which runs in argv form against a fixed set of verbs
- an allowlist for anything other than quality-gate commands

## User-Facing Behavior

`CONFIG.md` gains an `execution_trust` block. Every field is optional, and every omission resolves
to the bounded default — the opposite of how `limits` treats absence, because an absent limit means
nobody thought about pacing while an absent trust declaration means nobody thought about what is
being let loose.

A quality gate the project has not permitted is refused at planning time, with a message naming the
segment, the reason, and the allowlist it was checked against. The same command is refused again
before execution, where it fails the gate rather than crashing the run.

`compassrose doctor` reports the policy in force in one line, and says so when the isolation rule
has been broken.

## Acceptance Criteria

1. No CompassRose code path passes `--dangerously-bypass-approvals-and-sandbox`, under any configuration.
2. A structured call runs under `read-only` even when the project declares `danger-full-access`.
3. The implementer runs under the declared sandbox, and the network setting is passed explicitly rather than left to the CLI's default.
4. A configuration with no `execution_trust` block resolves to `workspace-write`, network denied, and the default gate allowlist.
5. A configuration declaring only some fields keeps the bounded defaults for the rest.
6. A planned task whose quality gates include a command outside the allowlist is refused, and no task document is written.
7. A gate command outside the allowlist that reaches execution anyway is refused before running, and reported as a failed gate.
8. The gate check refuses a chain whose first segment is permitted and whose later segment is not.
9. The gate check refuses command substitution and output redirection outright.
10. The gate check does not refuse a permitted command that contains a shell separator inside quotes.
11. An invalid `agent_sandbox` value, and an empty allowlist, are both configuration errors.
12. Running the test suite writes nothing to the developer's real agent-CLI configuration.
13. `doctor` reports the resolved policy, and reports stale trust grants without failing on them.

## Implementation Outline

1. Add the `execution_trust` section: types, per-field resolution with bounded defaults, and validation.
2. Build the sandbox arguments as a pure function, and use it from both codex adapter paths.
3. Build the gate-command policy: quote-aware segmentation, substitution and redirection refusal, word-boundary prefix matching.
4. Wire the gate check into the three planning paths and into gate execution.
5. Point the test suite's agent-CLI configuration home at a throwaway directory.
6. Add the `doctor` check.
