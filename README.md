# @autohand/agent-sdk

Autohand Agent SDK - CLI wrapper implementation for TypeScript.

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

## Installation

```bash
npm install @autohand/agent-sdk
```

## Quick Start

```typescript
import { AutohandSDK } from '@autohand/agent-sdk';

const sdk = new AutohandSDK({
  cwd: process.cwd(),
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
  cwd: process.cwd(),           // Working directory
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
    "model": "anthropic/claude-sonnet-4-20250514"
  }
}
```

## API Reference

### AutohandSDK

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

#### `permissionResponse(params: PermissionResponseParams): Promise<void>`

Respond to a permission request.

```typescript
await sdk.permissionResponse({
  requestId: 'req-123',
  decision: 'allow',
  remember: false,
});
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
- [Issues](https://github.com/autohandai/agent-sdk-typescript/issues)
