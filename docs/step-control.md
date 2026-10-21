# Per-step control with `stopWhen`

`stopWhen` pauses a result after a completed tool step. The CLI persists every
tool result before the SDK evaluates the condition, so the same `Agent` can
continue from that exact conversation state.

```typescript
import { Agent, hasToolCall, isStepCount } from '@autohandai/agent-sdk';

const agent = await Agent.create({ cwd: '.' });

try {
  const result = await agent.run('Inspect the project before proposing changes', {
    stopWhen: [
      isStepCount(3),
      hasToolCall('write_file'),
    ],
  });

  if (result.status === 'stopped') {
    console.log(result.steps);
    const continued = await agent.run('Continue from the completed tool result');
    console.log(continued.text);
  }
} finally {
  await agent.close();
}
```

## Conditions

A stop condition receives the ordered completed steps and may be synchronous or
asynchronous:

```typescript
import type { StopCondition } from '@autohandai/agent-sdk';

const stopAfterSuccessfulWrite: StopCondition = async ({ steps }) => {
  const latest = steps.at(-1);
  return latest?.toolResults.some(
    (result) => result.tool === 'write_file' && result.success
  ) ?? false;
};
```

When an array is provided, the SDK evaluates every condition and stops when any
condition returns `true`.

## Execution semantics

- Conditions run after all tool calls in the step finish and their results are
  stored in conversation history.
- A terminal text-only model response has no tool-step boundary and completes
  naturally.
- A stopped result has `status: 'stopped'` and includes its completed `steps`.
- `isStepCount(n)` stops once the accumulated completed-step count reaches `n`.
- `hasToolCall(name)` stops when the latest completed step called that tool.
- If a condition throws, the SDK stops the CLI at that boundary and surfaces
  the predicate error.
- `run.abort()` remains responsive while asynchronous conditions are pending.
  The SDK consumes the terminal event and releases queued prompts without waiting
  for those conditions; their late results or errors are ignored. The SDK cannot
  cancel work inside a user-supplied promise, so predicates should manage their
  own external resources.
- Omitting `stopWhen` preserves normal execution to completion.

See [`examples/29-stop-when.ts`](../examples/29-stop-when.ts) for a resumable
end-to-end workflow.

From a repository checkout, run `bun run test:package` to verify the packaged
artifact. This builds and packs
the SDK, installs production dependencies in an isolated directory, checks all
bundled binary hashes, and runs the example, cancellation, and HTTP 429 scenarios
against the default native CLI and a local OpenAI-compatible fixture server.
The 429 check requires one typed `hook_rate_limit` event and no session retry.
