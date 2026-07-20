import { RpcResultValidationError } from './session-control-rpc-results.js';
import type {
  ChangesDecisionResult,
  GetHistoryResult,
  GetSessionResult,
  GetSessionSuccessResult,
  RpcMessage,
  SessionAttachResult,
  YoloSetResult,
  McpSetVscodeToolsResult,
  McpInvokeResponseResult,
  LearnAuditEntry,
  LearnRecommendation,
  LearnRecommendResult,
  LearnUpdateEntry,
  LearnUpdateResult,
  RpcHistoryEntry,
  DirectoryAccessResponseResult,
  DirectoryAccessAcknowledgedResult,
  PermissionAcknowledgedResult,
} from '../types/index.js';

type ResultValidator<Result> = (value: unknown, path: string) => Result;

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function invalid(method: string, path: string, expected: string, value: unknown): never {
  throw new RpcResultValidationError(method, path, expected, describe(value));
}

function object(value: unknown, method: string, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid(method, path, 'object', value);
  }
  return value as Record<string, unknown>;
}

function boolean(value: unknown, method: string, path: string): boolean {
  return typeof value === 'boolean' ? value : invalid(method, path, 'boolean', value);
}

function string(value: unknown, method: string, path: string): string {
  return typeof value === 'string' ? value : invalid(method, path, 'string', value);
}

function number(value: unknown, method: string, path: string): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : invalid(method, path, 'finite number', value);
}

function array<Result>(
  value: unknown,
  method: string,
  path: string,
  item: (value: unknown, method: string, path: string) => Result
): Result[] {
  if (!Array.isArray(value)) return invalid(method, path, 'array', value);
  return value.map((entry, index) => item(entry, method, `${path}[${index}]`));
}

function permissionAcknowledgedResult(
  value: unknown,
  method: string,
  path: string
): PermissionAcknowledgedResult {
  const record = object(value, method, path);
  return { success: boolean(record.success, method, `${path}.success`) };
}

function directoryAccessResponseResult(
  value: unknown,
  method: string,
  path: string
): DirectoryAccessResponseResult {
  const record = object(value, method, path);
  return { success: boolean(record.success, method, `${path}.success`) };
}

function directoryAccessAcknowledgedResult(
  value: unknown,
  method: string,
  path: string
): DirectoryAccessAcknowledgedResult {
  const record = object(value, method, path);
  return { success: boolean(record.success, method, `${path}.success`) };
}

function changesDecisionError(
  value: unknown,
  method: string,
  path: string
): { changeId: string; error: string } {
  const record = object(value, method, path);
  return {
    changeId: string(record.changeId, method, `${path}.changeId`),
    error: string(record.error, method, `${path}.error`),
  };
}

function changesDecisionResult(
  value: unknown,
  method: string,
  path: string
): ChangesDecisionResult {
  const record = object(value, method, path);
  const result: ChangesDecisionResult = {
    success: boolean(record.success, method, `${path}.success`),
    appliedCount: number(record.appliedCount, method, `${path}.appliedCount`),
    skippedCount: number(record.skippedCount, method, `${path}.skippedCount`),
  };
  if (record.errors !== undefined) {
    result.errors = array(record.errors, method, `${path}.errors`, changesDecisionError);
  }
  return result;
}

function historyStatus(
  value: unknown,
  method: string,
  path: string
): RpcHistoryEntry['status'] {
  if (value === 'active' || value === 'completed' || value === 'crashed') return value;
  return invalid(method, path, 'active | completed | crashed', value);
}

function historyEntry(value: unknown, method: string, path: string): RpcHistoryEntry {
  const record = object(value, method, path);
  return {
    sessionId: string(record.sessionId, method, `${path}.sessionId`),
    createdAt: string(record.createdAt, method, `${path}.createdAt`),
    lastActiveAt: string(record.lastActiveAt, method, `${path}.lastActiveAt`),
    projectName: string(record.projectName, method, `${path}.projectName`),
    model: string(record.model, method, `${path}.model`),
    messageCount: number(record.messageCount, method, `${path}.messageCount`),
    status: historyStatus(record.status, method, `${path}.status`),
  };
}

function getHistoryResult(value: unknown, method: string, path: string): GetHistoryResult {
  const record = object(value, method, path);
  return {
    sessions: array(record.sessions, method, `${path}.sessions`, historyEntry),
    currentPage: number(record.currentPage, method, `${path}.currentPage`),
    totalPages: number(record.totalPages, method, `${path}.totalPages`),
    totalItems: number(record.totalItems, method, `${path}.totalItems`),
  };
}

function messageRole(value: unknown, method: string, path: string): RpcMessage['role'] {
  if (value === 'user' || value === 'assistant' || value === 'system' || value === 'tool') {
    return value;
  }
  return invalid(method, path, 'user | assistant | system | tool', value);
}

