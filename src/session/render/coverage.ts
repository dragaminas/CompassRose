/**
 * The coverage report a specification session closes with (024-specification-flow).
 *
 * `uncovered` and `out of scope` are shown as separate groups on purpose: "nothing covers this yet"
 * and "we decided this does not apply" are different facts, and collapsing them is exactly how a gap
 * becomes invisible. Out-of-scope entries carry the reason and are therefore the shorter read;
 * uncovered ones are the ones that want attention.
 */
import type { CoverageReport } from '../../state/dimensions.js';
import { COMPETENCY_AXES, COMPETENCY_AXIS_LABELS, type SessionCompetencyProfile } from '../../contracts/brainstormer/competency.js';

export function renderCoverageReport(report: CoverageReport): string[] {
  const lines: string[] = ['', '  Coverage of this project:', ''];

  for (const entry of report.covered) {
    lines.push(`    ✓ ${entry.name} — ${entry.coveredBy.join(', ')}`);
  }
  for (const name of report.uncovered) {
    lines.push(`    ✗ ${name} — no feature covers this`);
  }
  for (const entry of report.outOfScope) {
    lines.push(`    · ${entry.name} — out of scope: ${entry.reason}`);
  }

  lines.push('');

  if (report.uncovered.length > 0) {
    lines.push(
      `  ${report.uncovered.length} dimension${report.uncovered.length === 1 ? '' : 's'} uncovered.`,
      '  Talk one through with me, or /descartar <name> to put it out of scope with a reason.',
      '',
    );
  }

  return lines;
}

export function renderCompetencyProfile(profile: SessionCompetencyProfile): string[] {
  return [
    '',
    '  This session:',
    ...COMPETENCY_AXES.map((axis) => {
      const label = COMPETENCY_AXIS_LABELS[axis];
      return `    ${profile[axis] === 'human' ? 'you decide' : 'I fill in '}  ${label}`;
    }),
    '',
    '  This is about you, not the project, so it is never written to the repository.',
    '',
  ];
}
