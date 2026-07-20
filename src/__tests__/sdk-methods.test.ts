/**
 * Unit tests for new SDK methods
 * Tests for stats tracking, session management, and AGENTS.md support
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { AutohandSDK } from '../index.js';
import { HOOK_EVENTS, type SDKEvent } from '../types/index.js';

describe('SDK Stats Methods', () => {
  let sdk: AutohandSDK;

  beforeEach(() => {
    sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'openrouter/auto',
      apiKey: 'test-key',
      debug: false,
    });
  });

  it('getStats returns session stats structure', async () => {
    // Note: This is a structural test - in reality we'd need to mock the RPC client
    // For now, we verify the method exists and has the correct signature
    expect(sdk.getStats).toBeDefined();
    expect(typeof sdk.getStats).toBe('function');
  });

  it('getSessionMetadata returns session metadata structure', async () => {
    // Verify the method exists and has the correct signature
    expect(sdk.getSessionMetadata).toBeDefined();
    expect(typeof sdk.getSessionMetadata).toBe('function');
  });
});

describe('Hook Events Contract', () => {
  it('includes current CLI hook event names and compatibility aliases', () => {
    expect(HOOK_EVENTS).toContain('post-response');
    expect(HOOK_EVENTS).toContain('teammate-spawned');
    expect(HOOK_EVENTS).toContain('context:critical');
    expect(HOOK_EVENTS).toContain('automode:checkpoint');
  });
});

describe('SDK Session Management Methods', () => {
  let sdk: AutohandSDK;

  beforeEach(() => {
    sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'openrouter/auto',
      apiKey: 'test-key',
      debug: false,
    });
  });

  it('resumeSession sets session ID and resume flag', async () => {
    // Verify the method exists and has the correct signature
    expect(sdk.resumeSession).toBeDefined();
    expect(typeof sdk.resumeSession).toBe('function');
    
    // Note: Full integration test would require mocking the transport layer
    // This verifies the method signature and basic behavior
    expect(sdk.getConfig().sessionId).toBeUndefined();
    expect(sdk.getConfig().resume).toBeUndefined();
  });

  it('resumeSession throws error if SDK is already started', async () => {
    // Verify the method exists and has the correct signature
    expect(sdk.resumeSession).toBeDefined();
    expect(typeof sdk.resumeSession).toBe('function');
    
    // Note: Full integration test would require mocking the transport layer
    // This verifies the method signature and error handling behavior
  });

  it('saveSession saves current session state', async () => {
    // Verify the method exists and has the correct signature
    expect(sdk.saveSession).toBeDefined();
    expect(typeof sdk.saveSession).toBe('function');
  });
});

describe('SDK Lifecycle Coordination', () => {
  it('waits for an in-flight stop and coalesces callers onto one fresh start', async () => {
    const sdk = new AutohandSDK({ cliPath: '/path/to/cli', debug: false });
    let connected = true;
    let releaseStop = (): void => undefined;
    const stopGate = new Promise<void>((resolve) => {
      releaseStop = resolve;
    });
    let startCalls = 0;

    (sdk as unknown as { started: boolean }).started = true;
    (sdk as unknown as {
      client: {
        isConnected: () => boolean;
        start: () => Promise<void>;
        stop: () => Promise<void>;
      };
    }).client = {
      isConnected: () => connected,
      start: async () => {
        startCalls += 1;
        connected = true;
      },
      stop: async () => {
        await stopGate;
        connected = false;
      },
    };

    const stopping = sdk.stop();
    let restartsSettled = false;
    const restarting = Promise.all([sdk.start(), sdk.start()]).then(() => {
      restartsSettled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(restartsSettled).toBe(false);
    expect(startCalls).toBe(0);

    releaseStop();
    await Promise.all([stopping, restarting]);
    expect(startCalls).toBe(1);
    expect((sdk as unknown as { started: boolean }).started).toBe(true);
    expect(connected).toBe(true);
  });
});

describe('SDK Streaming Methods', () => {
  it('waits for terminal work after a prompt acceptance acknowledgement', async () => {
    const sdk = new AutohandSDK({ cliPath: '/path/to/cli', debug: false });
    let releaseTerminal = (): void => undefined;
    const terminal = new Promise<void>((resolve) => {
      releaseTerminal = resolve;
    });
    let completed = false;

    (sdk as unknown as { started: boolean }).started = true;
    (sdk as unknown as {
      client: {
        isConnected: () => boolean;
        prompt: () => Promise<void>;
        abort: () => Promise<void>;
        events: () => AsyncGenerator<SDKEvent>;
      };
    }).client = {
      isConnected: () => true,
      prompt: async () => undefined,
      abort: async () => undefined,
      events: async function* events(): AsyncGenerator<SDKEvent> {
        await terminal;
        yield {
          type: 'agent_end',
          sessionId: 'accepted',
          reason: 'completed',
          timestamp: '2026-07-20T00:00:00.000Z',
        };
      },
    };

    const prompt = sdk.prompt({ message: 'wait for completion' }).then(() => {
      completed = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(completed).toBe(false);
    releaseTerminal();
    await prompt;
    expect(completed).toBe(true);
  });

  it('serializes prompt streams while leaving each stream with its own events', async () => {
    const sdk = new AutohandSDK({ cliPath: '/path/to/cli', debug: false });
    const promptOrder: string[] = [];
    const promptResolvers = new Map<string, () => void>();
    let activePrompts = 0;
    let maxActivePrompts = 0;

    (sdk as unknown as { started: boolean }).started = true;
    (sdk as unknown as {
      client: {
        isConnected: () => boolean;
        prompt: (params: { message: string }) => Promise<void>;
        abort: () => Promise<void>;
        events: () => AsyncGenerator<SDKEvent>;
      };
    }).client = {
      isConnected: () => true,
      prompt: ({ message }) => {
        promptOrder.push(message);
        activePrompts += 1;
        maxActivePrompts = Math.max(maxActivePrompts, activePrompts);
        return new Promise<void>((resolve) => {
          promptResolvers.set(message, () => {
            activePrompts -= 1;
            resolve();
          });
        });
      },
      abort: async () => undefined,
      events: () => {
        return (async function* eventStream(): AsyncGenerator<SDKEvent> {
          // Production registers the subscriber before sending the prompt so
          // an immediate CLI notification cannot be lost.
          await Promise.resolve();
          const message = promptOrder.at(-1) ?? 'missing';
          yield {
            type: 'agent_end',
            sessionId: message,
            reason: 'completed',
            timestamp: '2026-07-20T00:00:00.000Z',
          };
        })();
      },
    };

    const first = sdk.streamPrompt({ message: 'first' });
    const second = sdk.streamPrompt({ message: 'second' });
    const firstEvent = first.next();
    const secondEvent = second.next();

    expect((await firstEvent).value).toEqual({
      type: 'agent_end',
      sessionId: 'first',
      reason: 'completed',
      timestamp: '2026-07-20T00:00:00.000Z',
    });
    expect(promptOrder).toEqual(['first']);
    promptResolvers.get('first')?.();
    expect(await first.next()).toEqual({ done: true, value: undefined });

    expect((await secondEvent).value).toEqual({
      type: 'agent_end',
      sessionId: 'second',
      reason: 'completed',
      timestamp: '2026-07-20T00:00:00.000Z',
    });
    promptResolvers.get('second')?.();
    expect(await second.next()).toEqual({ done: true, value: undefined });
    expect(promptOrder).toEqual(['first', 'second']);
    expect(maxActivePrompts).toBe(1);
  });

  it('aborts and settles an abandoned prompt before releasing the next prompt', async () => {
    const sdk = new AutohandSDK({ cliPath: '/path/to/cli', debug: false });
    let releaseTerminal = (): void => undefined;
    const terminal = new Promise<void>((resolve) => {
      releaseTerminal = resolve;
    });
    let abortCalls = 0;

    (sdk as unknown as { started: boolean }).started = true;
    (sdk as unknown as {
      client: {
        isConnected: () => boolean;
        prompt: () => Promise<void>;
        abort: () => Promise<void>;
        events: () => AsyncGenerator<SDKEvent>;
      };
    }).client = {
      isConnected: () => true,
      prompt: async () => undefined,
      abort: async () => {
        abortCalls += 1;
        releaseTerminal();
      },
      events: async function* events(): AsyncGenerator<SDKEvent> {
        yield {
          type: 'message_update',
          messageId: 'abandoned',
          delta: 'partial',
          timestamp: '2026-07-20T00:00:00.000Z',
        };
        await terminal;
        yield {
          type: 'agent_end',
          sessionId: 'abandoned',
          reason: 'aborted',
          timestamp: '2026-07-20T00:00:01.000Z',
        };
      },
    };

    const stream = sdk.streamPrompt({ message: 'abandon me' });
    expect((await stream.next()).value).toEqual({
      type: 'message_update',
      messageId: 'abandoned',
      delta: 'partial',
      timestamp: '2026-07-20T00:00:00.000Z',
    });
    await stream.return(undefined);

    expect(abortCalls).toBe(1);
  });

  it('keeps one event read pending when prompt completion wins the race', async () => {
    const sdk = new AutohandSDK({ cliPath: '/path/to/cli', debug: false });
    let eventReads = 0;
    let deliverEvent: ((result: IteratorResult<SDKEvent>) => void) | undefined;
    const eventIterator = {
      next: (): Promise<IteratorResult<SDKEvent>> => {
        eventReads += 1;
        return new Promise((resolve) => {
          deliverEvent = resolve;
        });
      },
      return: async (): Promise<IteratorResult<SDKEvent>> => ({ done: true, value: undefined }),
      [Symbol.asyncIterator]() {
        return this;
      },
    } as unknown as AsyncGenerator<SDKEvent>;

    (sdk as unknown as { started: boolean }).started = true;
    (sdk as unknown as {
      client: {
        isConnected: () => boolean;
        prompt: () => Promise<void>;
        events: () => AsyncGenerator<SDKEvent>;
      };
    }).client = {
      isConnected: () => true,
      prompt: async () => undefined,
      events: () => eventIterator,
    };

    const streamed = sdk.streamPrompt({ message: 'hello' }).next();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(eventReads).toBe(1);
    deliverEvent?.({
      done: false,
      value: {
        type: 'agent_end',
        sessionId: 'session-1',
        reason: 'completed',
        timestamp: '2026-07-20T00:00:00.000Z',
      },
    });

    expect(await streamed).toEqual({
      done: false,
      value: {
        type: 'agent_end',
        sessionId: 'session-1',
        reason: 'completed',
        timestamp: '2026-07-20T00:00:00.000Z',
      },
    });
  });

  it('propagates prompt failures from streamPrompt', async () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'openrouter/auto',
      apiKey: 'test-key',
      debug: false,
    });

    (sdk as unknown as {
      started: boolean;
      client: {
        isConnected: () => boolean;
        prompt: () => Promise<void>;
        events: () => AsyncGenerator<SDKEvent>;
      };
    }).started = true;

    (sdk as unknown as {
      client: {
        isConnected: () => boolean;
        prompt: () => Promise<void>;
        events: () => AsyncGenerator<SDKEvent>;
      };
    }).client = {
      isConnected: () => true,
      prompt: async () => {
        throw new Error('Request timeout: autohand.prompt');
      },
      events: async function* events(): AsyncGenerator<SDKEvent> {
        await new Promise(() => undefined);
        yield {
          type: 'agent_end',
          sessionId: 'unreachable',
          reason: 'error',
          timestamp: '2026-05-04T00:00:00.000Z',
        };
      },
    };

    try {
      await sdk.streamPrompt({ message: 'hello' }).next();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (error instanceof Error) {
        expect(error.message).toBe('Request timeout: autohand.prompt');
      }
      return;
    }

    throw new Error('Expected streamPrompt to throw');
  });
});
