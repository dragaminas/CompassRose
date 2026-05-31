# CompassRose Configuration

## Development Policy

```yaml
development_policy:
  default: test_guided

  allowed:
    - test_guided
    - implementation_first
    - documentation_first

  test_policy:
    require_tests_for_new_behavior: true
    allow_no_tests_with_reason: true
```