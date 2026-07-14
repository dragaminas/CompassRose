import { join, relative as relativePath } from 'node:path';
import { statSync } from 'node:fs';
import type { ContractRefreshResult } from '../contracts/runtime/protoRuntime.js';
import { readUtf8 } from '../filesystem/textNormalization.js';

export type StructuredSchemaId =
  | 'feature_plan'
  | 'planner_output'
  | 'reviewer_output'
  | 'task_interface_analysis'
  | 'diagnostic_autocorrection';

interface FileFingerprint {
  readonly exists: boolean;
  readonly mtimeMs: number;
  readonly size: number;
}

const STRUCTURED_SCHEMA_PATHS: Record<StructuredSchemaId, string> = {
  feature_plan: 'src/contracts/planner/feature-output.schema.json',
  planner_output: 'src/contracts/planner/output.schema.json',
  reviewer_output: 'src/contracts/reviewer/output.schema.json',
  task_interface_analysis: 'src/contracts/runtime/task-interface-analysis.schema.json',
  diagnostic_autocorrection: 'src/contracts/runtime/diagnostic-autocorrection.schema.json',
};

// The runtime-critical paths are the files that, if changed, mean the orchestrator's own
// behavior may have changed underneath it — so a running loop should restart instead of
// continuing to execute stale in-memory logic. CompassRoseOrchestrator always passes its
// own explicit module list (see ORCHESTRATOR_RUNTIME_CRITICAL_PATHS in orchestrator.ts);
// this default only applies to a caller that doesn't specify one.
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

  constructor(
    private readonly repositoryRoot: string,
    runtimeCriticalPaths: readonly string[] = DEFAULT_RUNTIME_CRITICAL_PATHS,
  ) {
    this.schemaPaths = Object.fromEntries(
      Object.entries(STRUCTURED_SCHEMA_PATHS).map(([key, value]) => [key, join(repositoryRoot, value)]),
    ) as Record<StructuredSchemaId, string>;
    this.runtimeCriticalPaths = runtimeCriticalPaths.map((value) => join(repositoryRoot, value));
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
        reloadedSchemas.push(relativePath(this.repositoryRoot, schemaPath));
      }
    }

    for (const runtimePath of this.runtimeCriticalPaths) {
      const current = fingerprintForPath(runtimePath);
      const previous = this.fingerprints.get(runtimePath);
      if (!sameFingerprint(previous, current)) {
        this.fingerprints.set(runtimePath, current);
        restartReasons.push(relativePath(this.repositoryRoot, runtimePath));
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
