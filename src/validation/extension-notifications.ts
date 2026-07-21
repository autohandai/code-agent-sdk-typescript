import type {
  AutomodeCompleteEvent,
  AutomodeErrorEvent,
  AutomodeIterationEvent,
  HookPreToolEvent,
  HookPostToolEvent,
  HookPrePromptEvent,
  HookPostResponseEvent,
  FileModifiedEvent,
  HookSessionErrorEvent,
  HookStopEvent,
  HookSessionStartEvent,
  HookSessionEndEvent,
  HookSubagentStopEvent,
  HookPermissionRequestEvent,
  HookNotificationEvent,
  HookContextCompactedEvent,
  HookContextOverflowEvent,
  HookContextWarningEvent,
  HookContextCriticalEvent,
  McpInvokeRequestEvent,
  McpToolSummary,
  McpToolsChangedEvent,
  LearnProgressEvent,
  LearnProgressStatus,
} from '../types/index.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNonNegativeFiniteNumber(value) && Number.isInteger(value);
}

function isHookTokenUsageStatus(value: unknown): value is 'actual' | 'unavailable' {
  return value === 'actual' || value === 'unavailable';
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

/** Parse a CLI pre-tool hook notification at the transport trust boundary. */
export function parseHookPreToolEvent(value: unknown): HookPreToolEvent | undefined {
  if (!isRecord(value)
    || typeof value.toolId !== 'string'
    || typeof value.toolName !== 'string'
    || !isRecord(value.args)
    || typeof value.timestamp !== 'string') {
    return undefined;
  }
  return {
    type: 'hook_pre_tool',
    toolId: value.toolId,
    toolName: value.toolName,
    args: value.args,
    timestamp: value.timestamp,
  };
}

/** Parse a CLI post-tool hook notification at the transport trust boundary. */
export function parseHookPostToolEvent(value: unknown): HookPostToolEvent | undefined {
  if (!isRecord(value)
    || typeof value.toolId !== 'string'
    || typeof value.toolName !== 'string'
    || typeof value.success !== 'boolean'
    || typeof value.duration !== 'number'
    || !Number.isFinite(value.duration)
    || (value.output !== undefined && typeof value.output !== 'string')
    || typeof value.timestamp !== 'string') {
    return undefined;
  }
  return {
    type: 'hook_post_tool',
    toolId: value.toolId,
    toolName: value.toolName,
    success: value.success,
    duration: value.duration,
    ...(value.output !== undefined ? { output: value.output } : {}),
    timestamp: value.timestamp,
  };
}

/** Parse a CLI pre-prompt hook notification at the transport trust boundary. */
export function parseHookPrePromptEvent(value: unknown): HookPrePromptEvent | undefined {
  if (!isRecord(value)
    || typeof value.instruction !== 'string'
    || !isStringArray(value.mentionedFiles)
    || typeof value.timestamp !== 'string') {
    return undefined;
  }
  return {
    type: 'hook_pre_prompt',
    instruction: value.instruction,
    mentionedFiles: value.mentionedFiles,
    timestamp: value.timestamp,
  };
}

/** Parse a CLI post-response hook notification at the transport trust boundary. */
export function parseHookPostResponseEvent(value: unknown): HookPostResponseEvent | undefined {
  if (!isRecord(value)
    || typeof value.tokensUsed !== 'number'
    || !Number.isFinite(value.tokensUsed)
    || (value.tokensUsageStatus !== undefined
      && value.tokensUsageStatus !== 'actual'
      && value.tokensUsageStatus !== 'unavailable')
    || typeof value.toolCallsCount !== 'number'
    || !Number.isFinite(value.toolCallsCount)
    || typeof value.duration !== 'number'
    || !Number.isFinite(value.duration)
    || typeof value.timestamp !== 'string') {
    return undefined;
  }
  return {
    type: 'hook_post_response',
    tokensUsed: value.tokensUsed,
    ...(value.tokensUsageStatus !== undefined
      ? { tokensUsageStatus: value.tokensUsageStatus }
      : {}),
    toolCallsCount: value.toolCallsCount,
    duration: value.duration,
    timestamp: value.timestamp,
  };
}

/** Parse a CLI file-modified hook notification at the transport trust boundary. */
export function parseHookFileModifiedEvent(value: unknown): FileModifiedEvent | undefined {
  if (!isRecord(value)
    || typeof value.filePath !== 'string'
    || (value.changeType !== 'create'
      && value.changeType !== 'modify'
      && value.changeType !== 'delete')
    || typeof value.toolId !== 'string'
    || typeof value.timestamp !== 'string') {
    return undefined;
  }
  return {
    type: 'file_modified',
    filePath: value.filePath,
    changeType: value.changeType,
    toolId: value.toolId,
    timestamp: value.timestamp,
  };
}

/** Parse a CLI session-error hook notification at the transport trust boundary. */
export function parseHookSessionErrorEvent(value: unknown): HookSessionErrorEvent | undefined {
  if (!isRecord(value)
    || typeof value.error !== 'string'
    || (value.code !== undefined && typeof value.code !== 'string')
    || (value.context !== undefined && !isRecord(value.context))
    || typeof value.timestamp !== 'string') {
    return undefined;
  }
  return {
    type: 'hook_session_error',
    error: value.error,
    ...(value.code !== undefined ? { code: value.code } : {}),
    ...(value.context !== undefined ? { context: value.context } : {}),
    timestamp: value.timestamp,
  };
}

/** Parse a CLI stop hook notification at the transport trust boundary. */
export function parseHookStopEvent(value: unknown): HookStopEvent | undefined {
  if (!isRecord(value)
    || !isFiniteNumber(value.tokensUsed)
    || (value.tokensUsageStatus !== undefined
      && !isHookTokenUsageStatus(value.tokensUsageStatus))
    || !isFiniteNumber(value.toolCallsCount)
    || !isFiniteNumber(value.duration)
    || typeof value.timestamp !== 'string') {
    return undefined;
  }
  return {
    type: 'hook_stop',
    tokensUsed: value.tokensUsed,
    ...(value.tokensUsageStatus !== undefined
      ? { tokensUsageStatus: value.tokensUsageStatus }
      : {}),
    toolCallsCount: value.toolCallsCount,
    duration: value.duration,
    timestamp: value.timestamp,
  };
}

/** Parse a CLI session-start hook notification at the transport trust boundary. */
export function parseHookSessionStartEvent(value: unknown): HookSessionStartEvent | undefined {
  if (!isRecord(value)
    || (value.sessionType !== 'startup'
      && value.sessionType !== 'resume'
      && value.sessionType !== 'clear')
    || typeof value.timestamp !== 'string') {
    return undefined;
  }
  return { type: 'hook_session_start', sessionType: value.sessionType, timestamp: value.timestamp };
}

/** Parse a CLI session-end hook notification at the transport trust boundary. */
export function parseHookSessionEndEvent(value: unknown): HookSessionEndEvent | undefined {
  if (!isRecord(value)
    || (value.reason !== 'quit'
      && value.reason !== 'clear'
      && value.reason !== 'exit'
      && value.reason !== 'error')
    || !isFiniteNumber(value.duration)
    || typeof value.timestamp !== 'string') {
    return undefined;
  }
  return {
    type: 'hook_session_end',
    reason: value.reason,
    duration: value.duration,
    timestamp: value.timestamp,
  };
}

/** Parse a CLI subagent-stop hook notification at the transport trust boundary. */
export function parseHookSubagentStopEvent(value: unknown): HookSubagentStopEvent | undefined {
  if (!isRecord(value)
    || typeof value.subagentId !== 'string'
    || typeof value.subagentName !== 'string'
    || typeof value.subagentType !== 'string'
    || typeof value.success !== 'boolean'
    || !isFiniteNumber(value.duration)
    || (value.error !== undefined && typeof value.error !== 'string')
    || typeof value.timestamp !== 'string') {
    return undefined;
  }
  return {
    type: 'hook_subagent_stop',
    subagentId: value.subagentId,
    subagentName: value.subagentName,
    subagentType: value.subagentType,
    success: value.success,
    duration: value.duration,
    ...(value.error !== undefined ? { error: value.error } : {}),
    timestamp: value.timestamp,
  };
}

/** Parse a CLI permission-request hook notification at the transport trust boundary. */
export function parseHookPermissionRequestEvent(
  value: unknown
): HookPermissionRequestEvent | undefined {
  if (!isRecord(value)
    || typeof value.tool !== 'string'
    || (value.path !== undefined && typeof value.path !== 'string')
    || (value.command !== undefined && typeof value.command !== 'string')
    || (value.args !== undefined && !isRecord(value.args))
    || typeof value.timestamp !== 'string') {
    return undefined;
  }
  return {
    type: 'hook_permission_request',
    tool: value.tool,
    ...(value.path !== undefined ? { path: value.path } : {}),
    ...(value.command !== undefined ? { command: value.command } : {}),
    ...(value.args !== undefined ? { args: value.args } : {}),
    timestamp: value.timestamp,
  };
}

/** Parse a CLI user-notification hook at the transport trust boundary. */
export function parseHookNotificationEvent(value: unknown): HookNotificationEvent | undefined {
  if (!isRecord(value)
    || typeof value.notificationType !== 'string'
    || typeof value.message !== 'string'
    || typeof value.timestamp !== 'string') {
    return undefined;
  }
  return {
    type: 'hook_notification',
    notificationType: value.notificationType,
    message: value.message,
    timestamp: value.timestamp,
  };
}

/** Parse a CLI context-compacted hook notification at the transport trust boundary. */
export function parseHookContextCompactedEvent(
  value: unknown
): HookContextCompactedEvent | undefined {
  if (!isRecord(value)
    || !isNonNegativeInteger(value.croppedCount)
    || (value.summary !== undefined && typeof value.summary !== 'string')
    || !isNonNegativeFiniteNumber(value.usagePercent)
    || typeof value.reason !== 'string'
    || typeof value.timestamp !== 'string') {
    return undefined;
  }
  return {
    type: 'hook_context_compacted',
    croppedCount: value.croppedCount,
    ...(value.summary !== undefined ? { summary: value.summary } : {}),
    usagePercent: value.usagePercent,
    reason: value.reason,
    timestamp: value.timestamp,
  };
}

/** Parse a CLI context-overflow hook notification at the transport trust boundary. */
export function parseHookContextOverflowEvent(
  value: unknown
): HookContextOverflowEvent | undefined {
  if (!isRecord(value)
    || !isNonNegativeInteger(value.tokensBefore)
    || !isNonNegativeInteger(value.tokensAfter)
    || !isNonNegativeInteger(value.croppedCount)
    || !isNonNegativeFiniteNumber(value.usagePercent)
    || typeof value.timestamp !== 'string') {
    return undefined;
  }
  return {
    type: 'hook_context_overflow',
    tokensBefore: value.tokensBefore,
    tokensAfter: value.tokensAfter,
    croppedCount: value.croppedCount,
    usagePercent: value.usagePercent,
    timestamp: value.timestamp,
  };
}

function parseHookContextPressureEvent(
  value: unknown,
  type: 'hook_context_warning'
): HookContextWarningEvent | undefined;
function parseHookContextPressureEvent(
  value: unknown,
  type: 'hook_context_critical'
): HookContextCriticalEvent | undefined;
function parseHookContextPressureEvent(
  value: unknown,
  type: 'hook_context_warning' | 'hook_context_critical'
): HookContextWarningEvent | HookContextCriticalEvent | undefined {
  if (!isRecord(value)
    || !isNonNegativeFiniteNumber(value.usagePercent)
    || !isNonNegativeInteger(value.remainingTokens)
    || typeof value.timestamp !== 'string') {
    return undefined;
  }
  return {
    type,
    usagePercent: value.usagePercent,
    remainingTokens: value.remainingTokens,
    timestamp: value.timestamp,
  };
}

/** Parse a CLI context-warning hook notification at the transport trust boundary. */
export function parseHookContextWarningEvent(value: unknown): HookContextWarningEvent | undefined {
  return parseHookContextPressureEvent(value, 'hook_context_warning');
}

/** Parse a CLI context-critical hook notification at the transport trust boundary. */
export function parseHookContextCriticalEvent(value: unknown): HookContextCriticalEvent | undefined {
  return parseHookContextPressureEvent(value, 'hook_context_critical');
}

/** Parse a CLI MCP invocation request at the transport trust boundary. */
export function parseMcpInvokeRequestEvent(value: unknown): McpInvokeRequestEvent | undefined {
  if (!isRecord(value)
    || typeof value.requestId !== 'string'
    || typeof value.toolName !== 'string'
    || !isRecord(value.args)
    || typeof value.timestamp !== 'string') {
    return undefined;
  }
  return {
    type: 'mcp_invoke_request',
    requestId: value.requestId,
    toolName: value.toolName,
    args: value.args,
    timestamp: value.timestamp,
  };
}

function parseMcpToolSummary(value: unknown): McpToolSummary | undefined {
  if (!isRecord(value)
    || typeof value.name !== 'string'
    || typeof value.description !== 'string'
    || typeof value.serverName !== 'string') {
    return undefined;
  }
  return {
    name: value.name,
    description: value.description,
    serverName: value.serverName,
  };
}

/** Parse a CLI MCP tools-changed notification at the transport trust boundary. */
export function parseMcpToolsChangedEvent(value: unknown): McpToolsChangedEvent | undefined {
  if (!isRecord(value) || !Array.isArray(value.tools) || typeof value.timestamp !== 'string') {
    return undefined;
  }
  const tools: McpToolSummary[] = [];
  for (const rawTool of value.tools) {
    const tool = parseMcpToolSummary(rawTool);
    if (tool === undefined) return undefined;
    tools.push(tool);
  }
  return { type: 'mcp_tools_changed', tools, timestamp: value.timestamp };
}

function isLearnProgressStatus(value: unknown): value is LearnProgressStatus {
  return value === 'analyzing'
    || value === 'loading-registry'
    || value === 'evaluating'
    || value === 'generating'
    || value === 'updating';
}

/** Parse a CLI project-learning progress notification at the transport trust boundary. */
export function parseLearnProgressEvent(value: unknown): LearnProgressEvent | undefined {
  if (!isRecord(value)
    || !isLearnProgressStatus(value.status)
    || typeof value.timestamp !== 'string') {
    return undefined;
  }
  return { type: 'learn_progress', status: value.status, timestamp: value.timestamp };
}
