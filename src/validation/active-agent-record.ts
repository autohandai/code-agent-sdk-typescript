import type {
  ActiveAgentActivity,
  ActiveAgentMode,
  ActiveAgentPhase,
  ActiveAgentRecord,
  ActiveAgentStatus,
} from '../types/index.js';

const MAX_ACTIVITY_TEXT_LENGTH = 200;
const MAX_ACTIVITY_PATHS = 20;
const ESCAPE_CHARACTER = String.fromCodePoint(0x1b);
const BELL_CHARACTER = String.fromCodePoint(0x07);
const ANSI_ESCAPE_PATTERN = new RegExp(
  `${ESCAPE_CHARACTER}(?:\\[[0-?]*[ -/]*[@-~]|\\][^${BELL_CHARACTER}]*(?:${BELL_CHARACTER}|${ESCAPE_CHARACTER}\\\\))`,
  'gu',
);

const ACTIVE_AGENT_MODES: readonly ActiveAgentMode[] = [
  'interactive',
  'command',
  'rpc',
  'acp',
  'teammate',
];
const ACTIVE_AGENT_STATUSES: readonly ActiveAgentStatus[] = ['idle', 'working'];
const ACTIVE_AGENT_PHASES: readonly ActiveAgentPhase[] = [
  'idle',
  'thinking',
  'editing',
  'running_command',
  'waiting_input',
];

/** Validate and normalize a CLI-3 active-agent record at the filesystem boundary. */
export function parseActiveAgentRecord(value: unknown): ActiveAgentRecord | undefined {
  if (!isRecord(value)
    || value.version !== 1
    || !isPositiveInteger(value.pid)
    || !isString(value.sessionId)
    || !isString(value.workspaceRoot)
    || !isString(value.projectName)
    || !isString(value.provider)
    || !isString(value.model)
    || !isOneOf(value.mode, ACTIVE_AGENT_MODES)
    || !isOneOf(value.status, ACTIVE_AGENT_STATUSES)
    || !isIsoTimestamp(value.startedAt)
    || !isIsoTimestamp(value.updatedAt)
    || !isNonNegativeInteger(value.messageCount)
    || !isPercentage(value.contextPercent)
    || !isNonNegativeFiniteNumber(value.tokensUsed)) {
    return undefined;
  }

  const activity = value.activity === undefined
    ? undefined
    : parseActivity(value.activity);
  if (value.activity !== undefined && activity === undefined) return undefined;
  if (value.tokensUsageStatus !== undefined
    && value.tokensUsageStatus !== 'actual'
    && value.tokensUsageStatus !== 'unavailable') {
    return undefined;
  }
  if (value.sessionTokensUsed !== undefined
    && !isNonNegativeFiniteNumber(value.sessionTokensUsed)) {
    return undefined;
  }

  return {
    version: 1,
    pid: value.pid,
    sessionId: value.sessionId,
    workspaceRoot: value.workspaceRoot,
    projectName: value.projectName,
    provider: value.provider,
    model: value.model,
    mode: value.mode,
    status: value.status,
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
    messageCount: value.messageCount,
    contextPercent: value.contextPercent,
    tokensUsed: value.tokensUsed,
    ...(value.tokensUsageStatus === undefined
      ? {}
      : { tokensUsageStatus: value.tokensUsageStatus }),
    ...(value.sessionTokensUsed === undefined
      ? {}
      : { sessionTokensUsed: value.sessionTokensUsed }),
    ...(activity === undefined ? {} : { activity }),
  };
}

function parseActivity(value: unknown): ActiveAgentActivity | undefined {
  if (!isRecord(value)
    || !isOneOf(value.phase, ACTIVE_AGENT_PHASES)
    || !isStringArray(value.pathsWritten)
    || (value.claims !== undefined && !isStringArray(value.claims))
    || (value.instruction !== undefined && !isString(value.instruction))
    || (value.command !== undefined && !isString(value.command))) {
    return undefined;
  }
  const headRef = value.headRef === undefined ? undefined : parseHeadRef(value.headRef);
  if (value.headRef !== undefined && headRef === undefined) return undefined;

  return {
    phase: value.phase,
    pathsWritten: value.pathsWritten.slice(0, MAX_ACTIVITY_PATHS),
    ...(value.instruction === undefined
      ? {}
      : { instruction: sanitizeActivityText(value.instruction) }),
    ...(value.command === undefined
      ? {}
      : { command: sanitizeActivityText(value.command) }),
    ...(value.claims === undefined
      ? {}
      : { claims: value.claims.slice(0, MAX_ACTIVITY_PATHS) }),
    ...(headRef === undefined ? {} : { headRef }),
  };
}

function parseHeadRef(
  value: unknown,
): { branch: string | null; sha: string } | undefined {
  if (!isRecord(value)
    || (value.branch !== null && !isString(value.branch))
    || !isString(value.sha)) {
    return undefined;
  }
  return { branch: value.branch, sha: value.sha };
}

/** Harden text originating from another local process before an SDK client renders it. */
export function sanitizeActivityText(value: string): string {
  return [...value.replace(ANSI_ESCAPE_PATTERN, '')]
    .filter((character) => !isUnsafeTerminalCharacter(character.codePointAt(0)))
    .join('')
    .slice(0, MAX_ACTIVITY_TEXT_LENGTH);
}

function isUnsafeTerminalCharacter(codePoint: number | undefined): boolean {
  if (codePoint === undefined) return true;
  return (codePoint >= 0x00 && codePoint <= 0x08)
    || codePoint === 0x0b
    || codePoint === 0x0c
    || (codePoint >= 0x0e && codePoint <= 0x1f)
    || (codePoint >= 0x7f && codePoint <= 0x9f)
    || (codePoint >= 0x200b && codePoint <= 0x200f)
    || (codePoint >= 0x202a && codePoint <= 0x202e)
    || (codePoint >= 0x2060 && codePoint <= 0x206f)
    || codePoint === 0xfeff;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNonNegativeFiniteNumber(value) && Number.isInteger(value);
}

function isPercentage(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 100;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}
