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
  it('broadcasts each notification to every active subscriber', async () => {
    const client = new RPCClient({ debug: false });
    const first = client.events();
    const second = client.events();
    const firstEvent = first.next();
    const secondEvent = second.next();

    getTransport(client).handleLine(JSON.stringify({
      jsonrpc: '2.0',
      method: 'autohand.messageUpdate',
      params: {
        messageId: 'msg_broadcast',
        delta: 'shared',
        timestamp: '2026-07-20T00:00:00.000Z',
      },
    }));

    expect(await firstEvent).toEqual({
      done: false,
      value: {
        type: 'message_update',
        messageId: 'msg_broadcast',
        delta: 'shared',
        timestamp: '2026-07-20T00:00:00.000Z',
      },
    });
    expect(await secondEvent).toEqual({
      done: false,
      value: {
        type: 'message_update',
        messageId: 'msg_broadcast',
        delta: 'shared',
        timestamp: '2026-07-20T00:00:00.000Z',
      },
    });
    await first.return(undefined);
    await second.return(undefined);
  });

  it('closes blocked event iterators when the client stops', async () => {
    const client = new RPCClient({ debug: false });
    const events = client.events();
    const pending = events.next();

    await client.stop();

    expect(await pending).toEqual({ done: true, value: undefined });
  });

  it('bounds the queue of a slow active event subscriber', async () => {
    const client = new RPCClient({ debug: false });
    const events = client.events();
    const first = events.next();

    const notification = (index: number): void => getTransport(client).handleLine(JSON.stringify({
      jsonrpc: '2.0',
      method: 'autohand.messageUpdate',
      params: {
        messageId: `msg_${index}`,
        delta: String(index),
        timestamp: '2026-07-20T00:00:00.000Z',
      },
    }));

    notification(0);
    await first;
    for (let index = 1; index <= 1_100; index += 1) notification(index);

    const next = await events.next();
    expect(next.done).toBe(false);
    if (next.done === false && next.value.type === 'message_update') {
      expect(next.value.delta).toBe('77');
    }
    await events.return(undefined);
  });

  it('lets prompt-owned subscribers ignore stale backlog without removing public history', async () => {
    const client = new RPCClient({ debug: false });
    getTransport(client).handleLine(JSON.stringify({
      jsonrpc: '2.0',
      method: 'autohand.turnEnd',
      params: {
        turnId: 'stale-turn',
        timestamp: '2026-07-20T00:00:00.000Z',
      },
    }));

    const freshEvents = client.events(undefined, false);
    const freshResult = freshEvents.next();
    getTransport(client).handleLine(JSON.stringify({
      jsonrpc: '2.0',
      method: 'autohand.messageUpdate',
      params: {
        messageId: 'current',
        delta: 'fresh',
        timestamp: '2026-07-20T00:00:01.000Z',
      },
    }));

    expect(await freshResult).toEqual({
      done: false,
      value: {
        type: 'message_update',
        messageId: 'current',
        delta: 'fresh',
        timestamp: '2026-07-20T00:00:01.000Z',
      },
    });
    await freshEvents.return(undefined);

    const historicalEvents = client.events();
    const historical = await historicalEvents.next();
    expect(historical.done).toBe(false);
    if (historical.done === false) {
      expect(historical.value.type).toBe('agent_end');
    }
    await historicalEvents.return(undefined);
  });

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

    const events = client.events();
    const firstResult = await events.next();
    const secondResult = await events.next();
    if (firstResult.done === true || secondResult.done === true) {
      throw new Error('Expected two SDK events');
    }
    const first = firstResult.value;
    const second = secondResult.value;

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
    await events.return(undefined);
  });

  it('maps autoresearch lifecycle notifications to typed SDK events', async () => {
    const client = new RPCClient({ debug: false });

    getTransport(client).handleLine(JSON.stringify({
      jsonrpc: '2.0',
      method: 'autohand.autoresearch.status',
      params: {
        active: true,
        goal: 'Reduce test runtime',
        iteration: 3,
        maxIterations: 12,
        runsLogged: 3,
        statusText: 'Auto-research active',
        subcommand: 'status',
        timestamp: '2026-07-13T00:00:00.000Z',
      },
    }));

    expect(await nextEvent(client)).toEqual({
      type: 'autoresearch',
      phase: 'status',
      active: true,
      goal: 'Reduce test runtime',
      iteration: 3,
      maxIterations: 12,
      runsLogged: 3,
      statusText: 'Auto-research active',
      subcommand: 'status',
      timestamp: '2026-07-13T00:00:00.000Z',
    });
  });

  it('maps autoresearch ledger notifications to typed operation events', async () => {
    const client = new RPCClient({ debug: false });

    getTransport(client).handleLine(JSON.stringify({
      jsonrpc: '2.0',
      method: 'autohand.autoresearch.event',
      params: {
        operation: 'replay',
        phase: 'completed',
        attemptId: 'attempt-1',
        success: true,
        timestamp: '2026-07-15T00:00:00.000Z',
      },
    }));

    expect(await nextEvent(client)).toEqual({
      type: 'autoresearch',
      operation: 'replay',
      phase: 'completed',
      attemptId: 'attempt-1',
      success: true,
      timestamp: '2026-07-15T00:00:00.000Z',
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
