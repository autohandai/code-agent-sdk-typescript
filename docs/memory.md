# Memory

The Autohand CLI has built-in memory tools (`save_memory` and `recall_memory`) that agents can use to persist facts, preferences, or context across conversation turns and across sessions.

## How It Works

When an agent decides to save something, it calls `save_memory` with a key and value. The CLI writes this to a memory file. On subsequent prompts, the CLI loads relevant memory files into the context window so the agent can recall them.

You do not call memory tools directly from the SDK. You prompt the agent, and the agent decides when to save or recall.

## Saving Memory

```typescript
await sdk.start();

for await (const event of sdk.streamPrompt({
  message: 'Remember that I prefer TypeScript over JavaScript.',
})) {
  if (event.type === 'tool_start' && event.toolName === 'save_memory') {
    console.log('Agent is saving to memory...');
  }
  if (event.type === 'message_update') {
    process.stdout.write(event.delta);
  }
}
```

## Recalling Memory

In a new session, prompt the agent to retrieve stored facts:

```typescript
const sdk2 = new AutohandSDK({ cwd: '.' });
await sdk2.start();

for await (const event of sdk2.streamPrompt({
  message: 'What programming language do I prefer? Check your memory.',
})) {
  if (event.type === 'message_update') {
    process.stdout.write(event.delta);
  }
}
```

The agent calls `recall_memory`, the CLI searches the memory store, and the result appears in the context.

## Inspecting Memory in Context

Call `getContextUsage()` to see how many memory files are loaded:

```typescript
const usage = await sdk.getContextUsage();
console.log(`Memory files in context: ${usage.memoryFiles}`);
console.log(`Total context tokens: ${usage.total}`);
```

## Memory File Location

Memory files are stored in the CLI workspace under `.autohand/memory/`. You can inspect them directly if needed.

## Limitations

- The agent decides what to save. You cannot force-save from the SDK.
- Memory retrieval depends on the agent calling `recall_memory`. Prompt the agent explicitly if you need it to check memory.
- Memory files count toward the context window limit. Heavy use of memory increases token usage.

## Example

See `examples/08-memory-management.ts` for a complete script that saves a preference in one session and recalls it in another.
