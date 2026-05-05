# Event Streaming

`streamPrompt()` returns an async generator that yields events as they happen. You read them in a `for await...of` loop and decide what to show the user.

## Basic Pattern

```typescript
for await (const event of sdk.streamPrompt({ message: 'Hello' })) {
  if (event.type === 'message_update') {
    process.stdout.write(event.delta);
  }
}
```

## Event Types

### message_update

A chunk of the agent response. Concatenate `delta` to build the full message.

```typescript
if (event.type === 'message_update') {
  process.stdout.write(event.delta);
}
```

### message_end

The agent finished generating. `content` contains the full message string.

```typescript
if (event.type === 'message_end') {
  console.log('\n--- done ---');
}
```

### tool_start

The agent called a tool.

```typescript
if (event.type === 'tool_start') {
  console.log(`[tool: ${event.toolName}]`);
}
```

### tool_update

Streaming output from a running tool (stdout or file contents).

```typescript
if (event.type === 'tool_update') {
  process.stdout.write(event.output);
}
```

### tool_end

The tool finished. `output` may contain the final result.

```typescript
if (event.type === 'tool_end') {
  console.log(`[tool completed: ${event.toolName}]`);
  if (event.output) {
    console.log(event.output.substring(0, 500));
  }
}
```

### permission_request

The CLI needs approval before running a tool.

```typescript
if (event.type === 'permission_request') {
  console.log(`Permission needed: ${event.tool}`);
  console.log(`Description: ${event.description}`);

  await sdk.permissionResponse({
    requestId: event.requestId,
    allowed: true,
  });
}
```

### error

Something went wrong inside the agent loop or transport.

```typescript
if (event.type === 'error') {
  console.error('Agent error:', event.error);
}
```

## Building a Simple Chat UI

```typescript
let fullMessage = '';

for await (const event of sdk.streamPrompt({ message: userInput })) {
  switch (event.type) {
    case 'message_update': {
      process.stdout.write(event.delta);
      fullMessage += event.delta;
      break;
    }
    case 'tool_start': {
      console.log(`\n[running ${event.toolName}]`);
      break;
    }
    case 'tool_end': {
      console.log(`[${event.toolName} done]`);
      break;
    }
    case 'permission_request': {
      // Auto-approve for internal tools, ask for shell commands
      const isShell = event.tool === 'bash' || event.tool === 'run_command';
      await sdk.permissionResponse({
        requestId: event.requestId,
        allowed: !isShell,
      });
      break;
    }
    case 'error': {
      console.error('Error:', event.error);
      break;
    }
  }
}
```

## Subscribing to All Events

If you want events outside of a prompt stream:

```typescript
for await (const event of sdk.events()) {
  console.log(event.type);
}
```

This includes lifecycle events like `agent_start` and `agent_end`.
