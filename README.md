# Code Agent SDK for TypeScript

Autohand Code Agent SDK - CLI wrapper implementation for TypeScript.

## Overview

This SDK provides a TypeScript wrapper around the Autohand CLI binary, enabling programmatic access to Autohand's autonomous coding agent capabilities via JSON-RPC 2.0 protocol.

## Architecture

```
User → TypeScript SDK (thin wrapper) → CLI Subprocess (existing binary) → Provider → HTTP
```

The SDK:
- Spawns the Autohand CLI as a subprocess
- Communicates via JSON-RPC 2.0 over stdin/stdout
- Provides an idiomatic TypeScript API
- Supports streaming events

## Other SDKs

Use the same CLI-backed SDK model from another language:

- [TypeScript](https://github.com/autohandai/code-agent-sdk-typescript) - this package, with `Agent`, `Run`, streaming, and JSON helpers.
- [Go](https://github.com/autohandai/code-agent-sdk-go) - idiomatic Go package with `context.Context`, typed events, and channel-based streaming.
- [Python](https://github.com/autohandai/code-agent-sdk-python) - async Python package with `async for` event streams and typed Pydantic models.
- [Java](https://github.com/autohandai/code-agent-sdk-java) - Java 21 records, sealed events, and virtual-thread-ready APIs.
- [Swift](https://github.com/autohandai/code-agent-sdk-swift) - SwiftPM package with `Agent`, `Runner`, async streams, tools, hooks, and permissions.

## Installation

```bash
npm install @autohandai/agent-sdk
```

## Quick Start

### High-Level API

Use `Agent` for application code. It gives you an explicit run lifecycle while
keeping CLI subprocess and JSON-RPC details out of your app.

```typescript
import { Agent } from '@autohandai/agent-sdk';

const agent = await Agent.create({
  cwd: '.', // Optional: defaults to process.cwd()
  instructions: 'Review code with Staff-level TypeScript judgement.',
  permissionMode: 'interactive',
});

const run = await agent.send('Review this repository for release readiness');

for await (const event of run.stream()) {
  if (event.type === 'message_update') {
    process.stdout.write(event.delta);
  }
}

const result = await run.wait();
console.log(result.text);

await agent.close();
```

For simple one-shot tasks:

```typescript
const result = await agent.run('Summarize the API surface');
```

For JSON output:

```typescript
type ReleaseRisk = {
  summary: string;
  risks: Array<{ title: string; severity: 'low' | 'medium' | 'high' }>;
};

const risk = await agent.runJson<ReleaseRisk>('Assess publish readiness', {
  schemaName: 'ReleaseRisk',
  schema: {
    summary: 'string',
    risks: [{ title: 'string', severity: 'low | medium | high' }],
  },
  validate: (value) => value as ReleaseRisk,
});
```

### Low-Level API

```typescript
import { AutohandSDK } from '@autohandai/agent-sdk';

const sdk = new AutohandSDK({
  cwd: '.', // Optional: defaults to process.cwd()
  debug: true,
});

await sdk.start();

// Send a prompt
await sdk.prompt({
  message: 'Hello, Autohand!',
});

// Stream events
for await (const event of sdk.streamPrompt({
  message: 'Analyze the codebase',
})) {
  console.log(event);
}

await sdk.stop();
```

## Configuration

### SDK Configuration

```typescript
const sdk = new AutohandSDK({
  cwd: '.',                    // Working directory. Omit to use process.cwd()
  cliPath: '/path/to/cli',     // Optional: custom CLI path
  debug: true,                 // Enable debug logging
  timeout: 30000,              // Request timeout in ms
});
```

### CLI Configuration

The SDK uses the CLI's configuration file (`~/.autohand/config.json`). You can configure providers there:

```json
{
  "provider": "openrouter",
  "openrouter": {
    "apiKey": "sk-or-...",
    "model": "openrouter/auto"
  }
}
```

## API Reference

### AutohandSDK

#### `Agent.create(options: AgentOptions): Promise<Agent>`

Create and start a high-level agent session.

```typescript
const agent = await Agent.create({
  cwd: '.',
  instructions: 'Prefer Bun commands and typed SDK APIs.',
});
```

#### `agent.send(input, options?): Promise<Run>`

Create a run without waiting for it to finish.

```typescript
const run = await agent.send('Add tests for permission decisions');

for await (const event of run.stream()) {
  console.log(event.type);
}

const result = await run.wait();
```

#### `agent.run(input, options?): Promise<RunResult>`

Run a prompt to completion.

```typescript
const result = await agent.run('Summarize release risk');
console.log(result.text);
```

#### `agent.runJson<T>(input, options?): Promise<T>`

Ask the agent for JSON, parse the final response, and optionally validate it.
Pass `schema.parse` from Zod or any `(value: unknown) => T` validator.

```typescript
const result = await agent.runJson<{ files: string[] }>('List changed files', {
  schema: { files: ['string'] },
  validate: (value) => value as { files: string[] },
});
```

#### `run.json<T>(options?): Promise<T>`

Parse a completed run result as JSON.

```typescript
const run = await agent.send('Return {"ok": true}');
const data = await run.json<{ ok: boolean }>();
```

#### `constructor(config: SDKConfig)`

Create a new SDK instance.

#### `start(): Promise<void>`

Start the CLI subprocess.

#### `stop(): Promise<void>`

Stop the CLI subprocess.

#### `prompt(params: PromptParams): Promise<void>`

Send a prompt to the agent.

```typescript
await sdk.prompt({
  message: 'Add a dark mode toggle',
  context: {
    files: ['src/settings.ts'],
  },
  thinkingLevel: 'normal',
});
```

#### `streamPrompt(params: PromptParams): AsyncGenerator<SDKEvent>`

Send a prompt and stream events.

```typescript
for await (const event of sdk.streamPrompt({ message: 'Hello' })) {
  console.log(event);
}
```

#### `abort(): Promise<void>`

Abort the current operation.

#### `getState(): Promise<GetStateResult>`

Get the current agent state.

```typescript
const state = await sdk.getState();
console.log(state.status); // 'idle' | 'processing' | 'waiting_permission'
```

#### `getMessages(params?: GetMessagesParams): Promise<GetMessagesResult>`

Get conversation messages.

```typescript
const messages = await sdk.getMessages({ limit: 10 });
```

#### `setSystemPrompt(promptOrPath: string): AutohandSDK`

Replace the entire CLI system prompt before the session starts. The value can be
inline text or a file path, matching `autohand --sys-prompt`.

```typescript
const sdk = new AutohandSDK({ cwd: '.' })
  .setSystemPrompt('./SYSTEM_PROMPT.md');
```

#### `appendSystemPrompt(promptOrPath: string): AutohandSDK`

Append instructions to the default CLI system prompt before the session starts.
This is the recommended option for most SDK integrations.

```typescript
const sdk = new AutohandSDK()
  .appendSystemPrompt('Always run Bun checks before summarizing release readiness.');
```

#### `permissionResponse(params: PermissionResponseParams): Promise<void>`

Respond to a permission request.

```typescript
await sdk.permissionResponse({
  requestId: 'req-123',
  decision: 'allow_session',
});
```

Prefer the ergonomic helpers for application code:

```typescript
await sdk.allowPermission('req-123', 'session');
await sdk.denyPermission('req-456', 'once');
await sdk.suggestPermissionAlternative('req-789', 'Run bun run typecheck first');
```

#### `setPlanMode(enabled: boolean): Promise<void>`

Enable or disable CLI-3 plan mode. Plan mode is separate from permission mode:
it restricts the agent to read-only planning tools until the host disables plan
mode or the plan is accepted by the CLI flow.

```typescript
const sdk = new AutohandSDK({ planMode: true });
await sdk.start();

await sdk.disablePlanMode();
await sdk.enablePlanMode();
```

#### `events(): AsyncGenerator<SDKEvent>`

Subscribe to all events.

```typescript
for await (const event of sdk.events()) {
  console.log(event);
}
```

## Event Types

The SDK emits the following events:

- `agent_start` - Agent started a session
- `agent_end` - Agent ended a session
- `turn_start` - Turn started
- `turn_end` - Turn ended
- `message_start` - Message generation started
- `message_update` - Message content update (streaming)
- `message_end` - Message generation ended
- `tool_start` - Tool execution started
- `tool_update` - Tool output update (streaming)
- `tool_end` - Tool execution ended
- `permission_request` - Permission request from agent
- `error` - Error occurred

## Examples

See the `examples/` directory for more examples:

- `basic-usage.ts` - Basic prompt usage
- `streaming.ts` - Streaming events
- `permission-handling.ts` - Handling permission requests
- `20-sdlc-discovery-plan.ts` - Read-only SDLC discovery and planning
- `21-sdlc-gated-implementation.ts` - Plan first, execute after an explicit gate
- `22-sdlc-release-readiness.ts` - Release-readiness checks with event streaming
- `23-system-prompts.ts` - Replacing or appending the CLI system prompt
- `24-high-level-agent.ts` - Recommended Agent/Run API
- `25-structured-json.ts` - JSON output with optional validation

See also [SDLC workflows](./docs/sdlc-workflows.md).

## CLI Binaries

The SDK includes CLI binaries for all platforms:

- `autohand-macos-arm64` (65MB)
- `autohand-macos-x64` (70MB)
- `autohand-linux-arm64` (101MB)
- `autohand-linux-x64` (108MB)
- `autohand-windows-x64.exe` (123MB)

The SDK automatically detects the correct binary for your platform. You can also specify a custom path:

```typescript
const sdk = new AutohandSDK({
  cliPath: '/path/to/custom/autohand',
});
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Type check
npm run typecheck

# Lint
npm run lint

# Test
npm run test
```

## Architecture Details

### Transport Layer

The transport layer handles subprocess spawning and stdin/stdout communication:

- Spawns CLI with `--mode rpc`
- Uses line reader for JSONL protocol
- Manages process lifecycle
- Handles errors and cleanup

### RPC Client

The RPC client implements JSON-RPC 2.0:

- Sends requests over stdin
- Parses responses from stdout
- Handles notifications
- Manages request/response correlation

### SDK API

The SDK API provides a high-level interface:

- Auto-start/stop management
- Event streaming
- Permission handling
- State management

## Comparison with Library SDK

This is a **CLI wrapper** implementation. The previous library SDK (`@autohandai/agent-sdk-typescript`) was a direct library implementation with in-process provider integration.

**Key differences:**

- **CLI wrapper**: Spawns CLI subprocess, uses JSON-RPC
- **Library**: Direct provider integration, in-process

**Trade-offs:**

- ✅ Full CLI feature set
- ✅ Consistent with CLI behavior
- ✅ Single source of truth
- ❌ Larger package size (65-120MB)
- ❌ Subprocess overhead (~50-200ms)

## License

Apache License 2.0

## Links

- [CLI Repository](https://github.com/autohandai/cli)
- [Documentation](https://autohand.ai/sdk/)
- [Issues](https://github.com/autohandai/code-agent-sdk-typescript/issues)
