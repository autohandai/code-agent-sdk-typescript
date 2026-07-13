/**
 * RPC client behavior tests.
 *
 * These cover the SDK-side protocol mapping without spawning the CLI.
 */

import { describe, it, expect } from 'bun:test';
import { RPCClient } from '../rpc/client.js';
import type { SDKEvent } from '../types/index.js';

type TransportInternals = {
  handleLine(line: string): void;
  request(method: string, params?: unknown): Promise<unknown>;
};

function getTransport(client: RPCClient): TransportInternals {
  return (client as unknown as { transport: TransportInternals }).transport;
}

async function nextEvent(client: RPCClient): Promise<SDKEvent> {
  const result = await client.events().next();
  if (result.done === true) {
    throw new Error('Expected an SDK event');
  }
  return result.value;
}

describe('RPC Client Notification Handling', () => {
  it('maps messageEnd notifications to message_end events', async () => {
    const client = new RPCClient({ debug: false });

    getTransport(client).handleLine(JSON.stringify({
      jsonrpc: '2.0',
      method: 'autohand.messageEnd',
      params: {
        messageId: 'msg_test_123',
        content: 'Test response',
        timestamp: '2026-05-04T00:00:00.000Z',
      },
    }));

    expect(await nextEvent(client)).toEqual({
      type: 'message_end',
      messageId: 'msg_test_123',
      content: 'Test response',
      timestamp: '2026-05-04T00:00:00.000Z',
    });
  });

  it('maps turnEnd notifications to agent_end and turn_end events in order', async () => {
    const client = new RPCClient({ debug: false });

    getTransport(client).handleLine(JSON.stringify({
      jsonrpc: '2.0',
      method: 'autohand.turnEnd',
      params: {
        turnId: 'turn_test_123',
        timestamp: '2026-05-04T00:00:00.000Z',
        tokensUsed: 42,
        tokensUsageStatus: 'actual',
        durationMs: 1250,
        contextPercent: 12,
      },
    }));

    const first = await nextEvent(client);
    const second = await nextEvent(client);

    expect(first.type).toBe('agent_end');
    if (first.type !== 'agent_end') {
      throw new Error(`Expected agent_end, received ${first.type}`);
    }
    expect(first.sessionId).toBe('turn_test_123');
    expect(second).toEqual({
      type: 'turn_end',
      turnId: 'turn_test_123',
      timestamp: '2026-05-04T00:00:00.000Z',
      tokensUsed: 42,
      tokensUsageStatus: 'actual',
      durationMs: 1250,
      contextPercent: 12,
    });
  });

  it('uses the CLI-3 RPC method names for runtime control', async () => {
    const client = new RPCClient({ debug: false });
    const calls: Array<{ method: string; params?: unknown }> = [];
    getTransport(client).request = async (method, params) => {
      calls.push({ method, params });
      return { success: true };
    };

    await client.setPermissionMode('bypassPermissions');
    await client.setPlanMode(true);
    await client.setModel('z-ai/glm-4.5-air:free');
    await client.setMaxThinkingTokens(1000);

    expect(calls).toEqual([
      { method: 'autohand.permissionModeSet', params: { mode: 'bypassPermissions' } },
      { method: 'autohand.planModeSet', params: { enabled: true } },
      { method: 'autohand.modelSet', params: { model: 'z-ai/glm-4.5-air:free' } },
      { method: 'autohand.maxThinkingTokensSet', params: { maxThinkingTokens: 1000 } },
    ]);
  });

  it('normalizes legacy permission decisions before sending RPC', async () => {
    const client = new RPCClient({ debug: false });
    const calls: Array<{ method: string; params?: unknown }> = [];
    getTransport(client).request = async (method, params) => {
      calls.push({ method, params });
      return { success: true };
    };

    await client.permissionResponse({
      requestId: 'perm-1',
      decision: 'allow',
      remember: true,
    });
    await client.permissionResponse({
      requestId: 'perm-2',
      allowed: false,
      remember: true,
    });
    await client.permissionResponse({
      requestId: 'perm-3',
      decision: 'deny_once',
    });

    expect(calls).toEqual([
      {
        method: 'autohand.permissionResponse',
        params: {
          requestId: 'perm-1',
          decision: 'allow_session',
          remember: true,
        },
      },
      {
        method: 'autohand.permissionResponse',
        params: {
          requestId: 'perm-2',
          allowed: false,
          remember: true,
          decision: 'deny_session',
        },
      },
      {
        method: 'autohand.permissionResponse',
        params: {
          requestId: 'perm-3',
          decision: 'deny_once',
        },
      },
    ]);
  });
});
