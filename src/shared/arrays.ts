export function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Resolves a set of independent, fresh-context votes (no shared history between the calls that
 * produced them -- see ADR-0036) into a single trusted value only when every vote agrees.
 * Disagreement -- including an empty vote set -- is reported, not resolved: picking a winner by
 * majority or trusting any single vote would reintroduce the unverified guess the ensemble
 * exists to replace. Callers decide their own fallback for the disagreed case; there is no
 * generic "unknown" sentinel here because not every vote type has one.
 */
export function resolveUnanimousVote<T>(
  votes: readonly T[],
): { readonly agreed: true; readonly value: T } | { readonly agreed: false } {
  const distinct = Array.from(new Set(votes));
  const [onlyValue] = distinct;
  if (votes.length > 0 && distinct.length === 1 && onlyValue !== undefined) {
    return { agreed: true, value: onlyValue };
  }

  return { agreed: false };
}
