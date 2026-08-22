import { afterEach, describe, expect, test } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempWorkspace, type TempWorkspace } from './testUtils.js';
import { ContractRegistry } from '../src/orchestrator/contractRegistry.js';

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
});

function seedSchemas(root: string): void {
  const schemaFiles: Record<string, string> = {
    'src/contracts/planner/feature-output.schema.json': '{"type":"object","title":"feature_plan"}',
    'src/contracts/planner/fix-output.schema.json': '{"type":"object","title":"fix_plan"}',
    'src/contracts/planner/output.schema.json': '{"type":"object","title":"planner_output"}',
    'src/contracts/reviewer/output.schema.json': '{"type":"object","title":"reviewer_output"}',
    'src/contracts/runtime/task-interface-analysis.schema.json': '{"type":"object","title":"task_interface_analysis"}',
    'src/contracts/runtime/diagnostic-autocorrection.schema.json': '{"type":"object","title":"diagnostic_autocorrection"}',
    'src/contracts/planner/task-requests-backfill-output.schema.json': '{"type":"object","title":"task_requests_backfill"}',
    'src/contracts/runtime/blocker-kind-classification.schema.json': '{"type":"object","title":"blocker_kind_classification"}',
    'src/contracts/runtime/systemic-blocker-next-step.schema.json': '{"type":"object","title":"systemic_blocker_next_step"}',
    'src/contracts/validator/feature-validation-weight.schema.json': '{"type":"object","title":"feature_validation_weight"}',
    'src/contracts/validator/decision-points-output.schema.json': '{"type":"object","title":"feature_validation_decision_points"}',
    'src/contracts/brainstormer/brainstorm-turn-output.schema.json': '{"type":"object","title":"brainstorm_turn"}',
    'src/contracts/runtime/acceptance-criteria-verification.schema.json': '{"type":"object","title":"acceptance_criteria_verification"}',
    'src/contracts/runtime/recovery-diagnosis.schema.json': '{"type":"object","title":"recovery_diagnosis"}',
  };

  for (const [relativePath, contents] of Object.entries(schemaFiles)) {
    const fullPath = join(root, relativePath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
  }
}

describe('ContractRegistry', () => {
  test('loads every structured schema on construction', () => {
    workspace = createTempWorkspace();
    seedSchemas(workspace.root);
    const registry = new ContractRegistry(workspace.root);

    expect(registry.schema<{ title: string }>('feature_plan').title).toBe('feature_plan');
    expect(registry.schema<{ title: string }>('fix_plan').title).toBe('fix_plan');
    expect(registry.schema<{ title: string }>('planner_output').title).toBe('planner_output');
    expect(registry.schema<{ title: string }>('reviewer_output').title).toBe('reviewer_output');
    expect(registry.schema<{ title: string }>('task_interface_analysis').title).toBe('task_interface_analysis');
    expect(registry.schema<{ title: string }>('diagnostic_autocorrection').title).toBe('diagnostic_autocorrection');
    expect(registry.schema<{ title: string }>('task_requests_backfill').title).toBe('task_requests_backfill');
    expect(registry.schema<{ title: string }>('blocker_kind_classification').title).toBe('blocker_kind_classification');
    expect(registry.schema<{ title: string }>('systemic_blocker_next_step').title).toBe('systemic_blocker_next_step');
    expect(registry.schema<{ title: string }>('feature_validation_weight').title).toBe('feature_validation_weight');
    expect(registry.schema<{ title: string }>('feature_validation_decision_points').title).toBe('feature_validation_decision_points');
    expect(registry.schema<{ title: string }>('brainstorm_turn').title).toBe('brainstorm_turn');
    expect(registry.schema<{ title: string }>('acceptance_criteria_verification').title).toBe('acceptance_criteria_verification');
    expect(registry.schema<{ title: string }>('recovery_diagnosis').title).toBe('recovery_diagnosis');
  });

  test('refresh reports no reload and no restart when nothing changed', () => {
    workspace = createTempWorkspace();
    seedSchemas(workspace.root);
    const registry = new ContractRegistry(workspace.root);

    const result = registry.refresh();
    expect(result.reloadedSchemas).toEqual([]);
    expect(result.restartRequired).toBe(false);
    expect(result.restartReasons).toEqual([]);
  });

  test('refresh reloads a schema whose file content changed', () => {
    workspace = createTempWorkspace();
    seedSchemas(workspace.root);
    const registry = new ContractRegistry(workspace.root);

    writeFileSync(
      join(workspace.root, 'src/contracts/planner/output.schema.json'),
      '{"type":"object","title":"planner_output_v2"}',
      'utf8',
    );

    const result = registry.refresh();
    expect(result.reloadedSchemas.map((p) => p.replace(/\\/g, '/'))).toEqual([
      'src/contracts/planner/output.schema.json',
    ]);
    expect(registry.schema<{ title: string }>('planner_output').title).toBe('planner_output_v2');
    expect(result.restartRequired).toBe(false);
  });

  test('refresh flags restartRequired when a runtime-critical path changes', () => {
    workspace = createTempWorkspace();
    seedSchemas(workspace.root);
    writeFileSync(join(workspace.root, 'runtime.ts'), 'v1', 'utf8');
    const registry = new ContractRegistry(workspace.root, ['runtime.ts']);

    writeFileSync(join(workspace.root, 'runtime.ts'), 'v2 - changed', 'utf8');

    const result = registry.refresh();
    expect(result.restartRequired).toBe(true);
    expect(result.restartReasons).toEqual(['runtime.ts']);
  });

  test('schema throws for an id that was never loaded (defensive, cannot occur via the public constructor today)', () => {
    workspace = createTempWorkspace();
    seedSchemas(workspace.root);
    const registry = new ContractRegistry(workspace.root);

    // All 9 known ids are always loaded by initialize(); this exercises the throw path
    // via an id outside the known union to prove schema() doesn't silently return undefined.
    expect(() => registry.schema('unknown_schema' as never)).toThrow(/is not loaded/);
  });
});
