import { join, relative as relativePath } from 'node:path';
import { statSync } from 'node:fs';
import type { ContractRefreshResult } from '../contracts/runtime/protoRuntime.js';
import { readUtf8 } from '../filesystem/textNormalization.js';

export type StructuredSchemaId =
  | 'feature_plan'
  | 'fix_plan'
  | 'planner_output'
  | 'reviewer_output'
  | 'task_interface_analysis'
  | 'diagnostic_autocorrection'
  | 'task_requests_backfill'
  | 'blocker_kind_classification'
  | 'systemic_blocker_next_step'
  | 'feature_validation_weight'
  | 'feature_validation_decision_points'
  | 'brainstorm_turn'
  | 'specification_audit'
  | 'acceptance_criteria_verification'
  | 'project_inference'
  | 'recovery_diagnosis';

interface FileFingerprint {
  readonly exists: boolean;
  readonly mtimeMs: number;
  readonly size: number;
}

const STRUCTURED_SCHEMA_PATHS: Record<StructuredSchemaId, string> = {
  feature_plan: 'src/contracts/planner/feature-output.schema.json',
  fix_plan: 'src/contracts/planner/fix-output.schema.json',
  planner_output: 'src/contracts/planner/output.schema.json',
  reviewer_output: 'src/contracts/reviewer/output.schema.json',
  task_interface_analysis: 'src/contracts/runtime/task-interface-analysis.schema.json',
  diagnostic_autocorrection: 'src/contracts/runtime/diagnostic-autocorrection.schema.json',
  task_requests_backfill: 'src/contracts/planner/task-requests-backfill-output.schema.json',
  blocker_kind_classification: 'src/contracts/runtime/blocker-kind-classification.schema.json',
  systemic_blocker_next_step: 'src/contracts/runtime/systemic-blocker-next-step.schema.json',
  feature_validation_weight: 'src/contracts/validator/feature-validation-weight.schema.json',
  feature_validation_decision_points: 'src/contracts/validator/decision-points-output.schema.json',
  brainstorm_turn: 'src/contracts/brainstormer/brainstorm-turn-output.schema.json',
  specification_audit: 'src/contracts/brainstormer/specification-audit.schema.json',
  acceptance_criteria_verification: 'src/contracts/runtime/acceptance-criteria-verification.schema.json',
  project_inference: 'src/contracts/project/project-inference.schema.json',
  recovery_diagnosis: 'src/contracts/runtime/recovery-diagnosis.schema.json',
};

// The runtime-critical paths are the files that, if changed, mean the orchestrator's own
// behavior may have changed underneath it — so a running loop should restart instead of
// continuing to execute stale in-memory logic. CompassRoseOrchestrator always passes its
// own explicit module list (see ORCHESTRATOR_RUNTIME_CRITICAL_PATHS in orchestrator.ts);
// this default only applies to a caller that doesn't specify one. Like the schemas, these are
// CompassRose's own modules and resolve against the installation root, not the target
// repository — watching a target repository for `src/orchestrator/orchestrator.ts` only ever
// made sense while the two were the same directory (ADR-0049).
const DEFAULT_RUNTIME_CRITICAL_PATHS: readonly string[] = ['src/orchestrator/orchestrator.ts'];

function readJsonFile(path: string): unknown {
  return JSON.parse(readUtf8(path));
}

function fingerprintForPath(path: string): FileFingerprint {
  try {
    const stat = statSync(path);
    return {
      exists: true,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    };
  } catch {
    return {
      exists: false,
      mtimeMs: 0,
      size: 0,
    };
  }
}

function sameFingerprint(left: FileFingerprint | undefined, right: FileFingerprint): boolean {
  return Boolean(
    left
    && left.exists === right.exists
    && left.mtimeMs === right.mtimeMs
    && left.size === right.size,
  );
}

export class ContractRegistry {
  private readonly schemaPaths: Record<StructuredSchemaId, string>;
  private readonly runtimeCriticalPaths: readonly string[];
  private readonly schemas = new Map<StructuredSchemaId, unknown>();
  private readonly fingerprints = new Map<string, FileFingerprint>();

  /**
   * `installationRoot` is where CompassRose itself lives, not the repository it is pointed at.
   * The parameter used to be called `repositoryRoot`, and the name was the defect: schemas and
   * runtime modules belong to the tool, and reading them out of a target repository only worked
   * because the only target this ever had was this one (ADR-0049).
   */
  constructor(
    private readonly installationRoot: string,
    runtimeCriticalPaths: readonly string[] = DEFAULT_RUNTIME_CRITICAL_PATHS,
  ) {
    this.schemaPaths = Object.fromEntries(
      Object.entries(STRUCTURED_SCHEMA_PATHS).map(([key, value]) => [key, join(installationRoot, value)]),
    ) as Record<StructuredSchemaId, string>;
    this.runtimeCriticalPaths = runtimeCriticalPaths.map((value) => join(installationRoot, value));
    this.initialize();
  }

  schema<T>(id: StructuredSchemaId): T {
    if (!this.schemas.has(id)) {
      throw new Error(`Structured schema ${id} is not loaded.`);
    }

    return this.schemas.get(id) as T;
  }

  refresh(): ContractRefreshResult {
    const reloadedSchemas: string[] = [];
    const restartReasons: string[] = [];

    for (const [schemaId, schemaPath] of Object.entries(this.schemaPaths) as Array<[StructuredSchemaId, string]>) {
      const current = fingerprintForPath(schemaPath);
      const previous = this.fingerprints.get(schemaPath);
      if (!sameFingerprint(previous, current)) {
        this.schemas.set(schemaId, readJsonFile(schemaPath));
        this.fingerprints.set(schemaPath, current);
        reloadedSchemas.push(relativePath(this.installationRoot, schemaPath));
      }
    }

    for (const runtimePath of this.runtimeCriticalPaths) {
      const current = fingerprintForPath(runtimePath);
      const previous = this.fingerprints.get(runtimePath);
      if (!sameFingerprint(previous, current)) {
        this.fingerprints.set(runtimePath, current);
        restartReasons.push(relativePath(this.installationRoot, runtimePath));
      }
    }

    return {
      reloadedSchemas,
      restartRequired: restartReasons.length > 0,
      restartReasons,
    };
  }

  private initialize(): void {
    for (const [schemaId, schemaPath] of Object.entries(this.schemaPaths) as Array<[StructuredSchemaId, string]>) {
      this.schemas.set(schemaId, readJsonFile(schemaPath));
      this.fingerprints.set(schemaPath, fingerprintForPath(schemaPath));
    }

    for (const runtimePath of this.runtimeCriticalPaths) {
      this.fingerprints.set(runtimePath, fingerprintForPath(runtimePath));
    }
  }
}
