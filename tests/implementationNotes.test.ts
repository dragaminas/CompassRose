import { describe, expect, test } from 'vitest';
import { extractImplementationNotes, implementationNotesIndicatesAlreadyComplete } from '../src/implementer/implementationNotes.js';

describe('extractImplementationNotes', () => {
  test('extracts the body of a literal ## Implementation Notes heading', () => {
    const rawOutput = 'Some tool output.\n\n## Implementation Notes\n\nStatus: already_complete\nDid the thing.';
    expect(extractImplementationNotes(rawOutput)).toBe('Status: already_complete\nDid the thing.');
  });

  test('falls back to the full trimmed reply when the heading is missing but there is real content', () => {
    const rawOutput = 'All checks pass.\n\n**Status: already_complete** — nothing to change.';
    expect(extractImplementationNotes(rawOutput)).toBe(rawOutput);
  });

  test('returns null for an empty or whitespace-only reply', () => {
    expect(extractImplementationNotes('   \n  ')).toBeNull();
    expect(extractImplementationNotes('')).toBeNull();
  });
});

describe('implementationNotesIndicatesAlreadyComplete', () => {
  test('returns false for null notes', () => {
    expect(implementationNotesIndicatesAlreadyComplete(null)).toBe(false);
  });

  test('matches the plain marker', () => {
    expect(implementationNotesIndicatesAlreadyComplete('Status: already_complete')).toBe(true);
  });

  test('matches the marker wrapped entirely in bold', () => {
    expect(implementationNotesIndicatesAlreadyComplete('**Status: already_complete**')).toBe(true);
  });

  test('matches the marker when only the label is bolded (colon outside the emphasis)', () => {
    expect(implementationNotesIndicatesAlreadyComplete('**Status**: already_complete')).toBe(true);
  });

  test('does not match unrelated notes', () => {
    expect(implementationNotesIndicatesAlreadyComplete('Status: changes_made')).toBe(false);
  });

  test('is case-insensitive', () => {
    expect(implementationNotesIndicatesAlreadyComplete('STATUS: ALREADY_COMPLETE')).toBe(true);
  });
});
