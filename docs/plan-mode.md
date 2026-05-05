# Plan Mode

Plan mode restricts the agent to read-only planning tools. It cannot write files, run commands, or make changes. Use it when you want the agent to inspect the codebase and produce a plan before executing anything.

## Enabling Plan Mode

Pass `planMode: true` when creating the SDK:

```typescript
const sdk = new AutohandSDK({
  planMode: true,
});

await sdk.start();
```

Or toggle it at runtime:

```typescript
await sdk.enablePlanMode();   // Restrict to read-only tools.
await sdk.disablePlanMode();  // Allow all tools.
await sdk.setPlanMode(false); // Same as disablePlanMode().
```

## Two-Phase Workflow

The typical pattern is:

1. Start in plan mode.
2. Prompt the agent to inspect and plan.
3. Stop the SDK.
4. Review the plan outside the agent loop.
5. Re-start with plan mode disabled and execute.

```typescript
// Phase 1: Discovery
const planSdk = new AutohandSDK({ planMode: true });
await planSdk.start();

for await (const event of planSdk.streamPrompt({
  message: 'Plan a refactor to split utils.ts into smaller modules.',
})) {
  if (event.type === 'message_update') {
    process.stdout.write(event.delta);
  }
}

await planSdk.stop();

// Human reviews the plan here.

// Phase 2: Execution
const execSdk = new AutohandSDK({
  planMode: false,
  permissionMode: 'interactive',
});
await execSdk.start();

for await (const event of execSdk.streamPrompt({
  message: 'Execute the refactor plan we discussed.',
})) {
  // Handle events, including permission requests.
}
```

## Plan Mode vs Permission Mode

Plan mode is separate from permission mode. Permission mode controls whether the CLI asks before individual tool calls. Plan mode controls which tools are available at all.

```typescript
// Plan mode + interactive permissions: safe review with human gates.
const sdk = new AutohandSDK({
  planMode: true,
  permissionMode: 'interactive',
});
```

## Legacy Note

`permissionMode: 'plan'` was accepted in older versions but is deprecated. New code should use the `planMode` config field and `setPlanMode()` / `enablePlanMode()` / `disablePlanMode()` methods.

## SDLC Integration

Plan mode is the foundation of the SDLC discovery and gated implementation workflows. See `docs/sdlc-workflows.md` and `examples/20-sdlc-discovery-plan.ts` for complete patterns.
