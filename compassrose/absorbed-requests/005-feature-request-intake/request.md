# Request: Feature Request Intake

I want a feature to be able to start as a simple human-written request.

The user should be able to create a folder like:

```text
docs/features/005-example-feature/request.md
```

The `request.md` file should be plain text or Markdown.
The user should not be forced to write `feature.md`, `architecture.md`, or `state.md` manually.

CompassRose should detect feature folders that contain only `request.md` and treat them as pending feature requests.

This creates a comfortable interaction surface:

```text
User writes intent -> CompassRose formalizes it -> CompassRose plans tasks
```

This feature should define:

- feature folder naming rules
- numbering rules
- request detection rules
- pending feature state
- invalid or incomplete request handling

The recommended folder format is:

```text
docs/features/<number>-<kebab-case-name>/request.md
```
