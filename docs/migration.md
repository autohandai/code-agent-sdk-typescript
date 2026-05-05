# Migrating from the Library SDK

The previous `@autohandai/agent-sdk-typescript` was a direct library with in-process LLM provider integration. This SDK is a CLI wrapper that spawns the Autohand CLI as a subprocess and communicates over JSON-RPC.

## Key Differences

| Library SDK | CLI Wrapper SDK |
|---|---|
| Direct provider calls in-process. | Delegates to CLI subprocess. |
| Import providers individually. | Configure provider in `~/.autohand/config.json`. |
| `Agent.run()` returns a string. | `streamPrompt()` yields events; collect text yourself. |
| Built-in tool system. | Tools run inside the CLI; you observe via events. |

## Replacing Agent.run()

Old:

```typescript
import { Agent } from '@autohandai/agent-sdk-typescript';

const agent = new Agent({ provider: openrouter, tools: [...] });
const result = await agent.run('Summarize the API');
console.log(result);
```

New:

```typescript
import { AutohandSDK } from '@autohand/agent-sdk';

const sdk = new AutohandSDK({ cwd: '.' });
await sdk.start();

let text = '';
for await (const event of sdk.streamPrompt({ message: 'Summarize the API' })) {
  if (event.type === 'message_update') {
    text += event.delta;
    process.stdout.write(event.delta);
  }
}

await sdk.stop();
console.log(text);
```

Or use the high-level `Agent` class:

```typescript
import { Agent } from '@autohand/agent-sdk';

const agent = await Agent.create({ cwd: '.' });
const result = await agent.run('Summarize the API');
console.log(result.text);
await agent.close();
```

## Replacing Provider Configuration

Old:

```typescript
import { OpenRouterProvider } from '@autohandai/agent-sdk-typescript/providers';

const provider = new OpenRouterProvider({ apiKey: 'sk-or-...' });
```

New:

Create `~/.autohand/config.json`:

```json
{
  "provider": "openrouter",
  "openrouter": {
    "apiKey": "sk-or-...",
    "model": "openrouter/auto"
  }
}
```

The SDK and CLI read this file automatically.

## Replacing Tool Registration

Old:

```typescript
agent.registerTool({
  name: 'read_file',
  execute: async (path) => fs.readFileSync(path, 'utf-8'),
});
```

New:

The CLI has built-in tools. You do not register them from the SDK. You observe tool calls via events:

```typescript
for await (const event of sdk.streamPrompt({ message: 'Read README.md' })) {
  if (event.type === 'tool_start') {
    console.log(`Tool called: ${event.toolName}`);
  }
}
```

## Replacing Streaming

Old:

```typescript
for await (const token of agent.stream('Hello')) {
  process.stdout.write(token);
}
```

New:

```typescript
for await (const event of sdk.streamPrompt({ message: 'Hello' })) {
  if (event.type === 'message_update') {
    process.stdout.write(event.delta);
  }
}
```

The new API yields structured events, not raw tokens. You handle `message_update`, `tool_start`, `tool_end`, and `permission_request` yourself.

## Replacing Memory

Old:

```typescript
agent.memory.save('preference', 'typescript');
const value = agent.memory.recall('preference');
```

New:

Memory is managed by the CLI. Prompt the agent to save or recall:

```typescript
await sdk.streamPrompt({ message: 'Remember that I prefer TypeScript.' });
await sdk.streamPrompt({ message: 'What language do I prefer? Check memory.' });
```

## Package Name Change

```bash
npm uninstall @autohandai/agent-sdk-typescript
npm install @autohand/agent-sdk
```

## When to Stay on the Library SDK

- You need in-process provider control for custom retries or caching.
- You want to avoid the ~65-120MB CLI binary overhead.
- You run in an environment where spawning subprocesses is restricted.

For all other cases, the CLI wrapper gives you the full feature set of the CLI with zero drift between CLI and SDK behavior.
