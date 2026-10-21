import { describe, expect, it } from 'bun:test';
import { RPCClient } from '../rpc/client.js';
import { Agent } from '../sdk/agent.js';
import { AutohandSDK } from '../sdk/index.js';
import type { ProviderName } from '../types/index.js';

const capabilities = { protocolVersion: 2, extensionVersion: '1.0.0', tools: ['browser_navigate'] };

describe('current CLI parity', () => {
  it('negotiates browser capabilities through every public layer', async () => {
    const client = new RPCClient();
    const calls: unknown[] = [];
    const transport = (client as unknown as { transport: { request(method: string, params: unknown): Promise<unknown> } }).transport;
    transport.request = async (method, params) => { calls.push({ method, params }); return { enabled: true, protocolVersion: 2, tools: capabilities.tools }; };
    expect(await client.setBrowserCapabilities(capabilities)).toEqual({ enabled: true, protocolVersion: 2, tools: capabilities.tools });
    expect(calls).toEqual([{ method: 'autohand.browserCapabilities.set', params: capabilities }]);
    const sdk = new AutohandSDK();
    const sdkClient = (sdk as unknown as { client: RPCClient }).client;
    sdkClient.setBrowserCapabilities = (params) => client.setBrowserCapabilities(params);
    (sdk as unknown as { started: boolean }).started = true;
    await sdk.setBrowserCapabilities(capabilities);
    const agent = Agent.fromSDK(sdk);
    await agent.setBrowserCapabilities(capabilities);
    expect(calls).toHaveLength(3);
  });

  it('accepts native Anthropic and extension provider IDs', () => {
    const providers: ProviderName[] = ['anthropic', 'extension:example.provider'];
    for (const provider of providers) {
      const client = new RPCClient({ provider, apiKey: 'provider-key' });
      expect((client as unknown as { transport: { options: { provider: string } } }).transport.options.provider).toBe(provider);
    }
  });
});

describe('saved CLI configuration inheritance', () => {
  it.each(['autohandai', 'openai', 'azure', 'openrouter', 'vertexai'] as const)('allows %s credentials to come from the saved CLI configuration', (provider) => {
    expect(() => new RPCClient({ provider })).not.toThrow();
  });
  it('exposes session state and runtime controls through Agent', async () => {
    const calls: unknown[] = [];
    const sdk = {
      getState: async (params: unknown) => { calls.push(params); return { sessionId: 'persisted-id' }; },
      setMaxThinkingTokens: async (value: unknown) => { calls.push(value); },
      toggleMcpServer: async (name: string, enabled: boolean) => { calls.push({name, enabled}); },
    } as unknown as AutohandSDK;
    const agent = Agent.fromSDK(sdk);
    expect((await agent.getState()).sessionId).toBe('persisted-id');
    await agent.setMaxThinkingTokens(null);
    await agent.toggleMcpServer('files', false);
    expect(calls).toEqual([undefined, null, {name:'files', enabled:false}]);
  });
});
