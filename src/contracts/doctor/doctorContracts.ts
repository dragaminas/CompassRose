/**
 * Doctor command contracts.
 *
 * These shapes describe the observable input and output of the repository
 * preflight command.
 */
export type DoctorCheckStatus = "pass" | "fail";

export interface DoctorCheck {
  readonly name: string;
  readonly status: DoctorCheckStatus;
  readonly details: readonly string[];
}

export interface DoctorReport {
  readonly repositoryRoot: string | null;
  readonly currentPlatform: string | null;
  readonly configPath: string | null;
  readonly checks: readonly DoctorCheck[];
  readonly success: boolean;
  readonly exitCode: number;
}

export interface DoctorOptions {
  readonly cwd?: string;
}
