import { describe, expect, test } from 'vitest';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTRACTS_DIRECTORY,
  getInstallationRoot,
  installationAssetPath,
  isContractPath,
  isSelfHosted,
  localizePromptPaths,
  resolveContractOrRepositoryPath,
} from '../src/config/installationPaths.js';
import { HEARTBEAT_RUNNER_PATH } from '../src/agents/heartbeatRunner.js';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const forwardSlashes = (value: string): string => value.split('\\').join('/').replace(/\/+$/, '');

/**
 * ADR-0049. The whole point of this module is a distinction that is invisible from inside this
 * repository, where the installation root and the target root are the same directory -- so every
 * test here has to name a second root explicitly to have anything to observe.
 */
describe('installation paths', () => {
  test('the installation root is this repository when CompassRose runs against itself', () => {
    expect(resolve(getInstallationRoot())).toBe(resolve(repositoryRoot));
    expect(isSelfHosted(repositoryRoot)).toBe(true);
  });

  test('a foreign repository is not the installation', () => {
    expect(isSelfHosted(join(repositoryRoot, '..', 'some-other-project'))).toBe(false);
  });

  test('only src/contracts paths are contract paths', () => {
    expect(isContractPath('src/contracts/planner/input.md')).toBe(true);
    // Windows separators reach this from manifests built with path.join.
    expect(isContractPath('src\\contracts\\planner\\input.md')).toBe(true);
    expect(isContractPath('src/orchestrator/orchestrator.ts')).toBe(false);
    expect(isContractPath('compassrose/CONFIG.md')).toBe(false);
    // Not a prefix match on the bare directory name: a target repository with its own
    // `src/contracts-of-sale/` is the target's, not CompassRose's.
    expect(isContractPath('src/contracts-of-sale/terms.md')).toBe(false);
  });

  test('a contract resolves to the installation and everything else to the target', () => {
    const foreign = join(repositoryRoot, '..', 'widget');

    expect(resolveContractOrRepositoryPath(foreign, 'src/contracts/planner/input.md')).toBe(
      join(getInstallationRoot(), 'src/contracts/planner/input.md'),
    );
    expect(resolveContractOrRepositoryPath(foreign, 'src/widget.ts')).toBe(join(foreign, 'src/widget.ts'));
  });

  test('the installation actually holds the contracts it is asked for', () => {
    // The check `doctor` performs, asserted here so a packaging change that stops shipping
    // src/contracts fails a test rather than a user's first run.
    expect(existsSync(resolveContractOrRepositoryPath(repositoryRoot, `${CONTRACTS_DIRECTORY}/planner/input.md`))).toBe(true);
  });

  test('prompt text is left byte-identical when self-hosted', () => {
    const prompt = ['Read only:', '- `src/contracts/planner/input.md`', '- `compassrose/CONFIG.md`', ''].join('\n');
    expect(localizePromptPaths(prompt, repositoryRoot)).toBe(prompt);
  });

  /**
   * The defect this exists to prevent, found on the first real run against another repository: a
   * prompt naming the contract absolutely and the target's own documents relatively had the relative
   * ones resolved against the installation, and the agent read CompassRose's decision records,
   * roadmap and architecture document instead of the project's.
   */
  test('every path in a prompt shares one base when pointed elsewhere', () => {
    const foreign = join(repositoryRoot, '..', 'widget');
    const localized = localizePromptPaths(
      [
        'Read only:',
        '- `src/contracts/brainstormer/brainstorm-turn-prompt.md`',
        '- `compassrose/ADR.md`',
        '- `src/widget.ts`',
        '',
      ].join('\n'),
      foreign,
    );

    const installed = forwardSlashes(getInstallationRoot());
    const target = forwardSlashes(resolve(foreign));

    expect(localized).toContain(`\`${installed}/src/contracts/brainstormer/brainstorm-turn-prompt.md\``);
    expect(localized).toContain(`\`${target}/compassrose/ADR.md\``);
    expect(localized).toContain(`\`${target}/src/widget.ts\``);
    // Nothing relative is left for an agent to resolve against the wrong root.
    expect(localized).not.toContain('`compassrose/ADR.md`');
    expect(localized).not.toContain('`src/widget.ts`');
  });

  test('leaves alone what is not a repository-relative path', () => {
    const foreign = join(repositoryRoot, '..', 'widget');
    const prompt = [
      'Run `npm run build`.',
      'Follow `implementation_first`.',
      'See `https://example.com/docs/x.md`.',
      'Read `C:/already/absolute/file.md`.',
      'The template is `feature.md`.',
    ].join('\n');

    expect(localizePromptPaths(prompt, foreign)).toBe(prompt);
  });
});

/**
 * The regression that made every agent call fail from a built installation: `tsc` emits no `.mjs`,
 * so `heartbeatRunner.mjs` resolved next to a module in `dist/` that has no such sibling. Under tsx
 * the two resolutions coincide, which is why nothing caught it until CompassRose ran from `dist`.
 */
describe('shipped assets that are not TypeScript', () => {
  test('the heartbeat runner is addressed from the installation source tree', () => {
    expect(HEARTBEAT_RUNNER_PATH).toBe(installationAssetPath('src/agents/heartbeatRunner.mjs'));
    expect(existsSync(HEARTBEAT_RUNNER_PATH)).toBe(true);
    expect(forwardSlashes(HEARTBEAT_RUNNER_PATH)).toContain('/src/agents/');
  });
});
