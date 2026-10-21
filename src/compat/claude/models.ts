import { claudeModelAliases } from '@autohandai/agent-compat-data';
import type { ProviderName } from '../../types/index.js';
import { ClaudeCompatibilityError } from '../../errors/claude-compat.js';
import type { Options } from './types.js';

export interface Authentication {
  provider: ProviderName;
  apiKey?: string;
  source: string;
  env: Record<string, string>;
}

export function resolveAuthentication(options: Options, inherited: NodeJS.ProcessEnv = process.env): Authentication {
  const env = Object.fromEntries(Object.entries({ ...inherited, ...options.env })
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const present = (value: string | undefined): string | undefined => (value?.trim().length ?? 0) > 0 ? value : undefined;
  const key = present(options.apiKey) ?? present(env.AUTOHAND_AI_API_KEY) ?? present(env.AUTOHAND_API_KEY);
  const provider = options.provider ?? (key !== undefined ? 'autohandai' : present(env.ANTHROPIC_API_KEY) !== undefined ? 'anthropic' : 'autohandai');
  const providerEnv: Partial<Record<ProviderName, string>> = {
    anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', openrouter: 'OPENROUTER_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY', xai: 'XAI_API_KEY', cerebras: 'CEREBRAS_API_KEY',
    nvidia: 'NVIDIA_API_KEY', zai: 'ZAI_API_KEY', vertexai: 'GOOGLE_API_KEY',
  };
  const source = present(options.apiKey) !== undefined ? 'apiKey' : provider === 'autohandai'
    ? present(env.AUTOHAND_AI_API_KEY) !== undefined ? 'AUTOHAND_AI_API_KEY' : present(env.AUTOHAND_API_KEY) !== undefined ? 'AUTOHAND_API_KEY' : 'account'
    : providerEnv[provider] ?? 'configuration';
  const apiKey = options.apiKey ?? (provider === 'autohandai' ? key : env[source]);
  if (provider === 'autohandai' && apiKey !== undefined) {
    // These are aliases for the same vendor. Foreign provider keys stay separate.
    env.AUTOHAND_AI_API_KEY = apiKey;
    env.AUTOHAND_API_KEY = apiKey;
  }
  return { provider, source, env, ...(apiKey !== undefined ? { apiKey } : {}) };
}

export function resolveModel(model: string | undefined, auth: Authentication): { provider: ProviderName; model: string } {
  const prefixes: Record<string, ProviderName> = { ollama: 'ollama', lmstudio: 'llamacpp', mlx: 'mlx', openai: 'openai', openrouter: 'openrouter', anthropic: 'anthropic' };
  const separator = model?.indexOf(':') ?? -1;
  if (model !== undefined && separator > 0) {
    const provider = prefixes[model.slice(0, separator)];
    if (provider !== undefined) return { provider, model: model.slice(separator + 1) };
  }
  const requested = model ?? (auth.provider === 'anthropic' ? 'sonnet' : auth.provider === 'autohandai' ? 'fantail' : undefined);
  if (requested === undefined || requested.length === 0) throw new ClaudeCompatibilityError(`Specify a model for provider ${auth.provider}`);
  const claude = requested.startsWith('claude-') || Object.hasOwn(claudeModelAliases, requested);
  if (claude && auth.provider === 'autohandai') {
    throw new ClaudeCompatibilityError('Claude models are not in the hosted Autohand catalog. Keep ANTHROPIC_API_KEY for BYOK Claude, or select a hosted model such as fantail.');
  }
  return { provider: auth.provider, model: claudeModelAliases[requested] ?? requested };
}
