import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  normalizeModelName,
  resolveCodexImplementerModel,
  resolveCodexPlannerModel,
  resolveOpenCodeModel,
} from '../src/agents/modelResolution.js';

describe('proto codex model resolution', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('does not force a codex implementer model by default', () => {
    expect(resolveCodexImplementerModel()).toBeNull();
  });

  test('allows the codex implementer model to be overridden explicitly', () => {
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_IMPLEMENTER_MODEL', 'local-qwen-alt');

    expect(resolveCodexImplementerModel()).toBe('local-qwen-alt');
  });

  test('keeps the shared codex model available for the planner', () => {
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_MODEL', 'gpt-5.4-mini');

    expect(resolveCodexPlannerModel()).toBe('gpt-5.4-mini');
  });

  test('allows a planner-specific codex model override', () => {
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_PLANNER_MODEL', 'gpt-5.5');

    expect(resolveCodexPlannerModel()).toBe('gpt-5.5');
  });

  test('does not let the shared codex model set the implementer model', () => {
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_MODEL', 'gpt-5.4-mini');

    expect(resolveCodexImplementerModel()).toBeNull();
  });

  test('does not force an opencode model by default', () => {
    expect(resolveOpenCodeModel()).toBeNull();
  });

  test('allows the opencode model to be overridden explicitly', () => {
    vi.stubEnv('PROTO_COMPASSROSE_OPENCODE_MODEL', 'qwen-main');

    expect(resolveOpenCodeModel()).toBe('qwen-main');
  });

  test('trims whitespace-only overrides down to null', () => {
    vi.stubEnv('PROTO_COMPASSROSE_OPENCODE_MODEL', '   ');

    expect(resolveOpenCodeModel()).toBeNull();
  });
});

describe('normalizeModelName', () => {
  test('returns null for undefined, null, empty, or whitespace-only values', () => {
    expect(normalizeModelName(undefined)).toBeNull();
    expect(normalizeModelName(null)).toBeNull();
    expect(normalizeModelName('')).toBeNull();
    expect(normalizeModelName('   ')).toBeNull();
  });

  test('trims surrounding whitespace from a real value', () => {
    expect(normalizeModelName('  gpt-5.5  ')).toBe('gpt-5.5');
  });
});
