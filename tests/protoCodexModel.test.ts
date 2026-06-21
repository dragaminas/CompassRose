import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  resolveCodexImplementerModel,
  resolveCodexPlannerModel,
} from '../proto/protoCompassRose.js';

describe('proto codex model resolution', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('defaults the codex implementer to the local qwen model', () => {
    expect(resolveCodexImplementerModel()).toBe('qwen3.6-35b-a3b');
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

  test('does not let the shared codex model override the local implementer default', () => {
    vi.stubEnv('PROTO_COMPASSROSE_CODEX_MODEL', 'gpt-5.4-mini');

    expect(resolveCodexImplementerModel()).toBe('qwen3.6-35b-a3b');
  });
});
