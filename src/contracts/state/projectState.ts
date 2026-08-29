import { readFileSync } from "node:fs";
import { err, ok, type Result } from "../../shared/result.js";

/**
 * Parsed view of `compassrose/PROJECT_STATE.md`.
 *
 * Keep this separate from `ProjectStateSnapshot`, which is the runtime-facing
 * snapshot used by the orchestrator and action contexts.
 */
export interface ProjectStateReport {
  readonly status: string;
}

export interface ProjectStateValidationIssue {
  readonly field: string;
  readonly message: string;
}

export type ProjectStateValidationResult = Result<
  ProjectStateReport,
  ProjectStateValidationIssue
>;

/**
 * The sections the runtime writes into, and therefore the ones the document must already have.
 *
 * Until a real run against another repository, this list existed only as string literals scattered
 * through `upsertBulletInSection` and `replaceSection` calls, and the document `compassrose setup`
 * seeds was missing `Implemented`. Nothing noticed: this repository's own `PROJECT_STATE.md` has
 * the section, written by hand long before setup existed. The first feature ever completed in a
 * bootstrapped repository passed all ten of its acceptance criteria and then crashed on
 * `requireSection`, at the last step, with the work already done and committed.
 *
 * So the shape is declared once, here, and checked by `doctor` -- where a missing section is a line
 * of diagnostic output before any agent is called, rather than a stack trace after the whole
 * feature is built.
 */
export const PROJECT_STATE_REQUIRED_SECTIONS: readonly string[] = [
  'Status',
  'Active Feature',
  'Current Reality',
  'Implemented',
  'Pending',
  'Blocked',
  'Last Approved Change',
  'Known Gaps',
  'Next Planning Hint',
];

export function validateProjectState(
  content: string,
): ProjectStateValidationResult {
  const field = "project_state";

  if (!content.trim()) {
    return err({
      field,
      message:
        "Project state document is empty — must contain at least a heading and a Status section.",
    });
  }

  const headingMatch = content.match(/^#\s+.+/m);
  if (!headingMatch) {
    return err({
      field,
      message: "Project state document is missing a level-1 heading.",
    });
  }

  const missing = PROJECT_STATE_REQUIRED_SECTIONS.filter(
    (section) => content.search(new RegExp(`^##\\s+${section}\\s*$`, 'm')) === -1,
  );
  if (missing.length > 0) {
    return err({
      field,
      message:
        `Project state document is missing the required ${missing.map((section) => `"## ${section}"`).join(', ')} `
        + `section${missing.length > 1 ? 's' : ''}. The runtime writes into every section listed in `
        + 'PROJECT_STATE_REQUIRED_SECTIONS, and a missing one fails when a feature completes.',
    });
  }

  // The header is known to exist -- the check above just proved it -- but it may be the last line
  // of the file, in which case there is no body after it and the status is empty.
  const statusHeader = /^##\s+Status\s*$/m.exec(content) as RegExpExecArray;
  const afterStatus = content.slice(statusHeader.index + statusHeader[0].length);
  // Find the next ## header or end of content.
  const nextHeaderIdx = afterStatus.search(/^##/m);
  const statusValue =
    nextHeaderIdx === -1
      ? afterStatus.trim()
      : afterStatus.slice(0, nextHeaderIdx).trim();

  return ok({ status: statusValue });
}

export function loadAndValidateProjectState(
  filePath: string,
): ProjectStateValidationResult {
  try {
    const content = readFileSync(filePath, "utf8");
    return validateProjectState(content);
  } catch (error) {
    const err_ = error as Error;
    if ((err_ as NodeJS.ErrnoException).code === "ENOENT") {
      return err({
        field: "project_state",
        message: `${filePath} does not exist.`,
      });
    }

    return err({
      field: "project_state",
      message: `Failed to read project state: ${err_.message}`,
    });
  }
}
