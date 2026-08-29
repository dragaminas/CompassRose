import { describe, expect, test } from 'vitest';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTRACTS_DIRECTORY,
  getInstallationRoot,
  isContractPath,
  isSelfHosted,
  localizeContractReferences,
  resolveContractOrRepositoryPath,
} from '../src/config/installationPaths.js';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

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
    expect(resolveContractOrRepositoryPath(repositoryRoot, `${CONTRACTS_DIRECTORY}/planner/input.md`)).toBe(
      join(repositoryRoot, 'src/contracts/planner/input.md'),
    );
  });

  test('prompt text is left byte-identical when self-hosted', () => {
    const prompt = 'Read only:\n- `src/contracts/planner/input.md`\n- `compassrose/CONFIG.md`\n';
    expect(localizeContractReferences(prompt, repositoryRoot)).toBe(prompt);
  });

  test('prompt text names the installed contract when pointed elsewhere', () => {
    const foreign = join(repositoryRoot, '..', 'widget');
    const localized = localizeContractReferences(
      'Read only:\n- `src/contracts/planner/input.md`\n- `src/widget.ts`\n',
      foreign,
    );

    const installed = getInstallationRoot().split('\\').join('/');
    expect(localized).toContain(`\`${installed}/src/contracts/planner/input.md\``);
    // The target's own paths stay relative: the agent's working directory is the target.
    expect(localized).toContain('`src/widget.ts`');
  });
});
