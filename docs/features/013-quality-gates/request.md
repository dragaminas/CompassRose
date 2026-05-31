# Request: Quality Gates

I want CompassRose to run quality gates independently from AI review.

Quality gates may include:

- typecheck
- tests
- lint
- build

The commands should come from project-local configuration.

CompassRose should report each gate separately.

A successful AI review should not imply that quality gates passed.
A successful build should not imply that the AI review passed.

Quality gate overrides should be explicit and documented.
