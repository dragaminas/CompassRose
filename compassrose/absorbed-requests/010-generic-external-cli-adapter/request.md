# Request: Generic External CLI Adapter

I want CompassRose to support one generic external CLI adapter for the MVP.

CompassRose should not implement provider-specific integrations for Codex, OpenCode, Aider, Ollama, OpenAI, Anthropic, Gemini, or similar tools at this stage.

Instead, CompassRose should call a configured command with configured arguments.

The adapter should support:

- command
- args
- working directory
- optional stdin
- optional input file
- optional output file
- exit code handling
- timeout or limits if configured

CompassRose delegates provider and model selection to the external tool configured by the user.

Adapters are execution bridges, not provider integrations.
