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

  it('attaches a browser handoff token through every public layer', async () => {
    const client = new RPCClient();
    const calls: Array<{ method: string; params?: unknown }> = [];
    const attached = {
      success: true,
      sessionId: 'session-attached',
      workspaceRoot: '/workspace',
      messageCount: 12,
    };
    getTransport(client).request = async (method, params) => {
      calls.push({ method, params });
      return attached;
    };

    const params = { token: 'handoff-token' };
    await expect(client.attachBrowserHandoff(params)).resolves.toEqual(attached);
    expect(calls).toEqual([{
      method: 'autohand.browserHandoff.attach',
      params,
    }]);

    const sdk = {
      attachBrowserHandoff: async () => attached,
    } as unknown as AutohandSDK;
    const agent = Agent.fromSDK(sdk);
    await expect(agent.attachBrowserHandoff(params)).resolves.toEqual(attached);
  });

  it('attaches the latest browser handoff through every public layer', async () => {
    const client = new RPCClient();
    const calls: Array<{ method: string; params?: unknown }> = [];
    const attached = {
      success: true,
      sessionId: 'session-latest',
      workspaceRoot: '/workspace',
      messageCount: 8,
    };
    getTransport(client).request = async (method, params) => {
      calls.push({ method, params });
      return attached;
    };

    await expect(client.attachLatestBrowserHandoff()).resolves.toEqual(attached);
    expect(calls).toEqual([{
      method: 'autohand.browserHandoff.attachLatest',
      params: {},
    }]);

    const sdk = {
      attachLatestBrowserHandoff: async () => attached,
    } as unknown as AutohandSDK;
    const agent = Agent.fromSDK(sdk);
    await expect(agent.attachLatestBrowserHandoff()).resolves.toEqual(attached);
  });
});

describe('auto-mode control RPCs', () => {
  it('starts auto-mode with the complete CLI parameter contract', async () => {
    const client = new RPCClient();
    const calls: Array<{ method: string; params?: unknown }> = [];
    const started = { success: true, sessionId: 'automode-session' };
    getTransport(client).request = async (method, params) => {
      calls.push({ method, params });
      return started;
    };
    const params = {
      prompt: 'Ship the release',
      maxIterations: 25,
      completionPromise: 'SHIPPED',
      useWorktree: false,
      checkpointInterval: 3,
      maxRuntime: 45,
      maxCost: 8.5,
    };

    await expect(client.startAutomode(params)).resolves.toEqual(started);
    expect(calls).toEqual([{
      method: 'autohand.automode.start',
      params,
    }]);

    const sdk = {
      startAutomode: async () => started,
    } as unknown as AutohandSDK;
    const agent = Agent.fromSDK(sdk);
    await expect(agent.startAutomode(params)).resolves.toEqual(started);
  });

  it('returns the complete auto-mode status contract', async () => {
    const client = new RPCClient();
    const calls: Array<{ method: string; params?: unknown }> = [];
    const status = {
      active: true,
      paused: false,
      state: {
        sessionId: 'automode-session',
        status: 'running' as const,
        currentIteration: 4,
        maxIterations: 25,
        filesCreated: 2,
        filesModified: 7,
        branch: 'automode/session',
        lastCheckpoint: {
          commit: 'abc1234',
          message: 'checkpoint iteration 3',
          timestamp: '2026-07-20T00:03:00.000Z',
        },
      },
    };
    getTransport(client).request = async (method, params) => {
      calls.push({ method, params });
      return status;
    };

    await expect(client.getAutomodeStatus()).resolves.toEqual(status);
    expect(calls).toEqual([{
      method: 'autohand.automode.status',
      params: {},
    }]);

    const sdk = {
      getAutomodeStatus: async () => status,
    } as unknown as AutohandSDK;
    const agent = Agent.fromSDK(sdk);
    await expect(agent.getAutomodeStatus()).resolves.toEqual(status);
  });

  it('pauses auto-mode through every public layer', async () => {
    const client = new RPCClient();
    const calls: Array<{ method: string; params?: unknown }> = [];
    const paused = { success: true };
    getTransport(client).request = async (method, params) => {
      calls.push({ method, params });
      return paused;
    };

    await expect(client.pauseAutomode()).resolves.toEqual(paused);
    expect(calls).toEqual([{
      method: 'autohand.automode.pause',
      params: {},
    }]);

    const sdk = {
      pauseAutomode: async () => paused,
    } as unknown as AutohandSDK;
    const agent = Agent.fromSDK(sdk);
    await expect(agent.pauseAutomode()).resolves.toEqual(paused);
  });
});
