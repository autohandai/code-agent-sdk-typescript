/**
 * Unit tests for new configuration options
 * Tests for permissions, skills, context, and session configuration
 */

import { describe, it, expect } from 'bun:test';
import { AutohandSDK, Tool } from '../index.js';

describe('SDK Configuration Options', () => {
  it('accepts permissions configuration', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'claude-sonnet-4-20250514',
      permissionMode: 'yolo',
    });

    expect(sdk.config.permissionMode).toBe('yolo');
  });

  it('accepts skills configuration', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'claude-sonnet-4-20250514',
      skills: ['typescript', 'testing'],
    });

    expect(sdk.config.skills).toEqual(['typescript', 'testing']);
  });

  it('accepts context configuration', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'claude-sonnet-4-20250514',
      context: {
        maxTokens: 100000,
        compactThreshold: 0.8,
      },
    });

    expect(sdk.config.context).toBeDefined();
    expect(sdk.config.context?.maxTokens).toBe(100000);
    expect(sdk.config.context?.compactThreshold).toBe(0.8);
  });

  it('accepts session configuration', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'claude-sonnet-4-20250514',
      session: {
        persist: true,
        sessionId: 'test-session-123',
      },
    });

    expect(sdk.config.session).toBeDefined();
    expect(sdk.config.session?.persist).toBe(true);
    expect(sdk.config.session?.sessionId).toBe('test-session-123');
  });

  it('accepts AGENTS.md configuration', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'claude-sonnet-4-20250514',
      agentsMd: {
        enabled: true,
        path: './AGENTS.md',
        createDefault: true,
      },
    });

    expect(sdk.config.agentsMd).toBeDefined();
    expect(sdk.config.agentsMd?.enabled).toBe(true);
    expect(sdk.config.agentsMd?.path).toBe('./AGENTS.md');
    expect(sdk.config.agentsMd?.createDefault).toBe(true);
  });

  it('accepts legacy permission mode configuration', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'claude-sonnet-4-20250514',
      yolo: 'allow:read,write',
    });

    expect(sdk.config.yolo).toBe('allow:read,write');
  });

  it('accepts multiple new configuration options together', () => {
    const sdk = new AutohandSDK({
      cliPath: '/path/to/cli',
      model: 'claude-sonnet-4-20250514',
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

    expect(sdk.config.permissionMode).toBe('ask');
    expect(sdk.config.skills).toEqual(['typescript', 'react']);
    expect(sdk.config.context?.maxTokens).toBe(200000);
    expect(sdk.config.session?.persist).toBe(true);
    expect(sdk.config.agentsMd?.enabled).toBe(true);
  });
});
