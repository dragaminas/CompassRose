# Request: Feature Formalization

I want CompassRose to formalize a pending feature request into the standard feature documentation model.

When a feature folder contains `request.md` but does not yet contain the generated feature documents, CompassRose should create:

```text
feature.md
architecture.md
state.md
```

The generated documents should follow CompassRose templates and remain editable by humans.

The formalization step should clarify:

- purpose
- scope
- out of scope
- expected behavior
- architecture notes
- dependencies
- current status
- next implementation direction

This feature should not implement code changes for the requested feature yet.
It only transforms human intent into structured project documentation.
