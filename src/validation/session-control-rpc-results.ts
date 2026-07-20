import type {
  AutomodeCheckpoint,
  AutomodeGetLogResult,
  AutomodeLogCheckpoint,
  AutomodeLogEntry,
  AutomodeOperationResult,
  AutomodeSessionStatus,
  AutomodeStartResult,
  AutomodeState,
  AutomodeStatusResult,
  BrowserHandoffAttachResult,
  BrowserHandoffCreateResult,
  ResetResult,
} from '../types/index.js';

interface ValidationSuccess<T> {
  readonly success: true;
  readonly value: T;
}

interface ValidationFailure {
  readonly success: false;
  readonly path: string;
  readonly expected: string;
  readonly actual: string;
}

type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

interface RuntimeSchema<T> {
  readonly expected: string;
  validate(value: unknown, path: string): ValidationResult<T>;
}

interface RequiredField<T> {
  readonly optional?: false;
  readonly schema: RuntimeSchema<T>;
}

interface OptionalField<T> {
  readonly optional: true;
  readonly schema: RuntimeSchema<T>;
}

type ObjectField<T> = RequiredField<T> | OptionalField<T>;

type OptionalKeys<T extends object> = {
  [Key in keyof T]-?: object extends Pick<T, Key> ? Key : never;
}[keyof T];

type RequiredKeys<T extends object> = Exclude<keyof T, OptionalKeys<T>>;

type ObjectShape<T extends object> = {
  readonly [Key in RequiredKeys<T>]-?: RequiredField<T[Key]>;
} & {
  readonly [Key in OptionalKeys<T>]-?: OptionalField<Exclude<T[Key], undefined>>;
};

function success<T>(value: T): ValidationSuccess<T> {
  return { success: true, value };
}

