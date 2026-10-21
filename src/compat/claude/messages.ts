import { randomUUID } from 'node:crypto';
import type { SDKEvent } from '../../types/index.js';
import { ClaudeCompatibilityError } from '../../errors/claude-compat.js';
import type { ContentBlock, SDKAssistantMessage, SDKMessage, SDKResultBase } from './types.js';
import { toClaudeInput, toClaudeTool } from './tools.js';

export interface ReducerContext {
  sessionId: string;
  model: string;
  cwd: string;
  provider?: string;
  includePartialMessages?: boolean;
}

export class MessageReducer {
  private readonly startedAt = Date.now();
  private sessionId: string;
  private model: string;
  private text = '';
  private thinking = '';
  private lastText = '';
  private messageId: string = randomUUID();
  private readonly tools = new Map<string, string>();
  private readonly errors: string[] = [];
  private observedTurns = 0;
  private ended = false;
  readonly permissionDenials: SDKResultBase['permission_denials'] = [];

  constructor(private readonly context: ReducerContext) {
    this.sessionId = context.sessionId;
    this.model = context.model;
  }

  private assistant(content: ContentBlock[], stopReason: string | null): SDKAssistantMessage {
    return {
      type: 'assistant', uuid: randomUUID(), session_id: this.sessionId, parent_tool_use_id: null,
      message: { id: this.messageId, type: 'message', role: 'assistant', model: this.model,
        content, stop_reason: stopReason, stop_sequence: null, usage: null },
    };
  }

  private flush(): SDKMessage[] {
    if (!this.text && !this.thinking) return [];
    const content: ContentBlock[] = [];
    if (this.thinking) content.push({ type: 'thinking', thinking: this.thinking, signature: '' });
    if (this.text) { content.push({ type: 'text', text: this.text }); this.lastText = this.text; }
    this.text = '';
    this.thinking = '';
    return [this.assistant(content, null)];
  }

  push(event: SDKEvent): SDKMessage[] {
    if (this.ended) throw new ClaudeCompatibilityError('Received events after the query result', 'AUTOHAND_CLAUDE_PROTOCOL');
    switch (event.type) {
      case 'agent_start':
        this.sessionId = event.sessionId;
        this.model = event.model;
        return [];
      case 'turn_end':
        this.observedTurns += 1;
        return [];
      case 'message_start':
        this.messageId = event.messageId;
        return [];
      case 'message_update': {
        this.text += event.delta;
        this.thinking += event.thought ?? '';
        if (this.context.includePartialMessages !== true) return [];
        const deltas: SDKMessage[] = [];
        if (event.delta) deltas.push({ type: 'stream_event', uuid: randomUUID(), session_id: this.sessionId, parent_tool_use_id: null,
          event: { type: 'content_block_delta', index: this.thinking ? 1 : 0, delta: { type: 'text_delta', text: event.delta } } });
        if (event.thought !== undefined && event.thought.length > 0) deltas.push({ type: 'stream_event', uuid: randomUUID(), session_id: this.sessionId, parent_tool_use_id: null,
          event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: event.thought } } });
        return deltas;
      }
      case 'message_end':
        this.messageId = event.messageId;
        this.text = event.content || this.text;
        return this.flush();
      case 'tool_start': {
        if (this.tools.has(event.toolId)) throw new ClaudeCompatibilityError(`Duplicate tool call ${event.toolId}`, 'AUTOHAND_CLAUDE_PROTOCOL');
        const before = this.flush();
        this.tools.set(event.toolId, event.toolName);
        const content: ContentBlock[] = [{ type: 'tool_use', id: event.toolId, name: toClaudeTool(event.toolName), input: toClaudeInput(event.toolName, event.args) }];
        return [...before, this.assistant(content, 'tool_use')];
      }
      case 'tool_end':
        if (!this.tools.delete(event.toolId)) throw new ClaudeCompatibilityError(`Unknown tool result ${event.toolId}`, 'AUTOHAND_CLAUDE_PROTOCOL');
        return [{ type: 'user', uuid: randomUUID(), session_id: this.sessionId, parent_tool_use_id: null,
          message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: event.toolId,
            content: event.output ?? event.error ?? '', is_error: !event.success }] } }];
      case 'error':
        if (!event.recoverable) this.errors.push(event.message);
        return [];
      case 'agent_end': {
        const remaining = this.flush();
        this.ended = true;
        if (this.tools.size && event.reason === 'completed') this.errors.push('CLI ended with unfinished tool calls');
        const failed = event.reason !== 'completed' || this.errors.length > 0;
        const base: SDKResultBase = {
          type: 'result', uuid: randomUUID(), session_id: this.sessionId,
          duration_ms: Math.max(0, Date.now() - this.startedAt), duration_api_ms: null,
          is_error: failed, num_turns: null, stop_reason: failed ? null : 'end_turn',
          total_cost_usd: null, usage: null, modelUsage: null, permission_denials: [...this.permissionDenials],
          autohand: { provider: this.context.provider ?? 'autohandai', usageStatus: 'unavailable', observedTurns: this.observedTurns, creditsUsed: null },
        };
        return [...remaining, failed
          ? { ...base, subtype: 'error_during_execution', errors: this.errors.length ? [...this.errors] : [event.reason === 'aborted' ? 'Query interrupted' : 'CLI execution failed'] }
          : { ...base, subtype: 'success', result: this.lastText }];
      }
      default:
        return [];
    }
  }
}
