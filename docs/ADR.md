# CompassRose Architecture Decision Record

This document contains accepted architectural decisions.

The purpose of this document is to record decisions, not discussions.

---

## ADR-0001

### Title

Implementation Language

### Status

Accepted

### Decision

CompassRose shall be implemented in TypeScript.

---

## ADR-0002

### Title

CLI First

### Status

Accepted

### Decision

The CLI is the primary product.

All future interfaces shall be built on top of the CLI.

---

## ADR-0003

### Title

Documentation as User Interface

### Status

Accepted

### Decision

Documentation is the primary user interface.

The CLI is the execution interface.

---

## ADR-0004

### Title

Repository as Source of Truth

### Status

Accepted

### Decision

The repository is the authoritative representation of project reality.

---

## ADR-0005

### Title

Roadmap Driven Development

### Status

Accepted

### Decision

Users define outcomes.

CompassRose generates tasks.

---

## ADR-0006

### Title

Feature-Centric Documentation

### Status

Accepted

### Decision

Project knowledge shall be organized around features.

Features are the primary planning unit.

Tasks are temporary execution artifacts.

---

## ADR-0007

### Title

Deterministic Orchestrator

### Status

Accepted

### Decision

The orchestrator contains no AI.

All workflow transitions are deterministic.

---

## ADR-0008

### Title

Configurable AI Roles

### Status

Accepted

### Decision

Planner, Implementer and Reviewer are configurable roles.

They are not tied to specific providers or models.

---

## ADR-0009

### Title

Provider Agnostic Architecture

### Status

Accepted

### Decision

CompassRose shall support local and remote models.

CompassRose shall not depend on any single AI provider.

---

## ADR-0010

### Title

Adapter-Based Integration

### Status

Accepted

### Decision

CompassRose communicates with external tools through adapters.

Providers and adapters are independent concerns.

---

## ADR-0011

### Title

Git as Contract

### Status

Accepted

### Decision

Git diffs are the contract between implementation and review.

---

## ADR-0012

### Title

Generate One Task at a Time

### Status

Accepted

### Decision

CompassRose generates the next task only.

Long-lived task backlogs are not the primary planning mechanism.

---

## ADR-0013

### Title

Project State Over Task History

### Status

Accepted

### Decision

Planning is based on current project state.

Planning is not based on historical task definitions.

---

## ADR-0014

### Title

Human Editable Intent

### Status

Accepted

### Decision

Users must be able to modify roadmap, feature definitions and architectural documents directly.

---

## ADR-0015

### Title

Progressive Autonomy

### Status

Accepted

### Decision

CompassRose supports Manual, Assisted and Autonomous execution modes.

---

## ADR-0016

### Title

Plain Language Adoption

### Status

Accepted

### Decision

Users are not required to author CompassRose-specific documents before adoption.

CompassRose translates intent into structured project knowledge.

---

## ADR-0017

### Title

Language Agnostic Operation

### Status

Accepted

### Decision

CompassRose supports repositories regardless of implementation language.

The product itself is implemented in TypeScript.

---

## ADR-0018

### Title

Repository-Local State

### Status

Accepted

### Decision

CompassRose state shall be stored inside the repository whenever possible.

---

## ADR-0019

### Title

Small Task Bias

### Status

Accepted

### Decision

CompassRose prefers small, atomic and independently reviewable tasks.

---

## ADR-0020

### Title

Explainable Planning

### Status

Accepted

### Decision

Every generated task must be traceable to a roadmap objective and a feature.

## ADR-0021

### Title

Cross-Platform Runtime

### Status

Accepted

### Decision

CompassRose shall run on Linux and Windows.

Platform-specific behavior must be isolated behind adapters or utilities.

Shell commands, paths, process execution and file operations must not assume a Unix-only environment.

## ADR-0022

### Title

Self-Hosting Documentation Model

### Status

Accepted

### Decision

CompassRose shall use CompassRose principles to organize its own development.

Its roadmap, features, architecture, state and planning artifacts shall be managed using CompassRose conventions whenever practical.