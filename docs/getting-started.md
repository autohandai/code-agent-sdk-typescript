# Getting Started with the Autohand SDK

The Autohand SDK is a TypeScript wrapper around the Autohand CLI. It spawns the CLI as a subprocess and talks to it over JSON-RPC, giving you a typed, programmatic interface to an autonomous coding agent.

## Prerequisites

You need two things installed before you write any code:

1. The Autohand CLI binary. The SDK ships with prebuilt binaries for macOS, Linux, and Windows, but you can also point to a custom build.
2. A provider API key. The SDK delegates all LLM calls to the CLI, so you configure the provider in the CLI config file (`~/.autohand/config.json`) rather than in the SDK itself.

Example `~/.autohand/config.json`:

```json
{
  "provider": "openrouter",
  "openrouter": {
    "apiKey": "sk-or-...",
    "model": "openrouter/auto"
  }
}
```

## Installation

```bash
npm install @autohandai/agent-sdk
```

If you use Bun:

```bash
bun add @autohandai/agent-sdk
```

## Your First Prompt

Create a file named `first-prompt.ts`:

```typescript
import { AutohandSDK } from '@autohandai/agent-sdk';

async function main() {
  const sdk = new AutohandSDK({
    cwd: '.',           // Project root. Defaults to process.cwd().
    debug: true,        // Prints JSON-RPC traffic to stderr.
  });

  await sdk.start();
  console.log('CLI is running.');

  await sdk.prompt({
    message: 'List the TypeScript files in src/',
  });

  await sdk.stop();
  console.log('Done.');
}

main();
```

Run it:

```bash
bun run first-prompt.ts
```

The SDK will auto-detect the correct CLI binary for your platform, spawn it, send the prompt, and shut it down when you call `stop()`.

## Streaming Events

`prompt()` is fire-and-forget. Most applications want to see what the agent is doing in real time. Use `streamPrompt()` instead:

```typescript
import { AutohandSDK } from '@autohandai/agent-sdk';

async function main() {
  const sdk = new AutohandSDK({ cwd: '.' });
  await sdk.start();

  for await (const event of sdk.streamPrompt({
    message: 'What does index.ts do?',
  })) {
    if (event.type === 'message_update') {
      process.stdout.write(event.delta);
    } else if (event.type === 'tool_start') {
      console.log(`\n[tool: ${event.toolName}]`);
    } else if (event.type === 'tool_end') {
      console.log(`[tool completed: ${event.toolName}]`);
    }
  }

  await sdk.stop();
}

main();
```

The event stream includes message deltas, tool calls, tool outputs, permission requests, and errors. You decide which ones to surface to the user.

## Handling Permissions

By default the CLI asks before running shell commands or making file changes. In `streamPrompt()` these show up as `permission_request` events:

```typescript
for await (const event of sdk.streamPrompt({ message: 'Run the tests' })) {
  if (event.type === 'permission_request') {
    console.log(`\nPermission requested: ${event.tool}`);
    console.log(`Description: ${event.description}`);

    // Approve this request
    await sdk.permissionResponse({
      requestId: event.requestId,
      allowed: true,
    });
  }
}
```

For unattended scripts you can disable interactive permission checks with `permissionMode: 'unrestricted'`, though use that with caution.

## Using the High-Level Agent API

If you do not want to manage the subprocess lifecycle manually, use the `Agent` class:

```typescript
import { Agent } from '@autohandai/agent-sdk';

const agent = await Agent.create({
  cwd: '.',
  instructions: 'Prefer Bun commands and typed SDK APIs.',
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

`Agent.create()` handles `start()` for you. `agent.close()` stops the CLI. A single `Agent` instance can handle multiple sequential runs.

## Next Steps

- See the `examples/` directory for complete, runnable scripts covering streaming, file editing, permission handling, memory management, and SDLC workflows.
- Read `docs/sdlc-workflows.md` for patterns that separate planning from execution.
- Check the README API reference for every method and event type.
