# Specification Coverage

The dimensions this project must address, and where each one stands.

This is a floor, not a ceiling: a specification session walks it every time, and the agent may
propose dimensions it does not contain. A proposal only joins this list when a human accepts it,
and only leaves it as `out_of_scope` with a written reason. Nothing here is final — any decision
can be reopened in a later session, and reopening appends rather than overwrites.

## user interface

State: uncovered

## persistence and data

State: uncovered

## errors and failure handling

State: uncovered

## configuration

State: uncovered

## security and access

State: uncovered

## deployment and installation

State: uncovered

## testing and verification

State: uncovered

## performance and limits

State: uncovered

## existing data and migration

State: uncovered

## observability

State: uncovered

## distribution and installation

State: uncovered
- uncovered — recorded uncovered by the specification round of 2026-08-22: bin exists in package.json but is never published, and all real use runs through npm run inside this repository (CompassRose, 2026-08-22)

## execution trust

State: covered
Covered by: 030-execution-trust
- uncovered — recorded uncovered by the specification round of 2026-08-22: CompassRose ran shell commands and external CLIs inside the user repository with no declared limit on what they may touch (CompassRose, 2026-08-22)
- covered — execution_trust declares the sandbox, the network, and what a quality gate command may be (CompassRose, 2026-08-23)
