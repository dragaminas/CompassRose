import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { formatDoctorReport, runDoctor } from '../doctor/doctorCommand.js';
import { readProjectConfiguration, validateRuntimePreconditions } from '../config/configReader.js';

export interface CliEnvironment {
  readonly cwd?: string;
  readonly stdout?: (message: string) => void;
  readonly stderr?: (message: string) => void;
}

export function main(argv: string[] = process.argv.slice(2), environment: CliEnvironment = {}): number {
  const stdout = environment.stdout ?? ((message: string) => process.stdout.write(`${message}\n`));
  const stderr = environment.stderr ?? ((message: string) => process.stderr.write(`${message}\n`));
  const cwd = environment.cwd ?? process.cwd();

  if (argv.length === 1 && argv[0] === 'doctor') {
    const report = runDoctor({ cwd });
    const output = formatDoctorReport(report);
    if (report.success) {
      stdout(output);
    } else {
      stderr(output);
    }

    return report.exitCode;
  }

  if (argv.length === 0) {
    const configPath = join(cwd, 'docs/compassrose/CONFIG.md');
    const configResult = readProjectConfiguration(configPath);

    if (!configResult.ok) {
      for (const issue of configResult.error) {
        if (issue.line) {
          stderr(`${issue.field} (line ${issue.line}): ${issue.message}`);
        } else {
          stderr(`${issue.field}: ${issue.message}`);
        }
      }
      return 1;
    }

    const preflightIssues = validateRuntimePreconditions(configResult.value);
    if (preflightIssues.length > 0) {
      for (const issue of preflightIssues) {
        stderr(`runtime preflight: ${issue.field}: ${issue.message}`);
      }
      return 1;
    }

    stdout('CompassRose preflight passed. No tasks to run.');
    return 0;
  }

  stderr('Usage: compassrose doctor');
  return 1;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  const exitCode = main();
  process.exitCode = exitCode;
}