function valueKind(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure(path: string, expected: string, value: unknown): ValidationFailure {
  return {
    success: false,
    path,
    expected,
    actual: valueKind(value),
  };
}

const stringSchema: RuntimeSchema<string> = {
  expected: 'string',
  validate(value, path) {
    return typeof value === 'string' ? success(value) : failure(path, this.expected, value);
  },
};

const booleanSchema: RuntimeSchema<boolean> = {
  expected: 'boolean',
  validate(value, path) {
    return typeof value === 'boolean' ? success(value) : failure(path, this.expected, value);
  },
};

const numberSchema: RuntimeSchema<number> = {
  expected: 'finite number',
  validate(value, path) {
    return typeof value === 'number' && Number.isFinite(value)
      ? success(value)
      : failure(path, this.expected, value);
  },
};

function enumSchema<const Values extends readonly string[]>(
  values: Values
): RuntimeSchema<Values[number]> {
  const allowed = new Set<string>(values);
  const expected = values.map((value) => JSON.stringify(value)).join(' | ');
  return {
    expected,
    validate(value, path) {
      return typeof value === 'string' && allowed.has(value)
        ? success(value as Values[number])
        : failure(path, expected, value);
    },
  };
}

function arraySchema<T>(itemSchema: RuntimeSchema<T>): RuntimeSchema<T[]> {
  return {
    expected: `array of ${itemSchema.expected}`,
    validate(value, path) {
      if (!Array.isArray(value)) return failure(path, this.expected, value);

      const parsed: T[] = [];
      for (const [index, item] of value.entries()) {
        const result = itemSchema.validate(item, `${path}[${index}]`);
        if (!result.success) return result;
        parsed.push(result.value);
      }
      return success(parsed);
    },
  };
}

function required<T>(schema: RuntimeSchema<T>): RequiredField<T> {
  return { schema };
}

function optional<T>(schema: RuntimeSchema<T>): OptionalField<T> {
  return { optional: true, schema };
}

function objectSchema<T extends object>(shape: ObjectShape<T>): RuntimeSchema<T> {
  return {
    expected: 'object',
    validate(value, path) {
      if (!isRecord(value)) {
        return failure(path, this.expected, value);
      }

      const source = value;
      const parsed: Record<string, unknown> = {};
      const fields = Object.entries(shape) as Array<[string, ObjectField<unknown>]>;

      for (const [key, field] of fields) {
        const fieldPath = `${path}.${key}`;
        if (!Object.prototype.hasOwnProperty.call(source, key)) {
          if (field.optional === true) continue;
          return {
            success: false,
            path: fieldPath,
            expected: field.schema.expected,
            actual: 'missing',
          };
        }

        const result = field.schema.validate(source[key], fieldPath);
        if (!result.success) return result;
        parsed[key] = result.value;
      }

      return success(parsed as T);
    },
  };
}

const resetResultSchema = objectSchema<ResetResult>({
  sessionId: required(stringSchema),
});

const browserHandoffCreateResultSchema = objectSchema<BrowserHandoffCreateResult>({
  token: required(stringSchema),
  sessionId: required(stringSchema),
  workspaceRoot: required(stringSchema),
  createdAt: required(stringSchema),
  expiresAt: required(stringSchema),
  url: required(stringSchema),
});

const browserHandoffAttachResultSchema = objectSchema<BrowserHandoffAttachResult>({
  success: required(booleanSchema),
  sessionId: optional(stringSchema),
  workspaceRoot: optional(stringSchema),
  messageCount: optional(numberSchema),
});

const automodeStartResultSchema = objectSchema<AutomodeStartResult>({
  success: required(booleanSchema),
  sessionId: optional(stringSchema),
  error: optional(stringSchema),
});

const automodeSessionStatusSchema: RuntimeSchema<AutomodeSessionStatus> = enumSchema([
  'running',
  'paused',
  'completed',
  'cancelled',
  'failed',
] as const);

const automodeCheckpointSchema = objectSchema<AutomodeCheckpoint>({
  commit: required(stringSchema),
  message: required(stringSchema),
  timestamp: required(stringSchema),
});

const automodeStateSchema = objectSchema<AutomodeState>({
  sessionId: required(stringSchema),
  status: required(automodeSessionStatusSchema),
  currentIteration: required(numberSchema),
  maxIterations: required(numberSchema),
  filesCreated: required(numberSchema),
  filesModified: required(numberSchema),
  branch: optional(stringSchema),
  lastCheckpoint: optional(automodeCheckpointSchema),
});

const automodeStatusResultSchema = objectSchema<AutomodeStatusResult>({
  active: required(booleanSchema),
  paused: required(booleanSchema),
  state: optional(automodeStateSchema),
});

const automodeOperationResultSchema = objectSchema<AutomodeOperationResult>({
  success: required(booleanSchema),
  error: optional(stringSchema),
});

const automodeLogCheckpointSchema = objectSchema<AutomodeLogCheckpoint>({
  commit: required(stringSchema),
  message: required(stringSchema),
});

const automodeLogEntrySchema = objectSchema<AutomodeLogEntry>({
  iteration: required(numberSchema),
  timestamp: required(stringSchema),
  actions: required(arraySchema(stringSchema)),
  tokensUsed: optional(numberSchema),
  cost: optional(numberSchema),
  checkpoint: optional(automodeLogCheckpointSchema),
});

const automodeGetLogResultSchema = objectSchema<AutomodeGetLogResult>({
  success: required(booleanSchema),
  iterations: required(arraySchema(automodeLogEntrySchema)),
  error: optional(stringSchema),
});

interface SessionControlRpcResultMap {
  'autohand.reset': ResetResult;
  'autohand.browserHandoff.create': BrowserHandoffCreateResult;
  'autohand.browserHandoff.attach': BrowserHandoffAttachResult;
  'autohand.browserHandoff.attachLatest': BrowserHandoffAttachResult;
  'autohand.automode.start': AutomodeStartResult;
  'autohand.automode.status': AutomodeStatusResult;
  'autohand.automode.pause': AutomodeOperationResult;
  'autohand.automode.resume': AutomodeOperationResult;
  'autohand.automode.cancel': AutomodeOperationResult;
  'autohand.automode.getLog': AutomodeGetLogResult;
}

export type SessionControlRpcMethod = keyof SessionControlRpcResultMap;

const sessionControlRpcResultSchemas: {
  readonly [Method in SessionControlRpcMethod]: RuntimeSchema<SessionControlRpcResultMap[Method]>;
} = {
  'autohand.reset': resetResultSchema,
  'autohand.browserHandoff.create': browserHandoffCreateResultSchema,
  'autohand.browserHandoff.attach': browserHandoffAttachResultSchema,
  'autohand.browserHandoff.attachLatest': browserHandoffAttachResultSchema,
  'autohand.automode.start': automodeStartResultSchema,
  'autohand.automode.status': automodeStatusResultSchema,
  'autohand.automode.pause': automodeOperationResultSchema,
  'autohand.automode.resume': automodeOperationResultSchema,
  'autohand.automode.cancel': automodeOperationResultSchema,
  'autohand.automode.getLog': automodeGetLogResultSchema,
};

export class RpcResultValidationError extends Error {
  readonly method: SessionControlRpcMethod;
  readonly path: string;
  readonly expected: string;
  readonly actual: string;

  constructor(
    method: SessionControlRpcMethod,
    path: string,
    expected: string,
    actual: string
  ) {
    super(
      `Invalid RPC result for ${method} at ${path}: `
      + `expected ${expected}, received ${actual}`
    );
    this.name = 'RpcResultValidationError';
    this.method = method;
    this.path = path;
    this.expected = expected;
    this.actual = actual;
  }
}

export function validateSessionControlRpcResult<Method extends SessionControlRpcMethod>(
  method: Method,
  value: unknown
): SessionControlRpcResultMap[Method] {
  const result = sessionControlRpcResultSchemas[method].validate(value, '$');
  if (!result.success) {
    throw new RpcResultValidationError(
      method,
      result.path,
      result.expected,
      result.actual
    );
  }
  return result.value;
}
