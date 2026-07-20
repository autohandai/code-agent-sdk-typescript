import { RpcResultValidationError } from './session-control-rpc-results.js';
import type {
  DirectoryAccessResponseResult,
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

interface ExtensionRpcResultMap {
  'autohand.permissionAcknowledged': PermissionAcknowledgedResult;
  'autohand.directoryAccessResponse': DirectoryAccessResponseResult;
}

export type ExtensionRpcMethod = keyof ExtensionRpcResultMap;

const validators: {
  readonly [Method in ExtensionRpcMethod]: ResultValidator<ExtensionRpcResultMap[Method]>;
} = {
  'autohand.permissionAcknowledged': (value, path) =>
    permissionAcknowledgedResult(value, 'autohand.permissionAcknowledged', path),
  'autohand.directoryAccessResponse': (value, path) =>
    directoryAccessResponseResult(value, 'autohand.directoryAccessResponse', path),
};

export function validateExtensionRpcResult<Method extends ExtensionRpcMethod>(
  method: Method,
  value: unknown
): ExtensionRpcResultMap[Method] {
  return validators[method](value, '$');
}
