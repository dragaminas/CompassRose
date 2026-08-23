import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Keeps the test suite out of the developer's real agent-CLI configuration (030-execution-trust).
 *
 * Found live, in the author's own `~/.codex/config.toml`: roughly a hundred
 * `[projects.'…compassrose-test-XXXXXX'] trust_level = "trusted"` entries, one per fixture
 * workspace this suite has ever created, for directories that stopped existing the moment the test
 * that made them finished. Every run added more.
 *
 * CONFIG.md's "External tool isolation" section has forbidden exactly this from the beginning --
 * "CompassRose must not silently modify global user configuration files, including but not limited
 * to `~/.codex/*`" -- and nothing had ever enforced it. That is the shape of this whole feature: a
 * policy written in prose with no mechanism behind it.
 *
 * A `setupFiles` module rather than `globalSetup`, because globalSetup runs in a different process
 * and the environment it sets would never reach the workers that actually spawn the CLIs.
 *
 * One shared directory rather than one per worker: it needs no teardown, races with nothing, and
 * its whole job is being somewhere that is not the developer's home. It is left in place between
 * runs deliberately -- a trust entry accumulating there is the correct outcome, and finding it
 * there is how you would notice the redirection is working.
 */
export const ISOLATED_AGENT_HOME = join(tmpdir(), 'compassrose-test-agent-home');

if (process.env.COMPASSROSE_TEST_USE_REAL_AGENT_HOME !== '1') {
  mkdirSync(ISOLATED_AGENT_HOME, { recursive: true });

  // CODEX_HOME also carries auth, so a test that redirects it cannot reach a real account. That is
  // the right outcome rather than a limitation: a unit test quietly spending money on a real API is
  // a worse failure than one that cannot authenticate. Tests that exercise real agent behavior go
  // through proto's e2e harness, which opts out of this explicitly.
  process.env.CODEX_HOME = ISOLATED_AGENT_HOME;
  process.env.OPENCODE_CONFIG_DIR = ISOLATED_AGENT_HOME;
}
