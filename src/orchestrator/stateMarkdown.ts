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
    active_task: 'none',
    active_correction_task: 'none',
    active_unblock_task: 'none',
    last_implementation_result: 'not_run',
    last_quality_gate_result: 'unknown',
    last_review_result: 'not_run',
    last_unblock_result: 'not_run',
    doctor_recovery_attempts: '0',
    doctor_recovery_lifetime_count: '0',
  };

  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in values)) {
      values[key] = value;
    }
  }

  return replaceSection(markdown, 'Operational Status', Object.entries(values).map(([key, value]) => `- ${key}: ${value}`).join('\n'));
}
