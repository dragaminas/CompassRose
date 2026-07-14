import { describe, expect, test } from 'vitest';
import { ControlledStopError, stopExitCodeForSignal } from '../src/runtime/controlledStop.js';

describe('ControlledStopError', () => {
  test('carries exitCode and signal and sets its own name', () => {
    const error = new ControlledStopError('stopped', 130, 'SIGINT');
    expect(error.message).toBe('stopped');
    expect(error.exitCode).toBe(130);
    expect(error.signal).toBe('SIGINT');
    expect(error.name).toBe('ControlledStopError');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('stopExitCodeForSignal', () => {
  test('maps SIGTERM to 143', () => {
    expect(stopExitCodeForSignal('SIGTERM')).toBe(143);
  });

  test('maps SIGINT (and any other signal) to 130', () => {
    expect(stopExitCodeForSignal('SIGINT')).toBe(130);
    expect(stopExitCodeForSignal(null)).toBe(130);
  });
});
