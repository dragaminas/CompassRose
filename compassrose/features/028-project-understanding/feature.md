# Feature: Project Understanding

## Status

Formalized

## Purpose

Let CompassRose establish what a repository actually is — deterministically where possible, by
inference where not — so it can be pointed at any project rather than only at the one whose facts a
human typed in by hand.

## Problem It Solves

Everything CompassRose does depends on facts about the project: which commands are quality gates,
where source lives, what language it is written in, what already exists. Today those facts come
exclusively from `CONFIG.md`, written by a human at setup. That makes the first contact with the
tool an exercise in filling out a form about your own repository, and it makes CompassRose unable to
say anything useful about a codebase it did not help write.

## Scope

This feature includes:

- deterministic detection from known repository signals: manifests, lock files, language configs, conventional directories, declared scripts
- AI-assisted inference only for what detection cannot establish, always marked as inferred
- human confirmation turning an inferred fact into a confirmed one
- a project facts document recording what was detected, what was inferred, and what was confirmed, with provenance
- an inventory of existing code with no associated feature: modules, apparent responsibilities, entry points
- offering that inventory as material to the specification conversation, never formalizing from it
- re-detection when signals change, reporting contradictions with confirmed facts instead of overwriting them
- deriving quality-gate command candidates from detected scripts

This feature does not include:

- generating feature specifications from existing code without a human (explicitly rejected)
- static analysis, dependency graphs, or call-graph construction
- modifying any project file outside CompassRose's own documents
- language-specific tooling integration beyond reading declared configuration

## User-Facing Behavior

`compassrose setup` detects the project's facts and shows them in two groups: what was read directly
from the repository, and what was inferred. Detected facts are stated; inferred facts are presented
for confirmation or correction.

When the repository contains code with no associated feature, the inventory groups it by apparent
responsibility and offers each group as a candidate topic for the specification conversation. The
human chooses which groups become features and which stay as unspecified legacy. Choosing nothing is
a valid outcome, recorded as such.

On later runs, detection re-runs when its signals have changed — a new manifest, a changed script, a
new language. If a re-detected fact contradicts something the human confirmed, the contradiction is
reported and the confirmed value stands until the human resolves it.

## Acceptance Criteria

- languages, package manager, build system, test system, source folders, and documentation folders are detected from repository signals without an AI call
- declared scripts are read and offered as quality-gate candidates
- every recorded fact carries its provenance: detected, inferred, or confirmed
- an inferred fact is never used as though it were detected
- confirming an inferred fact records who confirmed it and when
- the inventory groups unassociated code by apparent responsibility and names its entry points
- no feature or specification is created from the inventory without an explicit human decision
- re-detection triggers on signal change, not on every run
- a re-detected fact contradicting a confirmed one is reported, and the confirmed value is not overwritten
- detection works on a repository containing no CompassRose documents at all
- detection makes no network calls and modifies no file outside CompassRose's own documents

## Implementation Deliverables

- a signal-based detector with a registry of known manifests and conventions
- a `ProjectFacts` model with per-fact provenance
- `compassrose/PROJECT_FACTS.md` as the recorded output
- the inference call for gaps, and its inferred-until-confirmed marking
- the confirmation operation
- the code inventory and its grouping
- the inventory hand-off into the specification conversation
- signal-change detection and contradiction reporting
- quality-gate candidate derivation feeding `CONFIG.md`'s gate configuration

## Completion Criteria

This feature is considered implemented when CompassRose can be pointed at a repository it has never
seen, state correctly what that project is without anyone typing it in, distinguish what it knows
from what it guessed, and offer what already exists there as material for a specification
conversation.

## Implementation Outline

1. Build the signal-based deterministic detector and the `ProjectFacts` model
2. Record facts with provenance in `PROJECT_FACTS.md` and add the confirmation operation
3. Add gap inference and its inferred-until-confirmed handling
4. Build the code inventory and its grouping by apparent responsibility
5. Hand the inventory to the specification conversation as candidate material
6. Add signal-change re-detection and contradiction reporting

## Relationship to CompassRose Principles

- facts are read, not guessed, wherever reading is possible
- what the machine inferred is never confused with what it knows
- existing code is material for a human decision, never a source of machine-authored specification
- a human's confirmation outranks a later machine detection
