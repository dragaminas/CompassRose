export function normalizeModelName(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveCodexPlannerModel(): string | null {
  return normalizeModelName(process.env.PROTO_COMPASSROSE_CODEX_PLANNER_MODEL)
    ?? normalizeModelName(process.env.PROTO_COMPASSROSE_CODEX_MODEL);
}

// Only return an explicit override; otherwise let the backend use its active default.
export function resolveCodexImplementerModel(): string | null {
  return normalizeModelName(process.env.PROTO_COMPASSROSE_CODEX_IMPLEMENTER_MODEL);
}

export function resolveOpenCodeModel(): string | null {
  return normalizeModelName(process.env.PROTO_COMPASSROSE_OPENCODE_MODEL);
}
