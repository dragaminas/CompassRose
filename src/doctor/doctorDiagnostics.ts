import type { DoctorCheck, DoctorReport } from '../contracts/doctor/doctorContracts.js';
import type { ProjectConfiguration } from '../config/configTypes.js';

/**
 * Readonly diagnostic context derived from a successfully loaded
 * {@link ProjectConfiguration}.  Consumers pass the normalised
 * configuration here — no parsing, no validation, no mutation.
 */
export interface DoctorCheckContext {
  /** The original, unmodified normalised configuration. */
  readonly configuration: ProjectConfiguration;
  /** Runtime facts computed by the doctor coordinator. */
  readonly repositoryRoot: DoctorRuntimeFacts['repositoryRoot'];
  readonly currentPlatform: DoctorRuntimeFacts['currentPlatform'];
  readonly configPath: DoctorRuntimeFacts['configPath'];
  /** Per-check results populated by the doctor flow. */
  readonly checks: readonly DoctorCheck[];
  /** Overall readiness derived from {@link checks}. */
  readonly readiness: boolean;
}

/**
 * Construct a diagnostic boundary from a normalised configuration
 * object.  The returned context does not mutate the configuration.
 * `checks` defaults to an initially-empty array, but a caller that is
 * still accumulating checks (e.g. the Doctor coordinator) may pass its
 * own array by reference so {@link checks}/{@link readiness} reflect
 * every check pushed to it afterward, not just the ones known at
 * construction time.
 *
 * Runtime facts (repositoryRoot, currentPlatform, configPath) default to null when omitted.
 */
export function createCheckContext(
  configuration: ProjectConfiguration,
  checks: DoctorCheck[] = [],
  runtimeFacts: DoctorRuntimeFacts = {
    repositoryRoot: null,
    currentPlatform: null,
    configPath: null,
  },
): DoctorCheckContext {
  return {
    get configuration() {
      return configuration;
    },
    get repositoryRoot() {
      return runtimeFacts.repositoryRoot;
    },
    get currentPlatform() {
      return runtimeFacts.currentPlatform;
    },
    get configPath() {
      return runtimeFacts.configPath;
    },
    get checks() {
      return checks;
    },
    get readiness() {
      return checks.every((c) => c.status !== 'fail');
    },
  };
}

export interface DoctorRuntimeFacts {
  readonly repositoryRoot: DoctorReport['repositoryRoot'];
  readonly currentPlatform: DoctorReport['currentPlatform'];
  readonly configPath: DoctorReport['configPath'];
}

/**
 * Build a {@link DoctorReport} from the complete diagnostic context.
 *
 * - `success` is `true` unless at least one check `fail`s (`info` checks -- e.g. a report of
 *   currently-blocked work, which is expected operational state to act on, not an
 *   environment/config defect -- never flip this to failure).
 * - `exitCode` is `0` when nothing fails, `1` otherwise.
 * - The supplied checks are preserved in order (reference copied).
 * - Runtime facts (repositoryRoot, currentPlatform, configPath) are propagated from the
 *   same context that derives readiness, so the report cannot lose or patch them afterward.
 */
export function buildDiagnosticReport(context: DoctorCheckContext): DoctorReport;
export function buildDiagnosticReport(
  checks: readonly DoctorCheck[],
  runtimeFacts: DoctorRuntimeFacts,
): DoctorReport;
export function buildDiagnosticReport(
  contextOrChecks: DoctorCheckContext | readonly DoctorCheck[],
  runtimeFacts?: DoctorRuntimeFacts,
): DoctorReport {
  const isContext = !Array.isArray(contextOrChecks);
  const context = isContext ? (contextOrChecks as DoctorCheckContext) : undefined;
  const checks: readonly DoctorCheck[] = context
    ? context.checks
    : (contextOrChecks as readonly DoctorCheck[]);
  const readiness = context
    ? context.readiness
    : checks.every((check: DoctorCheck) => check.status !== 'fail');

  return {
    repositoryRoot: context?.repositoryRoot ?? runtimeFacts?.repositoryRoot ?? null,
    currentPlatform: context?.currentPlatform ?? runtimeFacts?.currentPlatform ?? null,
    configPath: context?.configPath ?? runtimeFacts?.configPath ?? null,
    checks: [...checks],
    success: readiness,
    exitCode: readiness ? 0 : 1,
  };
}
