import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Several proto e2e tests spawn a real tsx -> node -> mock-CLI subprocess
    // tree per scenario. The 5s default is too tight once the full suite runs
    // those tests alongside each other under CPU contention.
    testTimeout: 30000,
    // 030-execution-trust: points the agent CLIs at a throwaway config home before any test
    // runs. Without it, every fixture workspace this suite creates leaves a permanent
    // trust entry in the developer's own ~/.codex/config.toml -- which CONFIG.md's "External
    // tool isolation" rule has always forbidden, and which nothing checked.
    setupFiles: ['./tests/setup/isolateAgentHome.ts'],
  },
});
