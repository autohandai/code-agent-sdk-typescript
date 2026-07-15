import { describe, expect, it } from 'bun:test';
import { Agent } from '../sdk/agent.js';
import { AutohandSDK } from '../sdk/index.js';
import { RPCClient } from '../rpc/client.js';
import { buildCliArgs, type TransportOptions } from '../transport/transport.js';
import { HOOK_EVENTS, type SDKEvent } from '../types/index.js';

type TransportInternals = {
  request(method: string, params?: unknown): Promise<unknown>;
};

function getTransport(client: RPCClient): TransportInternals {
  return (client as unknown as { transport: TransportInternals }).transport;
}

function getTransportOptions(sdk: AutohandSDK): TransportOptions {
  return (sdk as unknown as {
    client: { transport: { options: TransportOptions } };
  }).client.transport.options;
}

describe('CLI feature parity', () => {
  it('routes current goal operations through the typed RPC methods', async () => {
    const client = new RPCClient();
    const calls: Array<{ method: string; params?: unknown }> = [];
    getTransport(client).request = async (method, params) => {
      calls.push({ method, params });
      return { ok: true };
    };

    await client.getGoal();
    await client.createGoal({
      objective: 'Ship SDK parity',
      tokenBudget: 10_000,
      timeBudgetSeconds: 3_600,
    });
    await client.updateGoal({ status: 'paused', tokenBudget: null });
    await client.queueGoal({ objective: 'Publish release notes' });
    await client.startQueuedGoal();
    await client.listGoalTemplates();
    await client.clearGoal();

    expect(calls).toEqual([
      { method: 'autohand.goal.get', params: {} },
      {
        method: 'autohand.goal.create',
        params: {
          objective: 'Ship SDK parity',
          token_budget: 10_000,
          time_budget_seconds: 3_600,
        },
      },
      {
        method: 'autohand.goal.update',
        params: { status: 'paused', token_budget: null },
      },
      {
        method: 'autohand.goal.queue',
        params: { objective: 'Publish release notes' },
      },
      { method: 'autohand.goal.startQueued', params: {} },
      { method: 'autohand.goal.listTemplates', params: {} },
      { method: 'autohand.goal.clear', params: {} },
    ]);
  });

  it('routes autoresearch lifecycle operations through typed RPC methods', async () => {
    const client = new RPCClient();
    const calls: Array<{ method: string; params?: unknown }> = [];
    getTransport(client).request = async (method, params) => {
      calls.push({ method, params });
      return { success: true };
    };

    await client.startAutoresearch({
      objective: 'Reduce test runtime',
      metricName: 'total_ms',
      metricUnit: 'ms',
      direction: 'lower',
      measureCommand: 'bun test',
      checksCommand: 'bun run lint',
      maxIterations: 12,
      timeoutMs: 60_000,
      filesInScope: ['src', 'tests'],
      subagents: { ideaGeneration: true },
      secondaryObjectives: [{ name: 'peak_mb', unit: 'MB', direction: 'lower' }],
      constraints: [{ metricName: 'accuracy', operator: '>=', threshold: 0.99 }],
      sampling: { minSamples: 3, maxSamples: 9, confidenceThreshold: 2 },
      retention: { maxArtifactBytes: 50_000_000, maxArtifactAgeDays: 30 },
      environmentAllowlist: ['CI'],
    });
    await client.getAutoresearchStatus();
    await client.stopAutoresearch();

    expect(calls).toEqual([
      {
        method: 'autohand.autoresearch.start',
        params: {
          objective: 'Reduce test runtime',
          metricName: 'total_ms',
          metricUnit: 'ms',
          direction: 'lower',
          measureCommand: 'bun test',
          checksCommand: 'bun run lint',
          maxIterations: 12,
          timeoutMs: 60_000,
          filesInScope: ['src', 'tests'],
          subagents: { ideaGeneration: true },
          secondaryObjectives: [{ name: 'peak_mb', unit: 'MB', direction: 'lower' }],
          constraints: [{ metricName: 'accuracy', operator: '>=', threshold: 0.99 }],
          sampling: { minSamples: 3, maxSamples: 9, confidenceThreshold: 2 },
          retention: { maxArtifactBytes: 50_000_000, maxArtifactAgeDays: 30 },
          environmentAllowlist: ['CI'],
        },
      },
      { method: 'autohand.autoresearch.status', params: {} },
      { method: 'autohand.autoresearch.stop', params: {} },
    ]);
  });

  it('routes replayable autoresearch ledger operations through exact RPC methods', async () => {
    const client = new RPCClient();
    const calls: Array<{ method: string; params?: unknown }> = [];
    getTransport(client).request = async (method, params) => {
      calls.push({ method, params });
      return { success: true };
    };

    await client.getAutoresearchHistory();
    await client.replayAutoresearch({ attemptId: 'attempt-1', evaluator: 'original' });
    await client.rescoreAutoresearch({ attemptId: 'attempt-1' });
    await client.compareAutoresearch({ leftAttemptId: 'attempt-1', rightAttemptId: 'attempt-2' });
    await client.getAutoresearchPareto();
    await client.pinAutoresearch({ attemptId: 'attempt-1', pinned: true });
    await client.pruneAutoresearch({ dryRun: false, yes: true });

    expect(calls).toEqual([
      { method: 'autohand.autoresearch.history', params: {} },
      {
        method: 'autohand.autoresearch.replay',
        params: { attemptId: 'attempt-1', evaluator: 'original' },
      },
      { method: 'autohand.autoresearch.rescore', params: { attemptId: 'attempt-1' } },
      {
        method: 'autohand.autoresearch.compare',
        params: { leftAttemptId: 'attempt-1', rightAttemptId: 'attempt-2' },
      },
      { method: 'autohand.autoresearch.pareto', params: {} },
      {
        method: 'autohand.autoresearch.pin',
        params: { attemptId: 'attempt-1', pinned: true },
      },
      { method: 'autohand.autoresearch.prune', params: { dryRun: false, yes: true } },
    ]);
  });

  it('exposes replayable autoresearch operations through Agent', async () => {
    const calls: Array<{ operation: string; params?: unknown }> = [];
    const sdk = {
      getAutoresearchHistory: async () => {
        calls.push({ operation: 'history' });
        return { success: true, attempts: [] };
      },
      replayAutoresearch: async (params: unknown) => {
        calls.push({ operation: 'replay', params });
        return { success: true };
      },
      rescoreAutoresearch: async (params: unknown) => {
        calls.push({ operation: 'rescore', params });
        return { success: true, decisions: [] };
      },
      compareAutoresearch: async (params: unknown) => {
        calls.push({ operation: 'compare', params });
        return { success: true };
      },
      getAutoresearchPareto: async () => {
        calls.push({ operation: 'pareto' });
        return { success: true, attemptIds: [] };
      },
      pinAutoresearch: async (params: unknown) => {
        calls.push({ operation: 'pin', params });
        return { success: true, attemptId: 'attempt-1', pinned: true };
      },
      pruneAutoresearch: async (params: unknown) => {
        calls.push({ operation: 'prune', params });
        return {
          success: true,
          applied: false,
          candidates: [],
          bytesFreed: 0,
          remainingBytes: 0,
        };
      },
    } as unknown as AutohandSDK;
    const agent = Agent.fromSDK(sdk);

    await agent.getAutoresearchHistory();
    await agent.replayAutoresearch({ attemptId: 'attempt-1' });
    await agent.rescoreAutoresearch({ all: true });
    await agent.compareAutoresearch({ leftAttemptId: 'attempt-1', rightAttemptId: 'attempt-2' });
    await agent.getAutoresearchPareto();
    await agent.pinAutoresearch({ attemptId: 'attempt-1', pinned: true });
    await agent.pruneAutoresearch({ dryRun: true });

    expect(calls).toEqual([
      { operation: 'history' },
      { operation: 'replay', params: { attemptId: 'attempt-1' } },
      { operation: 'rescore', params: { all: true } },
      {
        operation: 'compare',
        params: { leftAttemptId: 'attempt-1', rightAttemptId: 'attempt-2' },
      },
      { operation: 'pareto' },
      { operation: 'pin', params: { attemptId: 'attempt-1', pinned: true } },
      { operation: 'prune', params: { dryRun: true } },
    ]);
  });

  it('uses live RPC command discovery instead of a stale SDK command list', async () => {
    const sdk = new AutohandSDK();
    (sdk as unknown as { started: boolean }).started = true;
    (sdk as unknown as {
      client: { getSupportedCommands(): Promise<unknown> };
    }).client = {
      getSupportedCommands: async () => ({
        commands: ['/deep-research', '/autoresearch', '/goal'],
      }),
    };

    expect(await sdk.supportedCommands()).toEqual([
      '/deep-research',
      '/autoresearch',
      '/goal',
    ]);
    expect(await sdk.supportsCommand('/deep-research')).toBe(true);
    expect(await sdk.supportsCommand('/missing')).toBe(false);
  });

  it('offers high-level helpers for deep research and autoresearch commands', async () => {
    const prompts: string[] = [];
    const sdk = {
      streamPrompt: async function* streamPrompt(params: { message: string }): AsyncGenerator<SDKEvent> {
        prompts.push(params.message);
        yield {
          type: 'agent_end',
          sessionId: 'session-1',
          reason: 'completed',
          timestamp: '2026-07-13T00:00:00.000Z',
        };
      },
      close: async () => undefined,
      interrupt: async () => undefined,
    } as unknown as AutohandSDK;
    const agent = Agent.fromSDK(sdk);

    await (await agent.deepResearch('Hermes self-evolving systems')).wait();
    await (await agent.autoresearch('Improve benchmark accuracy')).wait();

    expect(prompts).toEqual([
      '/deep-research Hermes self-evolving systems',
      '/autoresearch Improve benchmark accuracy',
    ]);
  });

  it('maps post-0.9 CLI startup options to exact arguments', () => {
    const sdk = new AutohandSDK({
      bare: true,
      idleLogout: false,
      fork: 'session-123',
      systemPromptFile: './SYSTEM.md',
      appendSystemPromptFile: './APPEND.md',
      mcpConfig: './mcp.json',
      agents: './agents',
      pluginDir: './plugins',
      displayLanguage: 'en',
    });

    expect(buildCliArgs(getTransportOptions(sdk))).toEqual([
      '--mode', 'rpc',
      '--bare',
      '--no-idle-logout',
      '--fork', 'session-123',
      '--display-language', 'en',
      '--system-prompt-file', './SYSTEM.md',
      '--append-system-prompt-file', './APPEND.md',
      '--mcp-config', './mcp.json',
      '--agents', './agents',
      '--plugin-dir', './plugins',
    ]);
  });

  it('applies feature flags before exposing goal operations', async () => {
    const calls: string[] = [];
    const sdk = new AutohandSDK({ features: { slashGoal: true } });
    (sdk as unknown as {
      client: {
        start(): Promise<void>;
        applyFlagSettings(settings: Record<string, unknown>): Promise<unknown>;
      };
    }).client = {
      start: async () => {
        calls.push('start');
      },
      applyFlagSettings: async (settings) => {
        calls.push(`flags:${JSON.stringify(settings)}`);
        return { success: true };
      },
    };

    await sdk.start();

    expect(calls).toEqual([
      'start',
      'flags:{"features":{"slashGoal":true}}',
    ]);
  });

  it('accepts the current provider identifiers', () => {
    expect(new AutohandSDK({ provider: 'sakana', apiKey: 'test-key' }).getConfig().provider).toBe('sakana');
    expect(new AutohandSDK({ provider: 'bedrock' }).getConfig().provider).toBe('bedrock');
    expect(new AutohandSDK({ provider: 'custom:acme' }).getConfig().provider).toBe('custom:acme');
  });

  it('includes the goal authoring lifecycle hook', () => {
    expect(HOOK_EVENTS).toContain('goal-written:completed');
    expect(HOOK_EVENTS).toContain('autoresearch:decision');
    expect(HOOK_EVENTS).toContain('autoresearch:replay');
    expect(HOOK_EVENTS).toContain('autoresearch:rescore');
    expect(HOOK_EVENTS).toContain('autoresearch:prune');
  });
});
