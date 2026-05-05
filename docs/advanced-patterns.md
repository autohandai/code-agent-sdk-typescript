# Advanced Patterns

## Custom System Prompts

Replace the entire CLI system prompt before the session starts:

```typescript
const sdk = new AutohandSDK({ cwd: '.' })
  .setSystemPrompt('./SYSTEM_PROMPT.md');
```

Or append to the default prompt:

```typescript
const sdk = new AutohandSDK({ cwd: '.' })
  .appendSystemPrompt('Always run Bun checks before declaring a task done.');
```

Both accept file paths or inline strings.

## Hooks

Hooks let you intercept tool calls and inject custom behavior.

```typescript
await sdk.addHook({
  event: 'pre-tool',
  command: 'echo "About to run: {{tool}}"',
});
```

List, toggle, and remove hooks at runtime:

```typescript
const hooks = await sdk.getHooks();
await sdk.toggleHook('pre-tool', 0);
await sdk.removeHook('pre-tool', 0);
```

## Context Compaction

When the context window fills up, the CLI can compact older messages into a summary:

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

- `compressionThreshold`: fraction of context used before summarization starts.
- `summarizationThreshold`: fraction at which aggressive compaction kicks in.

## Session Persistence

Save and resume sessions across process restarts:

```typescript
const sdk = new AutohandSDK({
  session: {
    persistSession: true,
    sessionPath: './.autohand/sessions',
    autoSaveInterval: 60,
  },
});

await sdk.start();
// ... work ...
await sdk.saveSession();

// Later
const resumed = new AutohandSDK({
  session: {
    resume: true,
    sessionId: 'session-abc123',
  },
});
await resumed.resumeSession('session-abc123');
```

## Model Switching

Change the model mid-session:

```typescript
await sdk.setModel('openrouter/auto');
```

This calls `autohand.modelSet` over RPC. Subsequent prompts use the new model.

## Thinking Tokens

For reasoning models, cap the thinking budget:

```typescript
await sdk.setMaxThinkingTokens(4096);
await sdk.setMaxThinkingTokens(null);  // Disable thinking.
```

## MCP Servers

The SDK can manage MCP (Model Context Protocol) servers:

```typescript
await sdk.setMcpServers({
  filesystem: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
  },
});

await sdk.toggleMcpServer('filesystem', true);
await sdk.reconnectMcpServer('filesystem');
```

## Agent vs AutohandSDK

Use `Agent` when you want:
- Simple fire-and-forget or streaming runs.
- Automatic lifecycle management.
- JSON output with validation.

Use `AutohandSDK` when you want:
- Full control over the CLI subprocess.
- Dynamic configuration changes mid-session.
- Direct access to every RPC method.

```typescript
// High-level: one-shot with JSON output.
const agent = await Agent.create({ cwd: '.' });
const result = await agent.runJson<{ files: string[] }>(
  'List the source files',
  {
    schema: { files: ['string'] },
    validate: (v) => v as { files: string[] },
  }
);

// Low-level: full event stream with permission handling.
const sdk = new AutohandSDK({ cwd: '.' });
await sdk.start();
for await (const event of sdk.streamPrompt({ message: 'Refactor the code' })) {
  // Handle every event type.
}
```

## Inspecting State

Get the current agent state:

```typescript
const state = await sdk.getState();
console.log(state.status);  // 'idle' | 'processing' | 'waiting_permission'
```

Get recent messages:

```typescript
const messages = await sdk.getMessages({ limit: 10 });
```

Get session statistics:

```typescript
const stats = await sdk.getStats();
console.log(stats.duration, stats.tokensUsed);
```

## Combining Patterns

A complete integration might look like this:

```typescript
const sdk = new AutohandSDK({
  cwd: '.',
  planMode: true,
  permissionMode: 'interactive',
  skills: { autoSkill: true, skills: ['typescript'] },
  context: { contextCompact: true, maxTokens: 128000 },
  session: { persistSession: true, autoSaveInterval: 60 },
  appendSystemPrompt: 'Write tests for every new module.',
});

await sdk.start();

// Plan phase
for await (const event of sdk.streamPrompt({ message: 'Plan the refactor' })) {
  // Stream events.
}

// Review plan, then execute
await sdk.disablePlanMode();

for await (const event of sdk.streamPrompt({ message: 'Implement the plan' })) {
  if (event.type === 'permission_request') {
    await sdk.permissionResponse({ requestId: event.requestId, allowed: true });
  }
}

await sdk.saveSession();
await sdk.stop();
```
