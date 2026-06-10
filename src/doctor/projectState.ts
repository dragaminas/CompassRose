import { readFileSync } from 'node:fs';
import { err, ok, type Result } from '../shared/result.js';

export interface ProjectStateReport {
  readonly status: string;
}

export type ProjectStateValidationResult = Result<
  ProjectStateReport,
  { field: string; message: string }
>;

export function validateProjectState(content: string): ProjectStateValidationResult {
  const field = 'project_state';

  if (!content.trim()) {
    return err({ field, message: 'Project state document is empty — must contain at least a heading and a Status section.' });
  }

  const headingMatch = content.match(/^#\s+.+/m);
  if (!headingMatch) {
    return err({ field, message: 'Project state document is missing a level-1 heading.' });
  }

  const statusLineIndex = content.search(/^##\s+Status\s*\n/m);
  if (statusLineIndex === -1) {
    return err({ field, message: 'Project state document is missing the required "## Status" section.' });
  }

  // Extract body after the Status header line
  const headerEnd = statusLineIndex + content.slice(statusLineIndex).search(/\n/) + 1;
  const afterStatus = content.slice(headerEnd);
  // Find the next ## header or end of content
  const nextHeaderIdx = afterStatus.search(/^##/m);
  const statusValue = nextHeaderIdx === -1
    ? afterStatus.trim()
    : afterStatus.slice(0, nextHeaderIdx).trim();

  return ok({ status: statusValue });
}

export function loadAndValidateProjectState(filePath: string): ProjectStateValidationResult {
  try {
    const content = readFileSync(filePath, 'utf8');
    return validateProjectState(content);
  } catch (e) {
    const err_ = e as Error;
    if ((err_ as NodeJS.ErrnoException).code === 'ENOENT') {
      return err({
        field: 'project_state',
        message: `${filePath} does not exist.`,
      });
    }
    return err({
      field: 'project_state',
      message: `Failed to read project state: ${err_.message}`,
    });
  }
}
