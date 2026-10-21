import type {
  AgentStep,
  AgentStepToolCall,
  AgentStepToolResult,
  StepDecisionResult,
  StepEndEvent,
} from '../types/index.js';
import { RpcResultValidationError } from './session-control-rpc-results.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseToolCall(value: unknown): AgentStepToolCall | undefined {
  if (
    !isRecord(value)
    || typeof value.tool !== 'string'
    || !isRecord(value.args)
    || (value.id !== undefined && typeof value.id !== 'string')
  ) {
    return undefined;
  }

  return {
    ...(value.id === undefined ? {} : { id: value.id }),
    tool: value.tool,
    args: value.args,
  };
}

function parseToolResult(value: unknown): AgentStepToolResult | undefined {
  if (
    !isRecord(value)
    || typeof value.tool !== 'string'
    || typeof value.success !== 'boolean'
    || (value.output !== undefined && typeof value.output !== 'string')
    || (value.error !== undefined && typeof value.error !== 'string')
  ) {
    return undefined;
  }

  return {
    tool: value.tool,
    success: value.success,
    ...(value.output === undefined ? {} : { output: value.output }),
    ...(value.error === undefined ? {} : { error: value.error }),
  };
}

function parseStep(value: unknown): AgentStep | undefined {
  if (
    !isRecord(value)
    || !Number.isInteger(value.stepNumber)
    || (value.stepNumber as number) < 1
    || !Array.isArray(value.toolCalls)
    || !Array.isArray(value.toolResults)
    || (value.thought !== undefined && typeof value.thought !== 'string')
  ) {
    return undefined;
  }

  const toolCalls = value.toolCalls.map(parseToolCall);
  const toolResults = value.toolResults.map(parseToolResult);
  if (
    toolCalls.some((call) => call === undefined)
    || toolResults.some((result) => result === undefined)
  ) {
    return undefined;
  }

  return {
    stepNumber: value.stepNumber as number,
    ...(value.thought === undefined ? {} : { thought: value.thought }),
    toolCalls: toolCalls as AgentStepToolCall[],
    toolResults: toolResults as AgentStepToolResult[],
  };
}

export function parseStepEndEvent(value: unknown): StepEndEvent | undefined {
  if (
    !isRecord(value)
    || typeof value.stepId !== 'string'
    || typeof value.timestamp !== 'string'
  ) {
    return undefined;
  }

  const step = parseStep(value.step);
  if (step === undefined) {
    return undefined;
  }

  return {
    type: 'step_end',
    stepId: value.stepId,
    step,
    timestamp: value.timestamp,
  };
}

export function validateStepDecisionResult(value: unknown): StepDecisionResult {
  if (!isRecord(value)) {
    throw new RpcResultValidationError(
      'autohand.stepDecision',
      'result',
      'object',
      value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
    );
  }
  if (typeof value.success !== 'boolean') {
    throw new RpcResultValidationError(
      'autohand.stepDecision',
      'result.success',
      'boolean',
      value.success === null
        ? 'null'
        : Array.isArray(value.success)
          ? 'array'
          : typeof value.success
    );
  }
  return { success: value.success };
}
