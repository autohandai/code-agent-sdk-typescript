import type { AutomodeIterationEvent } from '../types/index.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/** Parse a CLI auto-mode iteration notification at the transport trust boundary. */
export function parseAutomodeIterationEvent(value: unknown): AutomodeIterationEvent | undefined {
  if (!isRecord(value)
    || typeof value.sessionId !== 'string'
    || typeof value.iteration !== 'number'
    || !Number.isFinite(value.iteration)
    || !isStringArray(value.actions)
    || typeof value.timestamp !== 'string'
    || (value.tokensUsed !== undefined
      && (typeof value.tokensUsed !== 'number' || !Number.isFinite(value.tokensUsed)))) {
    return undefined;
  }
  return {
    type: 'automode_iteration',
    sessionId: value.sessionId,
    iteration: value.iteration,
    actions: value.actions,
    ...(value.tokensUsed !== undefined ? { tokensUsed: value.tokensUsed } : {}),
    timestamp: value.timestamp,
  };
}
