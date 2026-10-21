import { describe, expect, it } from 'bun:test';
import { ProviderConfigError } from '../types/index.js';
import { Transport } from '../transport/transport.js';
import { buildRuntimeSettings } from '../validation/runtime-settings.js';

describe('provider startup settings', () => {
  it('keeps inference credentials separate from account authentication and off argv', () => {
    expect(buildRuntimeSettings({ provider: 'anthropic', apiKey: 'provider-secret', baseUrl: 'https://models.test', model: 'claude-sonnet' })).toEqual({ anthropic: { apiKey: 'provider-secret', baseUrl: 'https://models.test', model: 'claude-sonnet' } });
  });
  it('preserves explicit false feature flags and existing provider settings', () => {
    expect(buildRuntimeSettings({ provider: 'openai', apiKey: 'new-key', features: { awsBedrockProvider: false }, runSettings: { openai: { headers: { 'x-custom': 'yes' }, model: 'saved' }, features: { slashGoal: true } } })).toEqual({ openai: { headers: { 'x-custom': 'yes' }, model: 'saved', apiKey: 'new-key', authMode: 'api-key' }, features: { slashGoal: true, awsBedrockProvider: false } });
  });
  it('maps custom and extension providers without splitting their IDs', () => {
    expect(buildRuntimeSettings({ provider: 'custom:example.v1', apiKey: 'key' })).toEqual({ customProviders: { 'example.v1': { apiKey: 'key' } } });
    expect(buildRuntimeSettings({ provider: 'extension:example.provider', apiKey: 'key' })).toEqual({ extensionProviders: { 'extension:example.provider': { apiKey: 'key' } } });
  });
  it('retains Autohand cloud settings when enabling its inference feature', () => {
    expect(buildRuntimeSettings({ provider: 'autohandai', apiKey: 'key', model: 'fantail', features: { autohand_inference: true } })).toEqual({ features: { autohand_inference: true }, autohandai: { apiKey: 'key', model: 'fantail', plan: 'cloud', authMode: 'api-key' } });
  });
  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, BigInt(1), () => true, Symbol('value')])('rejects non-JSON values nested inside arrays before spawning a CLI', (value) => {
    expect(() => buildRuntimeSettings({ runSettings: { customProviders: { fixture: { models: [value] } } } }))
      .toThrow(ProviderConfigError);
  });
  it('rejects cyclic and non-plain settings with a structured configuration error', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.loop = cyclic;
    for (const value of [cyclic, new Date(), new Map([['key', 'value']])]) {
      expect(() => buildRuntimeSettings({ runSettings: { customProviders: { fixture: value } } }))
        .toThrow(ProviderConfigError);
    }
  });
  it('rejects unsafe own keys inside arrays without polluting prototypes', () => {
    const item: unknown = JSON.parse('{"__proto__":{"polluted":true}}');
    expect(() => buildRuntimeSettings({ runSettings: { customProviders: { fixture: { models: [item] } } } }))
      .toThrow(ProviderConfigError);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('retains JSON arrays, explicit nulls and shared plain values without mutating input', () => {
    const shared = { name: 'fixture' };
    const settings = { customProviders: { fixture: { models: [shared, shared, null] } } };
    const result = buildRuntimeSettings({ runSettings: settings });
    expect(result).toEqual(settings);
    expect(result).not.toBe(settings);
    expect(settings.customProviders.fixture.models[0]).toBe(shared);
  });

  it('omits undefined object properties while preserving explicit false values', () => {
    expect(buildRuntimeSettings({ runSettings: { features: { slashGoal: false, unset: undefined }, customProviders: { fixture: { models: [{ optional: undefined, name: 'fixture' }] } } } }))
      .toEqual({ features: { slashGoal: false }, customProviders: { fixture: { models: [{ name: 'fixture' }] } } });
  });

  it.each(['autohandai', 'openai', 'xai'] as const)('selects API-key authentication for explicit %s credentials', (provider) => {
    const result = buildRuntimeSettings({ provider, apiKey: 'new-provider-key', runSettings: { [provider]: { authMode: 'account', model: 'saved-model' } } });
    expect(result[provider]).toEqual({ authMode: 'api-key', model: 'saved-model', apiKey: 'new-provider-key', ...(provider === 'autohandai' ? { plan: 'cloud' } : {}) });
  });
  it('keeps saved account authentication and model selection when no override was requested', () => {
    expect(buildRuntimeSettings({ provider: 'autohandai', features: { slashGoal: false } }))
      .toEqual({ features: { slashGoal: false } });
    expect(buildRuntimeSettings({ provider: 'autohandai', model: 'explicit-model', runSettings: { autohandai: { authMode: 'account', orchestration: false } } }))
      .toEqual({ autohandai: { authMode: 'account', orchestration: false, model: 'explicit-model' } });
  });
  it('uses native Azure and Bedrock credential and endpoint fields', () => {
    expect(buildRuntimeSettings({ provider: 'azure', apiKey: 'new-key' }))
      .toEqual({ azure: { apiKey: 'new-key', authMethod: 'api-key' } });
    expect(buildRuntimeSettings({ provider: 'bedrock', apiKey: 'new-key', baseUrl: 'https://gateway.test/v1', runSettings: { bedrock: { apiMode: 'openai-chat' } } }))
      .toEqual({ bedrock: { apiMode: 'openai-chat', apiKey: 'new-key', authMode: 'bedrock-api-key', endpoint: 'https://gateway.test/v1' } });
  });
  it.each(['https://provider.test/', 'provider.test'])('maps Vertex credentials and endpoint %s to native fields', (baseUrl) => {
    expect(buildRuntimeSettings({ provider: 'vertexai', apiKey: 'new-token', baseUrl }))
      .toEqual({ vertexai: { authToken: 'new-token', endpoint: 'provider.test' } });
  });
  it.each(['http://provider.test', 'https://user:password@provider.test', 'https://provider.test/v1', 'https://provider.test/?key=secret'])('rejects invalid Vertex origins without exposing credentials', (baseUrl) => {
    expect(() => buildRuntimeSettings({ provider: 'vertexai', baseUrl })).toThrow(ProviderConfigError);
  });
  it('rejects provider credentials without a provider before CLI discovery', async () => {
    expect(() => buildRuntimeSettings({ apiKey: 'secret' })).toThrow(ProviderConfigError);
    const transport = new Transport({ apiKey: 'secret', cliPath: '/nonexistent/sdk-fixture-cli' });
    await expect(transport.start()).rejects.toBeInstanceOf(ProviderConfigError);
  });

});
