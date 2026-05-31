# Request: Review Runner

I want CompassRose to run a review step over the implementation diff.

The reviewer should receive:

- the task
- relevant feature context
- git diff
- quality gate results

The review should produce:

- approval or rejection
- issues found
- required corrections if rejected

The review policy should be configurable:

```yaml
review_policy:
  mode: required | optional | disabled
```

If review is skipped, CompassRose must record that explicitly.
