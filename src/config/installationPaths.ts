/**
 * Where CompassRose itself is installed, as distinct from the repository it is pointed at.
 *
 * Every other path in this codebase is repository-relative, and for CompassRose's own documents
 * that is right: `compassrose/CONFIG.md`, `compassrose/features/...` and the rest describe *this*
 * project and belong in *this* project's history (ADR-0046). The contracts under `src/contracts/`
 * are the opposite kind of thing. They are the tool's own program data -- the prompts each role is
 * given, the JSON schemas its structured calls must satisfy, the documents describing the loop --
 * versioned with the tool, identical for every project, and meaningless as a per-project setting.
 *
 * Until ADR-0049 nothing said so. `ContractRegistry` resolved every schema against the *target*
 * repository root, the planner's manifests named `src/contracts/...` as if the target owned them,
 * and the starter `CONFIG.md` declared `contracts_root: src/contracts` for Doctor to check. Pointed
 * at this repository the three agreed, because here the installation and the target are the same
 * directory. Pointed anywhere else, first contact failed at `doctor` -- and copying the contracts in
 * to get past it put CompassRose's internals inside the target's source tree, where
 * 028-project-understanding then read them back as the target's own code.
 *
 * So the rule is one sentence: **contracts are read from the installation, never from the target,
 * and never copied into it.** In this repository that changes nothing, since the two roots
 * coincide -- which is exactly why the leak survived this long.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Where the contracts sit inside the installation. `tsc` emits only JavaScript, so the schemas and
 * prompt documents ship under `src/` in both layouts -- which is why this is not `dist/contracts`.
 */
export const CONTRACTS_DIRECTORY = 'src/contracts';

/**
 * A file CompassRose ships that is not TypeScript, addressed from the installation root.
 *
 * `tsc` emits `.ts` and nothing else, so every one of these -- the contracts, and
 * `src/agents/heartbeatRunner.mjs` -- is absent from `dist/`. Resolving one relative to the calling
 * module works under tsx and silently does not exist after a build, which is invisible until
 * something actually runs from `dist`. Nothing did until the package became installable.
 */
export function installationAssetPath(repositoryRelativePath: string): string {
  return join(getInstallationRoot(), repositoryRelativePath);
}

const CONTRACTS_PREFIX = `${CONTRACTS_DIRECTORY}/`;

/**
 * The installed package's root directory.
 *
 * Both layouts put this module exactly two levels down -- `src/config/installationPaths.ts` under
 * tsx, `dist/config/installationPaths.js` after a build -- so one relative walk serves both. The
 * same walk `src/cli/setup.ts` already uses to find this installation's own templates.
 */
export function getInstallationRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function sameDirectory(left: string, right: string): boolean {
  const normalize = (value: string): string => {
    const resolved = resolve(value).split('\\').join('/').replace(/\/+$/, '');
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };

  return normalize(left) === normalize(right);
}

/**
 * True when CompassRose is pointed at its own repository -- the case this project has run in
 * exclusively, and the reason none of the leaks above were visible from the inside.
 */
export function isSelfHosted(repositoryRoot: string): boolean {
  return sameDirectory(repositoryRoot, getInstallationRoot());
}

export function isContractPath(path: string): boolean {
  return path.split('\\').join('/').startsWith(CONTRACTS_PREFIX);
}

/**
 * The filesystem path CompassRose should read for one manifest entry or source path: the
 * installation's copy for a contract, the target repository's for everything else.
 */
export function resolveContractOrRepositoryPath(repositoryRoot: string, path: string): string {
  return join(isContractPath(path) ? getInstallationRoot() : repositoryRoot, path);
}

/**
 * Gives an assembled prompt a single base, so nothing in it can be resolved against the wrong root.
 *
 * Applied at the adapter boundary -- the one place every prompt passes through -- rather than at the
 * hundred-odd sites that name a file. Those literals stay as they are on purpose:
 * `src/contracts/planner/input.md` is the contract's *name*, stable across installations and the
 * thing every comment, artifact and feature document already refers to. Only the moment it becomes
 * an instruction to open a file needs to know where the file actually is.
 *
 * Why every path and not only the contracts: naming *some* paths absolutely and leaving the rest
 * relative is worse than either alone. Observed on the first real run against another repository --
 * a brainstorm turn about that project was handed
 * `C:/.../CompassRose/src/contracts/brainstormer/brainstorm-turn-prompt.md` alongside a relative
 * `compassrose/ADR.md`, and resolved the second against the base it had just learned from the
 * first. It read CompassRose's own decision records, roadmap and architecture document, and
 * reasoned about the target project with them. Nothing in the prompt was wrong; the two bases were.
 *
 * This does not confine anything. A read-only agent can read the filesystem whether or not a prompt
 * names a path, and that belongs to the external CLI's sandbox (ADR-0048). What this removes is the
 * ambiguity that made reading the wrong project the *correct* interpretation of its instructions.
 *
 * A no-op when self-hosted, where every path already shares one base, so this repository's own
 * prompts are byte-identical to what they were.
 */
export function localizePromptPaths(prompt: string, repositoryRoot: string): string {
  if (isSelfHosted(repositoryRoot)) {
    return prompt;
  }

  const installation = forwardSlashes(getInstallationRoot());
  const target = forwardSlashes(repositoryRoot);

  // Only inside backticks: that is how every path this codebase renders into a prompt is written,
  // and it keeps the rewrite away from prose that merely happens to contain a slash.
  return prompt.replace(/`([^`\n]+)`/g, (whole, token: string) => {
    if (!isRewritablePath(token)) {
      return whole;
    }

    return `\`${isContractPath(token) ? installation : target}/${forwardSlashes(token)}\``;
  });
}

function forwardSlashes(value: string): string {
  return value.split('\\').join('/').replace(/\/+$/, '');
}

/**
 * A repository-relative path, as opposed to a command, an identifier, or something already absolute.
 *
 * Requires a directory separator deliberately: a bare `feature.md` in prose is a reference to a kind
 * of document, not an instruction to open one, and every path this codebase actually asks an agent
 * to read carries a directory.
 */
function isRewritablePath(token: string): boolean {
  if (/\s/.test(token) || !token.includes('/')) {
    return false;
  }

  // Already absolute, a UNC path, or a URL.
  return !/^([A-Za-z]:[\\/]|[\\/]|[A-Za-z][A-Za-z0-9+.-]*:\/\/)/.test(token);
}
