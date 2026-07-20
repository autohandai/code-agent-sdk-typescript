# Code Agent SDK for TypeScript

Autohand Code Agent SDK - CLI wrapper implementation for TypeScript.

**Beta:** this SDK is actively evolving while the Agent SDK APIs stabilize. Pin versions in production and review release notes before upgrading.

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
- Exposes typed skill-registry and MCP inspection APIs
- Enforces a reproducible p95 startup budget below 50 ms

See [reliability and startup performance](docs/reliability-and-performance.md) for the benchmark contract and the transport fixes included in the current release.

## Other Programming Languages (Beta)

The Agent SDK is available in multiple beta language packages. Use the same CLI-backed SDK model from another programming language:

- [TypeScript](https://github.com/autohandai/code-agent-sdk-typescript) - this package, with `Agent`, `Run`, streaming, and JSON helpers.
- [Go](https://github.com/autohandai/code-agent-sdk-go) - idiomatic Go package with `context.Context`, typed events, and channel-based streaming.
- [Python](https://github.com/autohandai/code-agent-sdk-python) - async Python package with `async for` event streams and typed Pydantic models.
- [Java](https://github.com/autohandai/code-agent-sdk-java) - Java 21 records, sealed events, and virtual-thread-ready APIs.
- [Swift](https://github.com/autohandai/code-agent-sdk-swift) - SwiftPM package with `Agent`, `Runner`, async streams, tools, hooks, and permissions.
- [Rust](https://github.com/autohandai/code-agent-sdk-rust) - async Rust crate with Tokio, typed events, and stream-based runs.
- [C++](https://github.com/autohandai/code-agent-sdk-cpp) - modern C++20 package with CMake targets and typed event callbacks.
- [C#](https://github.com/autohandai/code-agent-sdk-csharp) - .NET package with `IAsyncEnumerable`, `CancellationToken`, and `System.Text.Json`.

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

Run CLI feature commands through the same streamed run lifecycle:

```typescript
const research = await agent.deepResearch('Hermes self-evolving systems');
for await (const event of research.stream()) {
  console.log(event.type);
}
await research.wait();

if (await agent.supportsCommand('/autoresearch')) {
  await (await agent.autoresearch('Improve benchmark accuracy')).wait();
}

const measureScript = [
  'set -euo pipefail',
  'started="$(bun -e \'process.stdout.write(String(Date.now()))\')"',
  'bun run test',
  'finished="$(bun -e \'process.stdout.write(String(Date.now()))\')"',
  'printf \'METRIC test_ms=%s\\n\' "$((finished - started))"',
].join('\n');

const started = await agent.startAutoresearch({
  objective: 'Reduce test runtime',
  metricName: 'test_ms',
  metricUnit: 'ms',
  direction: 'lower',
  measureScript,
  checksCommand: 'bun run typecheck && bun run lint',
  maxIterations: 3,
  filesInScope: ['src', 'tests'],
  sampling: { minSamples: 3, maxSamples: 9, confidenceThreshold: 2 },
});

if (!started.success || !started.instruction) {
  throw new Error(started.error ?? 'Autoresearch could not start.');
}

const experiment = await agent.send(started.instruction);
for await (const event of experiment.stream()) {
  if (event.type === 'message_update') process.stdout.write(event.delta);
}
await experiment.wait();

const status = await agent.getAutoresearchStatus();
const history = await agent.getAutoresearchHistory();
const candidate = history.attempts.find((attempt) =>
  attempt.replayable && attempt.materialization !== 'baseline'
);
if (candidate) {
  await agent.replayAutoresearch({
    attemptId: candidate.attemptId,
    evaluator: 'original',
  });
  await agent.rescoreAutoresearch({ attemptId: candidate.attemptId });
  await agent.pinAutoresearch({ attemptId: candidate.attemptId, pinned: true });
}
const pareto = await agent.getAutoresearchPareto();
await agent.pruneAutoresearch({ dryRun: true });
await agent.stopAutoresearch();
```

`agent.command('/name', args)` supports any slash command reported by the
connected CLI. `/deep-research` and `/autoresearch` are available in the current
CLI. Use `supportsCommand()` when supporting older CLI versions. The typed
autoresearch methods use JSON-RPC and expose persisted state, adaptive benchmark
configuration, replayable history, rescoring, comparison, Pareto analysis,
pinning, retention previews, and typed lifecycle and ledger-operation events.
Pruning previews by default; pass `{ yes: true }` only when artifact deletion is
intentional.

Read the [replayable autoresearch guide](./docs/autoresearch.md) for the metric
contract, clean-Git requirements, adaptive decisions, replay drift, and retention
safety. The complete runnable program is
[`examples/27-autoresearch-ledger.ts`](./examples/27-autoresearch-ledger.ts).

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
  bare: false,                 // Optional minimal explicit runtime
  idleLogout: false,           // Keep long-running SDK sessions alive
  features: {
    slashGoal: true,           // Enable typed persistent-goal RPC methods
  },
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

#### `agent.command(command, args?, options?): Promise<Run>`

Execute a CLI slash command with normal SDK event streaming. Convenience
helpers are available for `deepResearch(topic)` and `autoresearch(objective)`.

```typescript
const run = await agent.command('/deep-research', 'TypeScript RPC reliability');
const result = await run.wait();
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

#### `streamCommand(command, args?): AsyncGenerator<SDKEvent>`

Execute a registered CLI slash command and stream its events. Use
`supportedCommands()` or `supportsCommand('/command')` for capability checks.

#### Persistent goal methods

The SDK exposes the CLI's typed goal RPC surface:

- `getGoal()`
- `createGoal(params)`
- `updateGoal(params)`
- `clearGoal()`
- `queueGoal(params)`
- `startQueuedGoal()`
- `listGoalTemplates()`

Enable the CLI experiment when creating the SDK:

```typescript
const agent = await Agent.create({
  features: { slashGoal: true },
});

await agent.createGoal({
  objective: 'Finish the SDK parity upgrade with passing validation',
  tokenBudget: 20_000,
});
```

#### `abort(): Promise<void>`

Abort the current operation.

#### `reset(): Promise<ResetResult>`

Clear the current conversation and start a fresh CLI session. The returned
`sessionId` identifies the new session.

```typescript
const { sessionId } = await agent.reset();
```

#### `createBrowserHandoff(params?): Promise<BrowserHandoffCreateResult>`

Create a ten-minute, one-time handoff for the active session. Pass an extension
ID to receive a Chrome extension URL, or an install URL for a web handoff.

```typescript
const handoff = await agent.createBrowserHandoff({
  extensionId: 'your-extension-id',
});
console.log(handoff.url);
```

#### `attachBrowserHandoff(params): Promise<BrowserHandoffAttachResult>`

Consume a one-time handoff token and attach the referenced CLI session.

```typescript
const attached = await agent.attachBrowserHandoff({ token: handoff.token });
```

#### `attachLatestBrowserHandoff(): Promise<BrowserHandoffAttachResult>`

Attach the newest unexpired handoff when a token is not available.

```typescript
const attached = await agent.attachLatestBrowserHandoff();
```

#### `startAutomode(params): Promise<AutomodeStartResult>`

Start an autonomous run and return as soon as CLI-3 accepts the session. The
result reports the auto-mode session ID; completion continues asynchronously.

```typescript
const started = await agent.startAutomode({
  prompt: 'Implement and verify the release checklist',
  maxIterations: 25,
  useWorktree: true,
});
```

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

#### Skill registry and MCP discovery

The low-level SDK and `Agent` expose the same typed discovery operations as the
current CLI:

```typescript
const registry = await sdk.getSkillsRegistry({ forceRefresh: true });
await sdk.installSkill({
  skillName: 'release-readiness',
  scope: 'project', // or 'user'
  force: false,
});

const servers = await sdk.listMcpServers();
const tools = await sdk.listMcpTools({ serverName: 'filesystem' });
const configs = await sdk.getMcpServerConfigs();
```

Omit `serverName` to list tools across all servers. Registry installation
returns the CLI's installed path and status; MCP configuration results preserve
stdio and remote transport fields.

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
- `autoresearch` - Autoresearch lifecycle or typed ledger-operation event
- `error` - Error occurred

`turn_end` includes provider-reported `tokensUsed`, `tokensUsageStatus`,
`durationMs`, and `contextPercent` when the CLI supplies them.

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
- `26-runtime-error-to-pr.ts` - Turn a captured runtime error into a repair pull request
- `27-autoresearch-ledger.ts` - Replayable autoresearch lifecycle and ledger analysis

See also [SDLC workflows](./docs/sdlc-workflows.md) and the
[replayable autoresearch guide](./docs/autoresearch.md).

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
