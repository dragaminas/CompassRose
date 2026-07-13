import { optionalSection } from '../markdown/sections.js';

export function extractImplementationNotes(rawOutput: string): string | null {
  const section = optionalSection(rawOutput, 'Implementation Notes');
  if (section) {
    return section.trim();
  }

  // Agents sometimes omit the literal `## Implementation Notes` heading while still writing a
  // complete justification (including the authoritative `Status: already_complete` marker) as
  // plain prose. Discarding that content just because the heading format didn't match exactly
  // throws away a legitimate outcome and misclassifies it as a missing-justification failure.
  // Falling back to the full reply is safe: implementationNotesIndicatesAlreadyComplete() still
  // only fires on the exact marker text, and a genuinely empty or noise-only reply still trims
  // down to nothing.
  const trimmed = rawOutput.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function implementationNotesIndicatesAlreadyComplete(implementationNotes: string | null): boolean {
  if (implementationNotes === null) {
    return false;
  }

  // Strip markdown bold/italic asterisks so "**Status**: already_complete" (bold wrapping
  // only the label, colon outside) matches just as well as "Status: already_complete" or
  // "**Status: already_complete**" — agents format this marker inconsistently. Underscores
  // are deliberately left alone since "already_complete" itself contains one.
  const withoutEmphasis = implementationNotes.replace(/\*/g, '');
  return /status:\s*already_complete\b/i.test(withoutEmphasis);
}
