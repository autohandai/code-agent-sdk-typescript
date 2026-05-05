# Configuration

The SDK accepts a single `SDKConfig` object. Every field is optional.

## Basic Options

```typescript
import { AutohandSDK } from '@autohand/agent-sdk';

const sdk = new AutohandSDK({
  cwd: '.',                    // Working directory. Defaults to process.cwd().
  cliPath: '/path/to/cli',    // Custom CLI binary. Auto-detected if omitted.
  debug: true,                // Log JSON-RPC traffic to stderr.
  timeout: 30000,             // Request timeout in milliseconds.
});
```

## Provider Setup

The SDK delegates LLM calls to the CLI, so provider credentials live in `~/.autohand/config.json`:

```json
{
  "provider": "openrouter",
  "openrouter": {
    "apiKey": "sk-or-...",
    "model": "openrouter/auto"
  }
}
```

You can override the model at runtime:

```typescript
await sdk.setModel('openrouter/auto');
```

### Supported Providers

| Provider | Config Key | Notes |
|---|---|---|
| OpenRouter | `openrouter` | Set `apiKey` and optional `model`. |
| OpenAI | `openai` | Set `apiKey` or use `chatgptAccessToken`. |
| Azure | `azure` | Needs `azureAuthMethod`, `azureTenantId`, `azureClientId`, etc. |
| Ollama | `ollama` | Local. Set `port` if not running on 11434. |
| LlamaCPP | `llamacpp` | Local. Set `port`. |
| MLX | `mlx` | Local. Set `port`. |

The SDK auto-detects the provider from the model string when possible. Pass `provider` explicitly if auto-detection fails.

## Loading Config from File

```typescript
import { loadConfigFrom, loadWorkspaceConfig } from '@autohand/agent-sdk';

// JSON, TOML, or YAML
const config = await loadConfigFrom('~/.autohand/config.yaml');
const sdk = new AutohandSDK(config);

// Merges workspace .autohand/config.json with global ~/.autohand/config.json
const merged = await loadWorkspaceConfig('/path/to/project');
```

## Execution Mode

```typescript
const sdk = new AutohandSDK({
  autoMode: true,        // Let the agent run autonomously within limits.
  maxIterations: 10,     // Max auto-mode turns.
  maxRuntime: 30,        // Max runtime in minutes.
  maxCost: 5.0,          // Max API cost in USD.
});
```

## Skills

```typescript
const sdk = new AutohandSDK({
  skills: {
    autoSkill: true,
    skills: ['typescript', 'react', 'testing'],
    sources: ['autohand-user', 'autohand-project', 'community'],
    installMissing: true,
  },
});
```

## Context

```typescript
const sdk = new AutohandSDK({
  context: {
    contextCompact: true,
    maxTokens: 128000,
    compressionThreshold: 0.7,
    summarizationThreshold: 0.9,
  },
});
```

## Session Persistence

```typescript
const sdk = new AutohandSDK({
  session: {
    persistSession: true,
    resume: false,
    sessionPath: './.autohand/sessions',
    autoSaveInterval: 60,
  },
});
```

## System Prompts

```typescript
const sdk = new AutohandSDK({
  systemPrompt: 'You are a careful code reviewer.',
  appendSystemPrompt: 'Always run tests before declaring a task done.',
});
```

Both accept inline strings or file paths. The SDK reads the file before starting the CLI.

## AGENTS.md

```typescript
const sdk = new AutohandSDK({
  agentsMd: {
    enable: true,
    create: true,
    path: './AGENTS.md',
    autoUpdate: true,
    includeTechStack: true,
    includeCommands: true,
    includeSkills: true,
    includeConventions: true,
  },
});
```

## Full Example

```typescript
const sdk = new AutohandSDK({
  cwd: '.',
  model: 'openrouter/auto',
  temperature: 0.7,
  debug: true,
  autoMode: true,
  maxIterations: 10,
  permissionMode: 'interactive',
  skills: {
    autoSkill: true,
    skills: ['typescript'],
  },
  context: {
    contextCompact: true,
    maxTokens: 128000,
  },
  session: {
    persistSession: true,
    sessionPath: './.autohand/sessions',
  },
  appendSystemPrompt: 'Always write tests for new code.',
});
```
