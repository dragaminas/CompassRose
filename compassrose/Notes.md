# CompassRose Notes

This document collects design findings and future ideas that should be considered later, without interrupting the current MVP development flow.

These notes are not part of the active implementation scope unless they are later converted into feature requests under `docs/features/`.

---

## 1. Discovered gaps during task implementation

During manual CompassRose-style development, an implementation task revealed a missing project foundation prerequisite.

Example:

- A task updated `package.json` metadata.
- The configured quality gate `npm test` failed because the repository had no test files.
- A minimal Vitest smoke test was added manually so the test gate could pass.

This revealed an important workflow issue:

```text
A task may be valid, but implementation can expose a missing prerequisite or infrastructure gap.
```

Future CompassRose behavior should avoid silent scope expansion.

Possible future rule:

```text
If an implementer discovers a missing prerequisite, it should stop and report the gap instead of silently solving it.
```

The report should include:

- blocker description
- why it blocks the current task
- smallest possible correction task
- whether the current task can continue
- whether a quality gate override is justified

Possible future mechanisms:

- correction task
- prerequisite task
- blocked task state
- documented quality gate override

This should be incorporated carefully into the task lifecycle later.

---

## 2. Importing full roadmaps into CompassRose

A future use case is allowing a user to bring an externally generated roadmap into CompassRose.

Example:

```text
The user discusses a project with an assistant, receives a roadmap, and wants CompassRose to convert it into ordered feature requests.
```

This should not be part of the current MVP.

Possible future model:

```text
raw roadmap / notes / external plan
-> CompassRose intake
-> numbered feature request folders
-> request.md per feature
-> later formalization into feature.md, architecture.md, state.md
```

Potential future interface:

```text
docs/inbox/
```

or a command such as:

```bash
compassrose intake
```

Important constraint:

```text
CompassRose should not depend on any specific external assistant or provider.
```

It should only accept human-readable markdown/plain-text input and convert it into CompassRose-native feature requests.

This idea should be revisited after the core loop is working:

```text
request.md -> formalized feature -> task -> implementation -> review -> quality gates -> state update
```
