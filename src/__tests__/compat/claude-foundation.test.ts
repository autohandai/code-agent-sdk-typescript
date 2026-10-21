import { describe, expect, it } from 'bun:test';
import { resolveAuthentication, resolveModel } from '../../compat/claude/models.js';
import { resolvePermissionMode } from '../../compat/claude/permissions.js';
import { toClaudeTool, toNativeToolPatterns, toClaudeInput } from '../../compat/claude/tools.js';
import { MessageReducer } from '../../compat/claude/messages.js';

const stamp = '2026-10-21T00:00:00.000Z';

describe('Claude compatibility foundation', () => {
  it('honors scoped env and the canonical/alias Autohand key without mutating process env', () => {
    const env = { AUTOHAND_AI_API_KEY: 'canonical', AUTOHAND_API_KEY: 'alias', ANTHROPIC_API_KEY: 'byok' };
    expect(resolveAuthentication({ env: { AUTOHAND_AI_API_KEY: 'scoped' } }, env)).toMatchObject({ provider: 'autohandai', apiKey: 'scoped', source: 'AUTOHAND_AI_API_KEY' });
    expect(resolveAuthentication({}, env).apiKey).toBe('canonical');
    expect(resolveAuthentication({}, { AUTOHAND_API_KEY: 'alias' }).apiKey).toBe('alias');
    expect(env.AUTOHAND_AI_API_KEY).toBe('canonical');
  });

  it('selects native Anthropic for BYOK and refuses to invent hosted Claude routes', () => {
    const auth = resolveAuthentication({}, { ANTHROPIC_API_KEY: 'byok' });
    expect(auth.provider).toBe('anthropic');
    expect(resolveModel('sonnet', auth).model).toBe('claude-sonnet-5');
    expect(resolveModel('claude-haiku-4-5', auth).model).toBe('claude-haiku-4-5');
    const hosted = resolveAuthentication({}, { AUTOHAND_AI_API_KEY: 'cloud' });
    expect(resolveModel(undefined, hosted)).toMatchObject({ provider: 'autohandai', model: 'fantail' });
    expect(() => resolveModel('opus', hosted)).toThrow(/Claude.*hosted|hosted.*Claude/);
  });

  it('supports explicit local and other provider model identifiers', () => {
    const auth = resolveAuthentication({ provider: 'ollama' }, {});
    expect(resolveModel('ollama:qwen3-coder', auth)).toMatchObject({ provider: 'ollama', model: 'qwen3-coder' });
    expect(resolveModel('fantail', resolveAuthentication({}, { AUTOHAND_API_KEY: 'cloud' }))).toMatchObject({ provider: 'autohandai', model: 'fantail' });
  });

  it('requires explicit dangerous-skip consent and treats plan as a separate guard', () => {
    expect(() => resolvePermissionMode('bypassPermissions', false)).toThrow(/allowDangerouslySkipPermissions/);
    expect(resolvePermissionMode('bypassPermissions', true)).toEqual({ mode: 'unrestricted', planMode: false });
    expect(resolvePermissionMode('plan', false)).toEqual({ mode: 'interactive', planMode: true });
    expect(() => resolvePermissionMode('acceptEdits', false)).toThrow(/requested-tool/);
  });

  it('maps every native edit alias and preserves MCP names and command patterns', () => {
    expect(toClaudeTool('run_command')).toBe('Bash');
    expect(toClaudeTool('apply_patch')).toBe('Edit');
    expect(toClaudeTool('mcp__db__query')).toBe('mcp__db__query');
    expect(toNativeToolPatterns('Edit')).toContain('search_replace');
    expect(toNativeToolPatterns('Edit')).toContain('apply_patch');
    expect(toNativeToolPatterns('Bash(npm test:*)')).toEqual(['run_command(npm test:*)', 'shell(npm test:*)']);
    expect(toClaudeInput('write_file', { path: 'x.ts', contents: 'hello' })).toMatchObject({ file_path: 'x.ts', content: 'hello' });
  });

  it('reduces ordered text/tool events without repeating completed text', () => {
    const reducer = new MessageReducer({ sessionId: 'session-1', model: 'fantail', cwd: '/project' });
    expect(reducer.push({ type: 'message_start', messageId: 'message-1', role: 'assistant', timestamp: stamp })).toEqual([]);
    expect(reducer.push({ type: 'message_update', messageId: 'message-1', delta: 'Hello', timestamp: stamp })).toEqual([]);
    const text = reducer.push({ type: 'message_end', messageId: 'message-1', content: 'Hello', timestamp: stamp });
    expect(text).toMatchObject([{ type: 'assistant', session_id: 'session-1', message: { content: [{ type: 'text', text: 'Hello' }] } }]);
    expect(reducer.push({ type: 'tool_start', toolId: 'tool-1', toolName: 'read_file', args: { path: 'README.md' }, timestamp: stamp })).toMatchObject([{ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: 'README.md' } }] } }]);
    expect(reducer.push({ type: 'tool_end', toolId: 'tool-1', toolName: 'read_file', success: true, output: 'contents', timestamp: stamp })).toMatchObject([{ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'contents', is_error: false }] } }]);
    const result = reducer.push({ type: 'agent_end', sessionId: 'session-1', reason: 'completed', timestamp: stamp });
    expect(result).toMatchObject([{ type: 'result', subtype: 'success', result: 'Hello', total_cost_usd: null, autohand: { usageStatus: 'unavailable' } }]);
  });

  it('emits partial messages only when requested and rejects unmatched tool results', () => {
    const reducer = new MessageReducer({ sessionId: 'session-1', model: 'fantail', cwd: '/project', includePartialMessages: true });
    expect(reducer.push({ type: 'message_update', messageId: 'message-1', delta: 'Hi', timestamp: stamp })).toMatchObject([{ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } } }]);
    expect(() => reducer.push({ type: 'tool_end', toolId: 'missing', toolName: 'read_file', success: true, timestamp: stamp })).toThrow(/unmatched|Unknown tool/);
  });

  it('retains failure outcomes and never reports aborted execution as success', () => {
    const reducer = new MessageReducer({ sessionId: 'session-1', model: 'fantail', cwd: '/project' });
    reducer.push({ type: 'error', code: 1, message: 'Provider unavailable', recoverable: false, timestamp: stamp });
    expect(reducer.push({ type: 'agent_end', sessionId: 'session-1', reason: 'error', timestamp: stamp })).toMatchObject([{ type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['Provider unavailable'] }]);
  });
});
