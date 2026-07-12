import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Several proto e2e tests spawn a real tsx -> node -> mock-CLI subprocess
    // tree per scenario. The 5s default is too tight once the full suite runs
    // those tests alongside each other under CPU contention.
    testTimeout: 30000,
  },
});
