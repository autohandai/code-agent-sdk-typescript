/**
 * Unit tests for new configuration options
 * Tests for permissions, skills, context, and session configuration
 */

import { describe, it, expect } from 'bun:test';
import { AutohandSDK } from '../index.js';
import type { TransportOptions } from '../transport/transport.js';

function getTransportOptions(sdk: AutohandSDK): TransportOptions {
  const client = (sdk as unknown as { client: { transport: { options: TransportOptions } } }).client;
  return client.transport.options;
}

function captureErrorMessage(fn: () => void): string {
  try {
    fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('Expected function to throw');
}

describe('SDK Configuration Options', () => {
  it('accepts permissions configuration', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'openrouter/auto',
      apiKey: 'test-key',
      permissionMode: 'yolo',
    });

    expect(sdk.getConfig().permissionMode).toBe('yolo');
  });

  it('accepts skills configuration', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'openrouter/auto',
      apiKey: 'test-key',
      skills: ['typescript', 'testing', './skills/custom/SKILL.md'],
    });

    expect(sdk.getConfig().skills).toEqual(['typescript', 'testing', './skills/custom/SKILL.md']);
    expect(getTransportOptions(sdk).skills).toEqual(['typescript', 'testing', 'custom']);
    expect(getTransportOptions(sdk).skillFiles).toEqual(['./skills/custom/SKILL.md']);
  });

  it('accepts context configuration', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'openrouter/auto',
      apiKey: 'test-key',
      context: {
        maxTokens: 100000,
        compactThreshold: 0.8,
      },
    });

    const config = sdk.getConfig();
    expect(config.context).toBeDefined();
    expect(config.context?.maxTokens).toBe(100000);
    expect(config.context?.compactThreshold).toBe(0.8);
    expect(getTransportOptions(sdk).compressionThreshold).toBe(0.8);
  });

  it('accepts CLI and SDK system prompt option names', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'openrouter/auto',
      apiKey: 'test-key',
      systemPrompt: 'Replace the system prompt',
      appendSystemPrompt: 'Append domain constraints',
    });

    expect(sdk.getConfig().systemPrompt).toBe('Replace the system prompt');
    expect(sdk.getConfig().appendSystemPrompt).toBe('Append domain constraints');
    expect(getTransportOptions(sdk).sysPrompt).toBe('Replace the system prompt');
    expect(getTransportOptions(sdk).appendSysPrompt).toBe('Append domain constraints');
  });

  it('configures system prompt controls before startup', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'openrouter/auto',
      apiKey: 'test-key',
    });

    const result = sdk
      .setSystemPrompt('./SYSTEM_PROMPT.md')
      .appendSystemPrompt('./SYSTEM_PROMPT_APPEND.md');

    expect(result).toBe(sdk);
    expect(sdk.getConfig().sysPrompt).toBe('./SYSTEM_PROMPT.md');
    expect(sdk.getConfig().appendSysPrompt).toBe('./SYSTEM_PROMPT_APPEND.md');
    expect(getTransportOptions(sdk).sysPrompt).toBe('./SYSTEM_PROMPT.md');
    expect(getTransportOptions(sdk).appendSysPrompt).toBe('./SYSTEM_PROMPT_APPEND.md');
  });

  it('does not allow changing system prompt controls after startup', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'openrouter/auto',
      apiKey: 'test-key',
    });
    (sdk as unknown as { started: boolean }).started = true;

    expect(captureErrorMessage(() => sdk.setSystemPrompt('new prompt'))).toBe('setSystemPrompt must be called before start().');
    expect(captureErrorMessage(() => sdk.appendSystemPrompt('new prompt'))).toBe('appendSystemPrompt must be called before start().');
  });

  it('accepts session configuration', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'openrouter/auto',
      apiKey: 'test-key',
      session: {
        persist: true,
        sessionId: 'test-session-123',
      },
    });

    const config = sdk.getConfig();
    expect(config.session).toBeDefined();
    expect(config.session?.persist).toBe(true);
    expect(config.session?.sessionId).toBe('test-session-123');
    expect(getTransportOptions(sdk).persistSession).toBe(true);
  });

  it('accepts AGENTS.md configuration', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'openrouter/auto',
      apiKey: 'test-key',
      agentsMd: {
        enabled: true,
        path: './AGENTS.md',
        createDefault: true,
      },
    });

    const config = sdk.getConfig();
    expect(config.agentsMd).toBeDefined();
    expect(config.agentsMd?.enabled).toBe(true);
    expect(config.agentsMd?.path).toBe('./AGENTS.md');
    expect(config.agentsMd?.createDefault).toBe(true);
    expect(getTransportOptions(sdk).agentsMdEnable).toBe(true);
    expect(getTransportOptions(sdk).agentsMdCreate).toBe(true);
  });

  it('accepts legacy permission mode configuration', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'openrouter/auto',
      apiKey: 'test-key',
      yolo: 'allow:read,write',
    });

    expect(sdk.getConfig().yolo).toBe('allow:read,write');
  });

  it('accepts plan mode as a first-class session option', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'openrouter/auto',
      apiKey: 'test-key',
      planMode: true,
    });

    expect(sdk.getConfig().planMode).toBe(true);
  });

  it('does not apply default interactive permission mode through RPC after startup', async () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      permissionMode: 'interactive',
    });
    const calls: string[] = [];
    (sdk as unknown as {
      client: {
        start: () => Promise<void>;
        setPermissionMode: (mode: string) => Promise<void>;
        setPlanMode: (enabled: boolean) => Promise<void>;
      };
    }).client = {
      start: async () => {
        calls.push('start');
      },
      setPermissionMode: async (mode) => {
        calls.push(`permission:${mode}`);
      },
      setPlanMode: async (enabled) => {
        calls.push(`plan:${enabled}`);
      },
    };

    await sdk.start();

    expect(calls).toEqual(['start']);
  });

  it('applies non-default permission mode through RPC after startup', async () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      permissionMode: 'restricted',
    });
    const calls: string[] = [];
    (sdk as unknown as {
      client: {
        start: () => Promise<void>;
        setPermissionMode: (mode: string) => Promise<void>;
        setPlanMode: (enabled: boolean) => Promise<void>;
      };
    }).client = {
      start: async () => {
        calls.push('start');
      },
      setPermissionMode: async (mode) => {
        calls.push(`permission:${mode}`);
      },
      setPlanMode: async (enabled) => {
        calls.push(`plan:${enabled}`);
      },
    };

    await sdk.start();

    expect(calls).toEqual(['start', 'permission:restricted']);
  });

  it('maps legacy permissionMode plan to plan mode RPC', async () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      permissionMode: 'plan',
    });
    const calls: string[] = [];
    (sdk as unknown as {
      client: {
        start: () => Promise<void>;
        setPermissionMode: (mode: string) => Promise<void>;
        setPlanMode: (enabled: boolean) => Promise<void>;
      };
    }).client = {
      start: async () => {
        calls.push('start');
      },
      setPermissionMode: async (mode) => {
        calls.push(`permission:${mode}`);
      },
      setPlanMode: async (enabled) => {
        calls.push(`plan:${enabled}`);
      },
    };

    await sdk.start();

    expect(calls).toEqual(['start', 'plan:true']);
  });

  it('accepts multiple new configuration options together', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'openrouter/auto',
      apiKey: 'test-key',
      permissionMode: 'ask',
      skills: ['typescript', 'react'],
      context: {
        maxTokens: 200000,
      },
      session: {
        persist: true,
      },
      agentsMd: {
        enabled: true,
      },
    });

    const config = sdk.getConfig();
    expect(config.permissionMode).toBe('ask');
    expect(config.skills).toEqual(['typescript', 'react']);
    expect(config.context?.maxTokens).toBe(200000);
    expect(config.session?.persist).toBe(true);
    expect(config.agentsMd?.enabled).toBe(true);
  });
});

