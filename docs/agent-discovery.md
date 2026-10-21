# Agent discovery

After starting the SDK, query the running session's effective subagents:

```typescript
const agents = await sdk.supportedAgents();
console.log(agents.map(agent => [agent.name, agent.source]));
```

Each entry includes an ID (the agent name), name, description, and tool names.
Model, source, and extension ID, version, and scope are optional metadata.
The registry includes built-in, user, external, generated, inline `--agents`,
and enabled extension agents with the CLI's effective precedence. Agent prompts
and local definition paths are excluded.

This calls `autohand.getSupportedAgents` with empty parameters. It requires a CLI
that implements this method; older versions return method-not-found. Malformed
responses raise an error rather than appearing as an empty registry. An empty
agents array is valid.

After an extension command, wait for the turn's completion before querying the
registry again. A prompt RPC acknowledgement alone does not indicate completion.
