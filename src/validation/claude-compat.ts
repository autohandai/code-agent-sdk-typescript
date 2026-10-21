import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ClaudeCompatibilityError } from '../errors/claude-compat.js';
import type { Options } from '../compat/claude/types.js';

export async function validateToolArguments<Schema extends z.ZodRawShape>(shape: Schema, value: unknown): Promise<z.output<z.ZodObject<Schema>>> {
  return z.object(shape).parseAsync(value);
}

export function validateChangesBatch(value: unknown): { batchId: string; changeCount: number } {
  const parsed = z.object({ batchId: z.string().min(1), changeCount: z.number().int().nonnegative() }).safeParse(value);
  if (!parsed.success) throw new ClaudeCompatibilityError('The CLI returned an invalid file-change batch', 'AUTOHAND_CLAUDE_PROTOCOL');
  return parsed.data;
}

const stringList = z.array(z.string().min(1));
const externalMcp = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stdio'), command: z.string().min(1), args: stringList.optional(), env: z.record(z.string(), z.string()).optional() }).passthrough(),
  z.object({ type: z.literal('http'), url: z.httpUrl(), headers: z.record(z.string(), z.string()).optional() }).passthrough(),
  z.object({ type: z.literal('sse'), url: z.httpUrl(), headers: z.record(z.string(), z.string()).optional() }).passthrough(),
  z.object({ type: z.literal('sdk'), name: z.string().min(1), instance: z.instanceof(McpServer) }).passthrough(),
]);
const optionsSchema = z.object({
  cwd: z.string().min(1).optional(),
  env: z.record(z.string(), z.string().optional()).optional(),
  apiKey: z.string().min(1).optional(), model: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  permissionMode: z.enum(['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk', 'auto']).optional(),
  allowDangerouslySkipPermissions: z.boolean().optional(),
  allowedTools: stringList.optional(), disallowedTools: stringList.optional(),
  tools: z.union([stringList, z.object({ type: z.literal('preset'), preset: z.literal('claude_code') })]).optional(),
  mcpServers: z.record(z.string().min(1), z.preprocess(value => {
    if (value !== undefined && value !== null && typeof value === 'object' && !('type' in value)) return { ...value, type: 'stdio' };
    return value;
  }, externalMcp)).optional(),
  agents: z.record(z.string().min(1), z.object({ description: z.string().min(1), prompt: z.string().min(1), tools: stringList.optional(), model: z.string().optional() }).passthrough()).optional(),
  resume: z.string().min(1).optional(), continue: z.boolean().optional(), forkSession: z.boolean().optional(),
  sessionId: z.string().min(1).optional(), persistSession: z.boolean().optional(),
  maxTurns: z.number().int().positive().optional(), maxBudgetUsd: z.number().nonnegative().finite().optional(),
  additionalDirectories: stringList.optional(),
  settingSources: z.array(z.enum(['user', 'project', 'local'])).optional(),
}).passthrough();

export function validateClaudeOptions(options: Options): void {
  const result = optionsSchema.safeParse(options);
  if (!result.success) throw new ClaudeCompatibilityError(result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '), 'AUTOHAND_CLAUDE_OPTIONS');
  if (options.resume !== undefined && options.continue === true) throw new ClaudeCompatibilityError('resume and continue cannot be combined');
  if (options.forkSession === true && options.resume === undefined) throw new ClaudeCompatibilityError('forkSession requires an explicit resume session ID');
}

export function validateUserText(message: unknown): string {
  const parsed = z.object({ type: z.literal('user'), message: z.object({ role: z.literal('user'), content: z.union([z.string(), z.array(z.object({ type: z.literal('text'), text: z.string() }))]) }) }).safeParse(message);
  if (!parsed.success) throw new ClaudeCompatibilityError('Streaming input currently supports user text messages only', 'AUTOHAND_CLAUDE_INPUT');
  const content = parsed.data.message.content;
  return typeof content === 'string' ? content : content.map(block => block.text).join('\n');
}