function toolCall(
  value: unknown,
  method: string,
  path: string
): NonNullable<RpcMessage['toolCalls']>[number] {
  const record = object(value, method, path);
  return {
    id: string(record.id, method, `${path}.id`),
    name: string(record.name, method, `${path}.name`),
    args: object(record.args, method, `${path}.args`),
  };
}

function rpcMessage(value: unknown, method: string, path: string): RpcMessage {
  const record = object(value, method, path);
  const message: RpcMessage = {
    id: string(record.id, method, `${path}.id`),
    role: messageRole(record.role, method, `${path}.role`),
    content: string(record.content, method, `${path}.content`),
    timestamp: string(record.timestamp, method, `${path}.timestamp`),
  };
  if (record.toolCalls !== undefined) {
    message.toolCalls = array(record.toolCalls, method, `${path}.toolCalls`, toolCall);
  }
  return message;
}

function getSessionResult(value: unknown, method: string, path: string): GetSessionResult {
  const record = object(value, method, path);
  const succeeded = boolean(record.success, method, `${path}.success`);
  if (!succeeded) {
    return record.error === undefined
      ? { success: false }
      : { success: false, error: string(record.error, method, `${path}.error`) };
  }

  const result: GetSessionSuccessResult = {
    success: true,
    sessionId: string(record.sessionId, method, `${path}.sessionId`),
    projectName: string(record.projectName, method, `${path}.projectName`),
    model: string(record.model, method, `${path}.model`),
    messageCount: number(record.messageCount, method, `${path}.messageCount`),
    status: string(record.status, method, `${path}.status`),
    createdAt: string(record.createdAt, method, `${path}.createdAt`),
    lastActiveAt: string(record.lastActiveAt, method, `${path}.lastActiveAt`),
    messages: array(record.messages, method, `${path}.messages`, rpcMessage),
    workspaceRoot: string(record.workspaceRoot, method, `${path}.workspaceRoot`),
  };
  if (record.summary !== undefined) {
    result.summary = string(record.summary, method, `${path}.summary`);
  }
  return result;
}

function sessionAttachResult(value: unknown, method: string, path: string): SessionAttachResult {
  const record = object(value, method, path);
  const result: SessionAttachResult = {
    success: boolean(record.success, method, `${path}.success`),
  };
  if (record.sessionId !== undefined) {
    result.sessionId = string(record.sessionId, method, `${path}.sessionId`);
  }
  if (record.workspaceRoot !== undefined) {
    result.workspaceRoot = string(record.workspaceRoot, method, `${path}.workspaceRoot`);
  }
  if (record.messageCount !== undefined) {
    result.messageCount = number(record.messageCount, method, `${path}.messageCount`);
  }
  if (record.error !== undefined) {
    result.error = string(record.error, method, `${path}.error`);
  }
  return result;
}

function yoloSetResult(value: unknown, method: string, path: string): YoloSetResult {
  const record = object(value, method, path);
  const result: YoloSetResult = {
    success: boolean(record.success, method, `${path}.success`),
  };
  if (record.expiresIn !== undefined) {
    result.expiresIn = number(record.expiresIn, method, `${path}.expiresIn`);
  }
  return result;
}

function mcpSetVscodeToolsResult(
  value: unknown,
  method: string,
  path: string
): McpSetVscodeToolsResult {
  const record = object(value, method, path);
  return { success: boolean(record.success, method, `${path}.success`) };
}

function mcpInvokeResponseResult(
  value: unknown,
  method: string,
  path: string
): McpInvokeResponseResult {
  const record = object(value, method, path);
  return { success: boolean(record.success, method, `${path}.success`) };
}

function learnAuditStatus(
  value: unknown,
  method: string,
  path: string
): LearnAuditEntry['status'] {
  if (value === 'redundant' || value === 'outdated' || value === 'conflicting') return value;
  return invalid(method, path, 'redundant | outdated | conflicting', value);
}

function learnAuditEntry(value: unknown, method: string, path: string): LearnAuditEntry {
  const record = object(value, method, path);
  return {
    skill: string(record.skill, method, `${path}.skill`),
    status: learnAuditStatus(record.status, method, `${path}.status`),
    reason: string(record.reason, method, `${path}.reason`),
  };
}

function learnRecommendation(
  value: unknown,
  method: string,
  path: string
): LearnRecommendation {
  const record = object(value, method, path);
  return {
    slug: string(record.slug, method, `${path}.slug`),
    score: number(record.score, method, `${path}.score`),
    reason: string(record.reason, method, `${path}.reason`),
  };
}

