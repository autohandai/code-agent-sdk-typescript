import { ProviderConfigError, type FeatureFlagSettings, type ProviderName } from '../types/index.js';

export interface RuntimeSettingsOptions {
  provider?: ProviderName | undefined;
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  model?: string | undefined;
  port?: number | undefined;
  features?: FeatureFlagSettings | undefined;
  runSettings?: Record<string, unknown> | undefined;
  autohandAIPlan?: string | undefined;
  openaiAuthMode?: string | undefined;
  chatgptAccessToken?: string | undefined;
  chatgptAccountId?: string | undefined;
  azureAuthMethod?: string | undefined;
  azureTenantId?: string | undefined;
  azureClientId?: string | undefined;
  azureClientSecret?: string | undefined;
  azureResourceName?: string | undefined;
  azureDeploymentName?: string | undefined;
  azureApiVersion?: string | undefined;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function validateJsonSettings(value: unknown, ancestors = new WeakSet<object>(), depth = 0): void {
  if (depth > 256) throw new ProviderConfigError('Run settings exceed the maximum nesting depth');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object') throw new ProviderConfigError('Run settings must contain JSON values');
  if (ancestors.has(value)) throw new ProviderConfigError('Run settings must not contain cycles');
  const prototype: unknown = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new ProviderConfigError('Run settings must contain only plain JSON objects');
  }
  if (Object.getOwnPropertySymbols(value).length > 0) throw new ProviderConfigError('Run settings must contain JSON keys');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (const item of value) validateJsonSettings(item, ancestors, depth + 1);
    } else {
      for (const [key, item] of Object.entries(value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) {
          throw new ProviderConfigError('Run settings contain an unsafe setting path');
        }
        if (item !== undefined) validateJsonSettings(item, ancestors, depth + 1);
      }
    }
  } finally { ancestors.delete(value); }
}

function cloneJsonSetting(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneJsonSetting);
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    mergeJsonSettings(result, record(value));
    return result;
  }
  return value;
}

function mergeJsonSettings(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const child = record(target[key]);
      mergeJsonSettings(child, record(value));
      target[key] = child;
    } else {
      target[key] = cloneJsonSetting(value);
    }
  }
}

/** Validate and copy each source once; preserve only own JSON properties. */
export function mergeRuntimeSettings(...sources: Record<string, unknown>[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const source of sources) {
    validateJsonSettings(source);
    mergeJsonSettings(result, source);
  }
  return result;
}

/** Build the CLI's private, run-only provider settings before it constructs a runtime. */
export function buildRuntimeSettings(options: RuntimeSettingsOptions): Record<string, unknown> {
  let settings = mergeRuntimeSettings(options.runSettings ?? {});
  if (options.features !== undefined) {
    settings = mergeRuntimeSettings(settings, { features: options.features });
  }
  if (options.provider === undefined) {
    if ([options.apiKey, options.baseUrl, options.port, options.autohandAIPlan,
      options.openaiAuthMode, options.chatgptAccessToken, options.chatgptAccountId,
      options.azureAuthMethod, options.azureTenantId, options.azureClientId,
      options.azureClientSecret, options.azureResourceName, options.azureDeploymentName,
      options.azureApiVersion].some((value) => value !== undefined)) {
      throw new ProviderConfigError('A provider is required for provider credentials and settings');
    }
    return settings;
  }
  const provider = options.provider;
  const section: Record<string, unknown> = {};
  if (options.model !== undefined) section.model = options.model;
  if (options.apiKey !== undefined) {
    section[provider === 'vertexai' ? 'authToken' : 'apiKey'] = options.apiKey;
    if (['autohandai', 'openai', 'xai'].includes(provider)) section.authMode = 'api-key';
    if (provider === 'azure') section.authMethod = 'api-key';
    if (provider === 'bedrock') section.authMode = 'bedrock-api-key';
  }
  if (options.baseUrl !== undefined) {
    const key = ['vertexai', 'bedrock'].includes(provider) ? 'endpoint' : 'baseUrl';
    section[key] = provider === 'vertexai' ? vertexEndpoint(options.baseUrl) : options.baseUrl;
  }
  if (options.port !== undefined && ['ollama', 'llamacpp', 'mlx'].includes(provider)
    && options.baseUrl === undefined) section.baseUrl = 'http://localhost:' + options.port;
  if (provider === 'autohandai') {
    const existing = record(settings.autohandai);
    if (options.autohandAIPlan !== undefined) section.plan = options.autohandAIPlan;
    else if ((options.apiKey !== undefined || options.baseUrl !== undefined) && existing.plan === undefined) {
      section.plan = 'cloud';
    }
  }
  if (provider === 'openai') {
    if (options.openaiAuthMode !== undefined) section.authMode = options.openaiAuthMode;
    if (options.chatgptAccessToken !== undefined) section.chatgptAccessToken = options.chatgptAccessToken;
    if (options.chatgptAccountId !== undefined) section.chatgptAccountId = options.chatgptAccountId;
  }
  if (provider === 'azure') {
    const fields = { authMethod: options.azureAuthMethod, tenantId: options.azureTenantId,
      clientId: options.azureClientId, clientSecret: options.azureClientSecret,
      resourceName: options.azureResourceName, deploymentName: options.azureDeploymentName,
      apiVersion: options.azureApiVersion };
    for (const [key, value] of Object.entries(fields)) if (value !== undefined) section[key] = value;
  }
  if (Object.keys(section).length === 0) return settings;
  const overlay = provider.startsWith('custom:')
    ? { customProviders: { [provider.slice('custom:'.length)]: section } }
    : provider.startsWith('extension:') ? { extensionProviders: { [provider]: section } }
      : { [provider]: section };
  return mergeRuntimeSettings(settings, overlay);
}

function vertexEndpoint(value: string): string {
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== ''
      || url.pathname !== '/' || url.search !== '' || url.hash !== '' || url.port !== '') {
      throw new Error('Invalid origin');
    }
    return url.hostname;
  } catch {
    throw new ProviderConfigError('Vertex endpoint must be an HTTPS origin or hostname');
  }
}

/** Existing hosted-provider environment settings remain compatible with older CLIs. */
export function needsRuntimeSettings(options: RuntimeSettingsOptions): boolean {
  return options.features !== undefined || options.runSettings !== undefined
    || (options.provider !== undefined && options.provider !== 'autohandai'
      && [options.apiKey, options.baseUrl, options.port, options.openaiAuthMode,
        options.chatgptAccessToken, options.chatgptAccountId, options.azureAuthMethod,
        options.azureTenantId, options.azureClientId, options.azureClientSecret,
        options.azureResourceName, options.azureDeploymentName, options.azureApiVersion]
        .some((value) => value !== undefined));
}