describe('Provider Configuration Validation', () => {
  it('throws ProviderConfigError when apiKey is missing for cloud provider (openrouter)', () => {
    expect(captureErrorMessage(() => new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'openrouter/auto',
    }))).toBe("apiKey is required for provider 'openrouter'");
  });

  it('throws ProviderConfigError when apiKey is missing for cloud provider (zai)', () => {
    expect(captureErrorMessage(() => new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'z-ai/glm-4.5-air:free',
    }))).toBe("apiKey is required for provider 'zai'");
  });

  it('throws ProviderConfigError when apiKey is empty string for cloud provider', () => {
    expect(captureErrorMessage(() => new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'z-ai/glm-4.5-air:free',
      apiKey: '',
    }))).toBe("apiKey is required for provider 'zai'");
  });

  it('throws ProviderConfigError when apiKey is missing for OpenAI api-key mode', () => {
    expect(captureErrorMessage(() => new AutohandSDK({
      cliPath: '/path/to/cli',
      provider: 'openai',
      model: 'gpt-4',
    }))).toBe("apiKey is required for provider 'openai'");
  });

  it('does not throw when apiKey is provided for cloud provider', () => {
    new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'z-ai/glm-4.5-air:free',
      apiKey: 'valid-key',
    });
  });

  it('does not throw when apiKey is provided for OpenAI', () => {
    new AutohandSDK({
      cliPath: '/path/to/cli',
      provider: 'openai',
      model: 'gpt-4',
      apiKey: 'valid-key',
    });
  });

  it('does not validate apiKey for local providers (ollama)', () => {
    new AutohandSDK({
      cliPath: '/path/to/cli',
      provider: 'ollama',
      model: 'llama2',
    });
  });

  it('does not validate apiKey when no provider is detected', () => {
    new AutohandSDK({
      cliPath: '/path/to/cli',
    });
  });
});
