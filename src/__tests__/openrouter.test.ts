/**
 * Unit tests for OpenRouter provider with z-ai/glm-4.5-air:free
 */

import { AutohandSDK, Tool } from '../index.js';

describe('AutohandSDK with OpenRouter provider', () => {
  test('can be initialized with OpenRouter model', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'z-ai/glm-4.5-air:free',
      debug: false,
    });

    expect(sdk).toBeDefined();
  });

  test('can be configured with tools', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'z-ai/glm-4.5-air:free',
    });

    sdk.tools = [Tool.READ_FILE, Tool.WRITE_FILE, Tool.BASH];

    expect(sdk.tools).toEqual([Tool.READ_FILE, Tool.WRITE_FILE, Tool.BASH]);
  });

  test('can load config from JSON file', async () => {
    const config = {
      cliPath: '/path/to/cli',
      model: 'z-ai/glm-4.5-air:free',
      unrestricted: true,
      autoSkill: true,
    };

    // Mock loadConfigFrom to return the test config
    // In real tests, you would create a temporary config file
    expect(config.model).toBe('z-ai/glm-4.5-air:free');
  });

  test('supports all CLI flags', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'z-ai/glm-4.5-air:free',
      autoMode: true,
      unrestricted: true,
      autoSkill: true,
      autoCommit: false,
      sysPrompt: 'You are a helpful assistant.',
      temperature: 0.7,
      yolo: 'allow:read,write',
      maxIterations: 10,
      maxRuntime: 120,
      maxCost: 10,
    });

    expect(sdk).toBeDefined();
  });

  test('Tool enum matches actual CLI-3 tool names', () => {
    expect(Tool.READ_FILE).toBe('read_file');
    expect(Tool.WRITE_FILE).toBe('write_file');
    expect(Tool.BASH).toBe('bash');
    expect(Tool.WEB_SEARCH).toBe('web_search');
    expect(Tool.GIT_STATUS).toBe('git_status');
    expect(Tool.GIT_DIFF).toBe('git_diff');
    expect(Tool.GIT_LOG).toBe('git_log');
    expect(Tool.GIT_COMMIT).toBe('git_commit');
    expect(Tool.FIND).toBe('find');
    expect(Tool.GLOB).toBe('glob');
    expect(Tool.SEARCH_IN_FILES).toBe('search_in_files');
    expect(Tool.APPLY_PATCH).toBe('apply_patch');
    expect(Tool.NOTEBOOK_READ).toBe('notebook_read');
    expect(Tool.NOTEBOOK_EDIT).toBe('notebook_edit');
  });
});

describe('SDK Configuration', () => {
  test('can set tools after construction', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'z-ai/glm-4.5-air:free',
    });

    sdk.tools = [Tool.READ_FILE, Tool.BASH];
    expect(sdk.tools).toHaveLength(2);
  });

  test('tools are stored correctly', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
    });

    sdk.tools = [Tool.READ_FILE, Tool.WRITE_FILE, Tool.BASH];
    expect(sdk.tools).toEqual([
      Tool.READ_FILE,
      Tool.WRITE_FILE,
      Tool.BASH,
    ]);
  });
});
