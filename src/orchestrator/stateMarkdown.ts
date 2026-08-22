import { parseStatusMap, replaceSection, requireSection } from '../markdown/sections.js';

export function replaceOperationalStatus(markdown: string, overrides: Partial<Record<string, string>>): string {
  const section = requireSection(markdown, 'Operational Status');
  const values = parseStatusMap(section);
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      values[key] = value;
    }
  }

  const defaults: Record<string, string> = {
    formalization: 'complete',
    // See ADR-0046/Flow 1: whether a human has confirmed this feature's formalized definition
    // through "npm run feature-validation" before the autonomous pipeline may plan tasks for it.
    // Defaults to 'confirmed' here (NOT 'not_started') deliberately: this default only fills a
    // gap for a state.md this field never applied to at all (formalized before Flow 1 existed),
    // matching ADR-0040/41's "opt-in, never retroactive" precedent. A freshly-formalized
    // feature/fix gets the real, blocking 'not_started' value written explicitly by
    // planFeature()/planFixRequest() at formalization time instead of relying on this default.
    validation: 'confirmed',
    active_task: 'none',
    active_correction_task: 'none',
    last_implementation_result: 'not_run',
    last_quality_gate_result: 'unknown',
    last_review_result: 'not_run',
  };

  // Keys the automatic doctor-recovery pipeline owned, before 026-conversational-doctor-recovery
  // replaced it with a conversation. Nothing reads or writes them any more, but this function
  // carries every existing key forward by design, so without an explicit prune they would sit in
  // every state.md for the life of the repository. Dropping them here migrates each document the
  // first time the runtime touches it.
  const retired = ['active_unblock_task', 'last_unblock_result', 'doctor_recovery_attempts', 'doctor_recovery_lifetime_count'];
  for (const key of retired) {
    delete values[key];
  }

  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in values)) {
      values[key] = value;
    }
  }

  return replaceSection(markdown, 'Operational Status', Object.entries(values).map(([key, value]) => `- ${key}: ${value}`).join('\n'));
}
