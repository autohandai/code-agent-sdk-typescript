import type {
  AutomodeCompleteEvent,
  AutomodeErrorEvent,
  AutomodeIterationEvent,
} from '../types/index.js';

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

/** Parse a CLI auto-mode completion notification at the transport trust boundary. */
export function parseAutomodeCompleteEvent(value: unknown): AutomodeCompleteEvent | undefined {
  if (!isRecord(value)
    || typeof value.sessionId !== 'string'
    || typeof value.iterations !== 'number'
    || !Number.isFinite(value.iterations)
    || typeof value.filesCreated !== 'number'
    || !Number.isFinite(value.filesCreated)
    || typeof value.filesModified !== 'number'
    || !Number.isFinite(value.filesModified)
    || typeof value.timestamp !== 'string') {
    return undefined;
  }
  return {
    type: 'automode_complete',
    sessionId: value.sessionId,
    iterations: value.iterations,
    filesCreated: value.filesCreated,
    filesModified: value.filesModified,
    timestamp: value.timestamp,
  };
}

/** Parse a CLI auto-mode error notification at the transport trust boundary. */
export function parseAutomodeErrorEvent(value: unknown): AutomodeErrorEvent | undefined {
  if (!isRecord(value)
    || typeof value.sessionId !== 'string'
    || typeof value.error !== 'string'
    || typeof value.timestamp !== 'string') {
    return undefined;
  }
  return {
    type: 'automode_error',
    sessionId: value.sessionId,
    error: value.error,
    timestamp: value.timestamp,
  };
}
