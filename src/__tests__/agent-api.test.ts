import { describe, expect, it } from 'bun:test';
import { Agent, StructuredOutputError, parseJsonText } from '../sdk/agent.js';
import type { SDKEvent } from '../types/index.js';
import { AutohandSDK } from '../sdk/index.js';

function eventStream(events: SDKEvent[]): (params: unknown) => AsyncGenerator<SDKEvent> {
  return async function* streamPrompt(_params: unknown): AsyncGenerator<SDKEvent> {
    for (const event of events) {
      yield event;
    }
  };
}

function createFakeSDK(events: SDKEvent[]): AutohandSDK {
  return {
    streamPrompt: eventStream(events),
    interrupt: async () => undefined,
    close: async () => undefined,
    setPlanMode: async () => undefined,
    enablePlanMode: async () => undefined,
    disablePlanMode: async () => undefined,
    allowPermission: async () => undefined,
    denyPermission: async () => undefined,
    suggestPermissionAlternative: async () => undefined,
    permissionResponse: async () => undefined,
  } as unknown as AutohandSDK;
}

describe('Agent high-level API', () => {
  it('runs a prompt to completion and returns final text with events', async () => {
    const agent = Agent.fromSDK(createFakeSDK([
      {
        type: 'message_update',
        delta: 'Hello',
        timestamp: '2026-05-04T00:00:00.000Z',
      },
      {
        type: 'message_update',
        delta: ', SDK',
        timestamp: '2026-05-04T00:00:01.000Z',
      },
      {
        type: 'agent_end',
        sessionId: 'session-1',
        reason: 'completed',
        timestamp: '2026-05-04T00:00:02.000Z',
      },
    ]));

    const result = await agent.run('Say hello');

    expect(result.status).toBe('completed');
    expect(result.text).toBe('Hello, SDK');
    expect(result.events).toHaveLength(3);
  });

  it('allows streaming first and waiting for the same run result later', async () => {
    const agent = Agent.fromSDK(createFakeSDK([
      {
        type: 'message_update',
        delta: 'Done',
        timestamp: '2026-05-04T00:00:00.000Z',
      },
      {
        type: 'agent_end',
        sessionId: 'session-1',
        reason: 'completed',
        timestamp: '2026-05-04T00:00:01.000Z',
      },
    ]));

    const run = await agent.send('Finish');
    const streamed: SDKEvent[] = [];

    for await (const event of run.stream()) {
      streamed.push(event);
    }

    const result = await run.wait();

    expect(streamed).toHaveLength(2);
    expect(result.text).toBe('Done');
    expect(result.events).toEqual(streamed);
  });

  it('parses run output as JSON with optional validation', async () => {
    const agent = Agent.fromSDK(createFakeSDK([
      {
        type: 'message_end',
        messageId: 'message-1',
        content: '{"status":"ready","score":1}',
        timestamp: '2026-05-04T00:00:00.000Z',
      },
      {
        type: 'agent_end',
        sessionId: 'session-1',
        reason: 'completed',
        timestamp: '2026-05-04T00:00:01.000Z',
      },
    ]));

    const run = await agent.send('Return JSON');
    const parsed = await run.json<{ status: string; score: number }>({
      validate: (value) => {
        if (
          typeof value === 'object'
          && value !== null
          && 'status' in value
          && 'score' in value
          && typeof value.status === 'string'
          && typeof value.score === 'number'
        ) {
          return {
            status: value.status,
            score: value.score,
          };
        }
        throw new Error('Invalid JSON shape');
      },
    });

    expect(parsed).toEqual({ status: 'ready', score: 1 });
  });

  it('parses fenced and embedded JSON responses', () => {
    expect(parseJsonText('```json\n{"ok":true}\n```')).toEqual({ ok: true });
    expect(parseJsonText('Here is the result:\n{"ok":true,"items":[1,2]}\nDone.')).toEqual({
      ok: true,
      items: [1, 2],
    });
  });

  it('includes raw response context when JSON parsing fails', () => {
    try {
      parseJsonText('I cannot produce the requested JSON.');
    } catch (error) {
      expect(error).toBeInstanceOf(StructuredOutputError);
      if (error instanceof StructuredOutputError) {
        expect(error.rawResponse).toBe('I cannot produce the requested JSON.');
        expect(error.message).toContain('Raw response preview');
      }
      return;
    }

    throw new Error('Expected parseJsonText to throw');
  });

  it('adds JSON instructions for runJson', async () => {
    const prompts: unknown[] = [];
    const sdk = {
      streamPrompt: async function* streamPrompt(params: unknown): AsyncGenerator<SDKEvent> {
        prompts.push(params);
        yield {
          type: 'message_end',
          messageId: 'message-1',
          content: '{"tasks":[]}',
          timestamp: '2026-05-04T00:00:00.000Z',
        };
        yield {
          type: 'agent_end',
          sessionId: 'session-1',
          reason: 'completed',
          timestamp: '2026-05-04T00:00:01.000Z',
        };
      },
      interrupt: async () => undefined,
      close: async () => undefined,
    } as unknown as AutohandSDK;
    const agent = Agent.fromSDK(sdk);

    const parsed = await agent.runJson<{ tasks: string[] }>('List hardening tasks', {
      schemaName: 'TaskList',
      schema: { tasks: ['string'] },
    });

    expect(parsed).toEqual({ tasks: [] });
    expect(prompts).toHaveLength(1);
    const firstPrompt = prompts[0] as { message: string };
    expect(firstPrompt.message).toContain('Return only valid JSON.');
    expect(firstPrompt.message).toContain('TaskList');
  });
});
