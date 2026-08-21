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
 */
export function createCheckContext(
  configuration: ProjectConfiguration,
  checks: DoctorCheck[] = [],
): DoctorCheckContext {
  return {
    get configuration() {
      return configuration;
    },
    get checks() {
      return checks;
    },
    get readiness() {
      return checks.every((c) => c.status !== 'fail');
    },
  };
}

/**
 * Build a {@link DoctorReport} from the supplied ordered check results.
 *
 * - `success` is `true` unless at least one check `fail`s (`info` checks -- e.g. a report of
 *   currently-blocked work, which is expected operational state to act on, not an
 *   environment/config defect -- never flip this to failure).
 * - `exitCode` is `0` when nothing fails, `1` otherwise.
 * - The supplied checks are preserved in order (reference copied).
 */
export function buildDiagnosticReport(checks: readonly DoctorCheck[]): DoctorReport {
  const noFailures = checks.every((check) => check.status !== 'fail');

  return {
    repositoryRoot: null,
    currentPlatform: null,
    configPath: null,
    checks: [...checks],
    success: noFailures,
    exitCode: noFailures ? 0 : 1,
  };
}
