# Error Handling

Errors in the SDK fall into three categories: transport errors, JSON-RPC errors, and agent loop errors.

## Transport Errors

These happen when the CLI subprocess cannot start, crashes, or disconnects.

```typescript
try {
  await sdk.start();
} catch (error) {
  console.error('Failed to start CLI:', error);
}
```

Common causes:
- `cliPath` points to a missing binary.
- The CLI config (`~/.autohand/config.json`) has an invalid provider or missing API key.
- The CLI process exited with a non-zero code.

## JSON-RPC Errors

These happen when the CLI rejects a request.

```typescript
try {
  await sdk.prompt({ message: 'Hello' });
} catch (error) {
  console.error('RPC error:', error);
}
```

Common causes:
- Calling `prompt()` before `start()`.
- Calling `setModel()` with an unsupported model string.
- Calling `permissionResponse()` with an expired `requestId`.

## Agent Loop Errors

These appear as `error` events in the event stream.

```typescript
for await (const event of sdk.streamPrompt({ message: 'Hello' })) {
  if (event.type === 'error') {
    console.error('Agent error:', event.error);
  }
}
```

Common causes:
- The LLM provider returned an HTTP error.
- A tool execution threw an exception.
- The context window exceeded the model limit.

## Timeouts

Set `timeout` in milliseconds when creating the SDK:

```typescript
const sdk = new AutohandSDK({
  timeout: 60000,  // 60 seconds.
});
```

If a request hangs, the SDK throws a timeout error.

## Aborting a Run

If you need to stop the agent mid-turn:

```typescript
await sdk.interrupt();  // Cancels the current prompt.
```

## Recovery Patterns

### Restart on Crash

```typescript
async function resilientPrompt(sdk: AutohandSDK, message: string) {
  try {
    for await (const event of sdk.streamPrompt({ message })) {
      // Handle events.
    }
  } catch (error) {
    console.error('Stream failed, attempting restart...');
    await sdk.stop();
    await sdk.start();

    for await (const event of sdk.streamPrompt({ message })) {
      // Retry.
    }
  }
}
```

### Graceful Shutdown

Always call `stop()` or `close()` before your process exits:

```typescript
process.on('SIGINT', async () => {
  await sdk.stop();
  process.exit(0);
});
```

## Error Types

The SDK does not export a custom error hierarchy. All errors are standard JavaScript `Error` instances with a `message` string. Check the message text to distinguish categories:

- Transport: `"Failed to spawn CLI process"` or similar.
- RPC: `"JSON-RPC error: ..."`.
- Timeout: `"Request timeout after ...ms"`.
