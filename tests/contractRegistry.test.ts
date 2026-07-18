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
  };

  for (const [relativePath, contents] of Object.entries(schemaFiles)) {
    const fullPath = join(root, relativePath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
  }
}

describe('ContractRegistry', () => {
  test('loads all seven structured schemas on construction', () => {
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

    // All 6 known ids are always loaded by initialize(); this exercises the throw path
    // via an id outside the known union to prove schema() doesn't silently return undefined.
    expect(() => registry.schema('unknown_schema' as never)).toThrow(/is not loaded/);
  });
});
