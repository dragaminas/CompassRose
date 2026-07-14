export class ControlledStopError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
    readonly signal: string | null,
  ) {
    super(message);
    this.name = 'ControlledStopError';
  }
}

export function stopExitCodeForSignal(signal: string | null): number {
  return signal === 'SIGTERM' ? 143 : 130;
}
