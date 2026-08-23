/**
 * What no file in a repository states, inferred from what several of them imply
 * (028-project-understanding).
 *
 * Detection reads facts: a `package.json` names a package manager, a lockfile names a build
 * system, a directory layout names source roots. Two things it can never read, because nothing
 * declares them:
 *
 * - **what the project is for.** A README says it in prose, if at all, and prose is not a fact.
 * - **which of several declared scripts are actually the gates.** `package.json` lists ten; which
 *   ones a change must pass before review is a judgment about this project, not a property of it.
 *
 * Everything here therefore enters as `inferred`, which the provenance model ranks below both
 * `detected` and `confirmed`. That is the entire safety property: an inference can never overwrite
 * something read from a file or confirmed by a person, and it stays visibly marked as a guess until
 * someone says otherwise.
 */
export interface ProjectInference {
  /** One sentence. Null when the repository genuinely does not say enough to guess. */
  readonly purpose: string | null;
  /** The declared scripts that look like gates a change must pass. A subset of what exists. */
  readonly gate_commands: readonly string[];
  /** The one command that starts the application, or null when nothing looks like one. */
  readonly start_command: string | null;
}
