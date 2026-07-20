import { describe, expect, it } from 'bun:test';
import { Agent } from '../sdk/agent.js';
import { AutohandSDK } from '../sdk/index.js';
import { RPCClient } from '../rpc/client.js';

type TransportInternals = {
  request(method: string, params?: unknown): Promise<unknown>;
};

function getTransport(client: RPCClient): TransportInternals {
  return (client as unknown as { transport: TransportInternals }).transport;
}

describe('session control RPCs', () => {
  it('resets the conversation through every public layer', async () => {
    const client = new RPCClient();
    const calls: Array<{ method: string; params?: unknown }> = [];
    getTransport(client).request = async (method, params) => {
      calls.push({ method, params });
      return { sessionId: 'session-reset' };
    };

    await expect(client.reset()).resolves.toEqual({ sessionId: 'session-reset' });
    expect(calls).toEqual([{ method: 'autohand.reset', params: {} }]);

    const sdk = {
      reset: async () => ({ sessionId: 'session-reset' }),
    } as unknown as AutohandSDK;
    const agent = Agent.fromSDK(sdk);
    await expect(agent.reset()).resolves.toEqual({ sessionId: 'session-reset' });
  });

  it('creates a browser handoff through every public layer', async () => {
    const client = new RPCClient();
    const calls: Array<{ method: string; params?: unknown }> = [];
    const handoff = {
      token: 'handoff-token',
      sessionId: 'session-browser',
      workspaceRoot: '/workspace',
      createdAt: '2026-07-20T00:00:00.000Z',
      expiresAt: '2026-07-20T00:10:00.000Z',
      url: 'chrome-extension://extension/sidepanel.html?handoff=handoff-token',
    };
    getTransport(client).request = async (method, params) => {
      calls.push({ method, params });
      return handoff;
    };

    const params = {
      extensionId: 'extension',
      installUrl: 'https://autohand.ai/chrome/installed',
    };
    await expect(client.createBrowserHandoff(params)).resolves.toEqual(handoff);
    expect(calls).toEqual([{
      method: 'autohand.browserHandoff.create',
      params,
    }]);

    const sdk = {
      createBrowserHandoff: async () => handoff,
    } as unknown as AutohandSDK;
    const agent = Agent.fromSDK(sdk);
    await expect(agent.createBrowserHandoff(params)).resolves.toEqual(handoff);
  });
});
