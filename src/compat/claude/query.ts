import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { AutohandSDK } from '../../sdk/index.js';
import type { PermissionRequestEvent } from '../../types/index.js';
import { AbortError, ClaudeCompatibilityError } from '../../errors/claude-compat.js';
import { validateChangesBatch, validateUserText } from '../../validation/claude-compat.js';
import { prepareOptions, type PreparedOptions } from './options.js';
import { resolveModel } from './models.js';
import { resolvePermissionMode } from './permissions.js';
import { toClaudeInput, toClaudeTool } from './tools.js';
import { MessageReducer } from './messages.js';
import type { Options, PermissionMode, Query, SDKMessage, SDKSystemMessage, SDKUserMessage } from './types.js';

export function query({ prompt, options = {} }: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options }): Query {
  let prepared: PreparedOptions | undefined;
  let sdk: AutohandSDK | undefined;
  let initialization: SDKSystemMessage | undefined;
  let starting: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  let closed = false;
  let activeMode = options.permissionMode ?? 'default';
  let activePlan = activeMode === 'plan';
  let selectedModel: string | undefined;
  const abortSignal = options.abortController?.signal;
  const lifecycle = new AbortController();
  const denyRecords: Array<{ tool_name: string; tool_use_id: string; tool_input: Record<string, unknown> }> = [];

  async function resumeSession(client: AutohandSDK): Promise<void> {
    if (options.forkSession === true) return;
    let sessionId = options.resume;
    if (options.continue === true) {
      let page = 1;
      const matching: Array<{ sessionId: string; lastActiveAt: string }> = [];
      while (true) {
        const history = await client.getHistory({ page, pageSize: 100 });
        for (const entry of history.sessions) {
          const session = await client.getSession({ sessionId: entry.sessionId });
          if (session.success && resolve(session.workspaceRoot) === resolve(options.cwd ?? process.cwd())) matching.push(entry);
        }
        if (page >= history.totalPages) break;
        page += 1;
      }
      matching.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
      sessionId = matching[0]?.sessionId;
    }
    if (sessionId !== undefined) {
      const attached = await client.attachSession({ sessionId });
      if (!attached.success) throw new ClaudeCompatibilityError(attached.error ?? `Could not resume session ${sessionId}`);
      if (options.model !== undefined && selectedModel !== undefined) await client.setModel(selectedModel);
    }
  }

  async function start(): Promise<void> {
    if (closed || (abortSignal?.aborted === true)) throw new AbortError();
    starting ??= (async () => {
      abortSignal?.addEventListener('abort', onAbort, { once: true });
      prepared = await prepareOptions(options);
      if (closed || (abortSignal?.aborted === true)) { await prepared.cleanup(); throw new AbortError(); }
      selectedModel = prepared.model;
      sdk = new AutohandSDK(prepared.config);
      await sdk.start();
      await resumeSession(sdk);
      const state = await sdk.getState();
      if (state.sessionId === undefined || state.sessionId === null || state.sessionId.length === 0) throw new ClaudeCompatibilityError('The CLI did not provide a session ID', 'AUTOHAND_CLAUDE_PROTOCOL');
      const [tools, mcp] = await Promise.all([sdk.getToolsRegistry(), sdk.listMcpServers()]);
      initialization = {
        type: 'system', subtype: 'init', uuid: randomUUID(), session_id: state.sessionId,
        apiKeySource: prepared.auth.source, claude_code_version: 'autohand-agent-sdk',
        cwd: state.workspace, tools: [...new Set(tools.tools.filter(tool => tool.disabled !== true).map(tool => toClaudeTool(tool.name)))],
        mcp_servers: mcp.servers.map(server => ({ name: server.name, status: server.status })),
        model: state.model, permissionMode: activeMode, slash_commands: [], output_style: 'default',
        skills: [], plugins: [], ...(options.agents ? { agents: Object.keys(options.agents) } : {}),
      };
    })();
    try { await starting; } catch (error) { await dispose(); throw error; }
  }

  function client(): AutohandSDK {
    if (!sdk || closed) throw new ClaudeCompatibilityError('Query is closed');
    return sdk;
  }

  async function dispose(): Promise<void> {
    closed = true;
    lifecycle.abort();
    abortSignal?.removeEventListener('abort', onAbort);
    closing ??= (async () => {
      try { if (sdk) await sdk.close(); }
      finally { await prepared?.cleanup(); }
    })();
    await closing;
  }

  function onAbort(): void {
    // Closing the transport wakes pending iterator reads as well as provider work.
    void dispose().catch(error => { prepared?.warn('abort.cleanup', error instanceof Error ? error.message : 'cleanup failed'); });
  }

  async function permission(event: PermissionRequestEvent): Promise<void> {
    const name = toClaudeTool(event.tool);
    const input = toClaudeInput(event.tool, { ...event.context });
    // Existing CLI requests precede tool_start and have no tool-use identifier.
    // Empty means unavailable; a request ID must not masquerade as a tool-use ID.
    denyRecords.push({ tool_name: name, tool_use_id: '', tool_input: input });
    await client().permissionResponse({ requestId: event.requestId, decision: 'deny_once' });
  }

  async function* prompts(): AsyncGenerator<string> {
    if (typeof prompt === 'string') { yield prompt; return; }
    const input = prompt[Symbol.asyncIterator]();
    try {
      while (true) {
        if (closed || (abortSignal?.aborted === true)) throw new AbortError();
        let onCancelled: (() => void) | undefined;
        const cancelled = new Promise<never>((_resolve, reject) => {
          onCancelled = () => reject(new AbortError());
          lifecycle.signal.addEventListener('abort', onCancelled, { once: true });
        });
        try {
          const next = await Promise.race([input.next(), cancelled]);
          if (next.done === true) return;
          yield validateUserText(next.value);
        } finally {
          if (onCancelled !== undefined) lifecycle.signal.removeEventListener('abort', onCancelled);
        }
      }
    } finally {
      // An application producer may be awaiting work that the SDK cannot cancel.
      // Request its cleanup without letting that producer hold transport shutdown.
      void input.return?.().catch(error => { prepared?.warn('input.cleanup', error instanceof Error ? error.message : 'cleanup failed'); });
    }
  }

  async function* run(): AsyncGenerator<SDKMessage, void, unknown> {
    try {
      await start();
      if (!initialization) throw new ClaudeCompatibilityError('Initialization did not complete');
      yield initialization;
      for await (const text of prompts()) {
        const reducer = new MessageReducer({ sessionId: initialization.session_id, model: selectedModel ?? initialization.model,
          cwd: initialization.cwd, provider: prepared?.auth.provider ?? 'autohandai', includePartialMessages: options.includePartialMessages ?? false });
        for await (const event of client().streamPrompt({ message: text })) {
          if ((abortSignal?.aborted === true)) throw new AbortError();
          if (event.type === 'unknown_notification' && event.method === 'autohand.changesBatchEnd') {
            const batch = validateChangesBatch(event.params);
            if (batch.changeCount > 0) {
              if (activePlan) {
                await client().decideChanges({ batchId: batch.batchId, action: 'reject_all' });
                throw new ClaudeCompatibilityError('The CLI staged file changes in plan mode; the batch was rejected');
              }
              // ToolManager authorizes each mutation before it enters this batch.
              // Claude query semantics commit those authorized mutations to disk.
              const applied = await client().decideChanges({ batchId: batch.batchId, action: 'accept_all' });
              if (!applied.success || applied.appliedCount !== batch.changeCount || applied.skippedCount > 0) {
                throw new ClaudeCompatibilityError('The CLI could not apply every authorized file change');
              }
            }
            continue;
          }
          if (event.type === 'permission_request') { await permission(event); continue; }
          reducer.permissionDenials.splice(0, reducer.permissionDenials.length, ...denyRecords);
          for (const message of reducer.push(event)) yield message;
        }
        if ((abortSignal?.aborted === true)) throw new AbortError();
      }
    } catch (error) {
      if ((abortSignal?.aborted === true)) throw new AbortError();
      throw error;
    } finally { await dispose(); }
  }

  const iterator = run();
  const controls = {
    async interrupt(): Promise<void> { await start(); await client().interrupt(); },
    async setModel(model?: string): Promise<void> {
      await start();
      if (!prepared) throw new ClaudeCompatibilityError('Query is not initialized');
      const selected = resolveModel(model, prepared.auth);
      if (selected.provider !== prepared.auth.provider) throw new ClaudeCompatibilityError('Switching providers within a session requires a newer CLI; start a new query with the desired model');
      await client().setModel(selected.model);
      const state = await client().getState();
      if (state.model !== selected.model) throw new ClaudeCompatibilityError('The CLI did not apply the selected model');
      selectedModel = selected.model;
      if (initialization) initialization.model = selected.model;
    },
    async setPermissionMode(mode: PermissionMode): Promise<void> {
      await start();
      const mapped = resolvePermissionMode(mode, options.allowDangerouslySkipPermissions);
      if (activePlan !== mapped.planMode) await client().setPlanMode(mapped.planMode);
      await client().setPermissionMode(mapped.mode);
      activePlan = mapped.planMode; activeMode = mode;
      if (initialization) initialization.permissionMode = mode;
    },
    async initializationResult(): Promise<SDKSystemMessage> {
      await start();
      if (!initialization) throw new ClaudeCompatibilityError('Initialization did not complete');
      return initialization;
    },
    async supportedCommands(): Promise<Array<{ name: string; description: string; argumentHint: string }>> {
      await start(); return (await client().supportedCommands()).map(name => ({ name: name.replace(/^\//, ''), description: '', argumentHint: '' }));
    },
    async mcpServerStatus(): Promise<Array<{ name: string; status: string }>> {
      await start(); return (await client().listMcpServers()).servers.map(server => ({ name: server.name, status: server.status }));
    },
    async close(): Promise<void> {
      await dispose();
      // Preparation may have been in flight before a control started the iterator.
      // Its failure is delivered to that control; close still waits for cleanup.
      await starting?.catch(() => {});
      await iterator.return();
    },
  };
  return Object.assign(iterator, controls);
}
