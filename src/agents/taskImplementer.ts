export interface CommandExecution {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly commandInvoked: string;
}

export interface TaskImplementer {
  run(prompt: string, label?: string): CommandExecution;
}