function learnRecommendResult(
  value: unknown,
  method: string,
  path: string
): LearnRecommendResult {
  const record = object(value, method, path);
  const result: LearnRecommendResult = {
    success: boolean(record.success, method, `${path}.success`),
    projectSummary: string(record.projectSummary, method, `${path}.projectSummary`),
    audit: array(record.audit, method, `${path}.audit`, learnAuditEntry),
    recommendations: array(
      record.recommendations,
      method,
      `${path}.recommendations`,
      learnRecommendation
    ),
    gapAnalysis: record.gapAnalysis === null
      ? null
      : string(record.gapAnalysis, method, `${path}.gapAnalysis`),
  };
  if (record.error !== undefined) {
    result.error = string(record.error, method, `${path}.error`);
  }
  return result;
}

function learnUpdateStatus(
  value: unknown,
  method: string,
  path: string
): LearnUpdateEntry['status'] {
  if (value === 'updated' || value === 'unchanged' || value === 'failed') return value;
  return invalid(method, path, 'updated | unchanged | failed', value);
}

function learnUpdateEntry(value: unknown, method: string, path: string): LearnUpdateEntry {
  const record = object(value, method, path);
  return {
    name: string(record.name, method, `${path}.name`),
    status: learnUpdateStatus(record.status, method, `${path}.status`),
  };
}

function learnUpdateResult(value: unknown, method: string, path: string): LearnUpdateResult {
  const record = object(value, method, path);
  const result: LearnUpdateResult = {
    success: boolean(record.success, method, `${path}.success`),
    updated: number(record.updated, method, `${path}.updated`),
    unchanged: number(record.unchanged, method, `${path}.unchanged`),
    results: array(record.results, method, `${path}.results`, learnUpdateEntry),
  };
  if (record.error !== undefined) {
    result.error = string(record.error, method, `${path}.error`);
  }
  return result;
}

interface ExtensionRpcResultMap {
  'autohand.permissionAcknowledged': PermissionAcknowledgedResult;
  'autohand.directoryAccessResponse': DirectoryAccessResponseResult;
  'autohand.directoryAccessAcknowledged': DirectoryAccessAcknowledgedResult;
  'autohand.changesDecision': ChangesDecisionResult;
  'autohand.getHistory': GetHistoryResult;
  'autohand.getSession': GetSessionResult;
  'autohand.session.attach': SessionAttachResult;
  'autohand.yoloSet': YoloSetResult;
  'autohand.yolo.set': YoloSetResult;
  'autohand.mcp.setVscodeTools': McpSetVscodeToolsResult;
  'autohand.mcp.invokeResponse': McpInvokeResponseResult;
  'autohand.learn.recommend': LearnRecommendResult;
  'autohand.learn.update': LearnUpdateResult;
}

export type ExtensionRpcMethod = keyof ExtensionRpcResultMap;

const validators: {
  readonly [Method in ExtensionRpcMethod]: ResultValidator<ExtensionRpcResultMap[Method]>;
} = {
  'autohand.permissionAcknowledged': (value, path) =>
    permissionAcknowledgedResult(value, 'autohand.permissionAcknowledged', path),
  'autohand.directoryAccessResponse': (value, path) =>
    directoryAccessResponseResult(value, 'autohand.directoryAccessResponse', path),
  'autohand.directoryAccessAcknowledged': (value, path) =>
    directoryAccessAcknowledgedResult(value, 'autohand.directoryAccessAcknowledged', path),
  'autohand.changesDecision': (value, path) =>
    changesDecisionResult(value, 'autohand.changesDecision', path),
  'autohand.getHistory': (value, path) =>
    getHistoryResult(value, 'autohand.getHistory', path),
  'autohand.getSession': (value, path) =>
    getSessionResult(value, 'autohand.getSession', path),
  'autohand.session.attach': (value, path) =>
    sessionAttachResult(value, 'autohand.session.attach', path),
  'autohand.yoloSet': (value, path) =>
    yoloSetResult(value, 'autohand.yoloSet', path),
  'autohand.yolo.set': (value, path) =>
    yoloSetResult(value, 'autohand.yolo.set', path),
  'autohand.mcp.setVscodeTools': (value, path) =>
    mcpSetVscodeToolsResult(value, 'autohand.mcp.setVscodeTools', path),
  'autohand.mcp.invokeResponse': (value, path) =>
    mcpInvokeResponseResult(value, 'autohand.mcp.invokeResponse', path),
  'autohand.learn.recommend': (value, path) =>
    learnRecommendResult(value, 'autohand.learn.recommend', path),
  'autohand.learn.update': (value, path) =>
    learnUpdateResult(value, 'autohand.learn.update', path),
};

export function validateExtensionRpcResult<Method extends ExtensionRpcMethod>(
  method: Method,
  value: unknown
): ExtensionRpcResultMap[Method] {
  return validators[method](value, '$');
}
