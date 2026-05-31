# Feature: Project Identity and Foundation

## Status

Formalized

## Purpose

Establish CompassRose as a clear, stable CLI-first TypeScript project with a repository foundation that later features can rely on.

## Problem It Solves

Without an agreed project identity and baseline structure, later documentation and implementation work can drift across inconsistent folder names, missing roots, and unclear platform assumptions.

## Scope

This feature includes:

- project identity for CompassRose as a deterministic AI-assisted development orchestrator
- a stable documentation root
- a stable source root
- a stable contracts root
- baseline package and TypeScript project expectations
- explicit Linux and Windows compatibility expectations

This feature does not include:

- orchestration logic
- planning, implementation, or review workflows
- provider-specific adapters
- feature execution tasks
- runtime implementation beyond the foundation needed to support later features

## User-Facing Behavior

Users should be able to inspect the repository and quickly recognize:

- what CompassRose is
- where project documentation lives
- where source code lives
- where shared contracts live
- what platforms the project intends to support

## Success Criteria

- CompassRose is described consistently as a CLI-first TypeScript application
- the repository has predictable documentation, source, and contracts roots
- package metadata and TypeScript settings reflect a CLI project layout
- cross-platform expectations are explicitly documented
- later features can reference the foundation without redefining it

## Relationship to CompassRose Principles

This feature reinforces the core CompassRose principles:

- documentation is the primary user interface for project intent
- the repository is the source of truth
- feature work is organized by numbered folders under `docs/features/`
- project structure must be stable enough for deterministic tooling and later automation

