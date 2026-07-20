import { RpcResultValidationError } from './session-control-rpc-results.js';
import type {
  ChangesDecisionResult,
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

interface ExtensionRpcResultMap {
  'autohand.permissionAcknowledged': PermissionAcknowledgedResult;
  'autohand.directoryAccessResponse': DirectoryAccessResponseResult;
  'autohand.directoryAccessAcknowledged': DirectoryAccessAcknowledgedResult;
  'autohand.changesDecision': ChangesDecisionResult;
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
};

export function validateExtensionRpcResult<Method extends ExtensionRpcMethod>(
  method: Method,
  value: unknown
): ExtensionRpcResultMap[Method] {
  return validators[method](value, '$');
}
