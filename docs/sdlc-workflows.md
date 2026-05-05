# SDLC Workflows With The Autohand SDK

These workflows use the SDK as an inspectable orchestration layer around the
Autohand CLI. The common pattern is:

1. Start in plan mode for read-only discovery.
2. Review the generated plan outside the agent loop.
3. Disable plan mode only after approval.
4. Execute with explicit permission handling.
5. Run release gates and summarize residual risk.

## Discovery And Planning

Use [20-sdlc-discovery-plan.ts](../examples/20-sdlc-discovery-plan.ts) when the
task is still ambiguous. It starts the CLI in plan mode with:

```typescript
const sdk = new AutohandSDK({
  planMode: true,
  skills: ['typescript', 'testing'],
});
```

Plan mode is separate from `permissionMode`. It calls CLI-3
`autohand.planModeSet` and restricts the agent to read-only planning tools.

## Gated Implementation

Use [21-sdlc-gated-implementation.ts](../examples/21-sdlc-gated-implementation.ts)
when you want a two-phase workflow:

1. Generate a plan with `planMode: true`.
2. Stop by default.
3. Re-run with `AUTOHAND_EXECUTE_PLAN=1` to disable plan mode and implement.

This is useful in CI-like hosts or IDE integrations where the host owns the
approval gate.

## Release Readiness

Use [22-sdlc-release-readiness.ts](../examples/22-sdlc-release-readiness.ts) to
ask the agent to run:

```bash
bun run typecheck
bun run test
bun run build
bun run lint
```

Keep `permissionMode: 'interactive'` so command execution remains visible through
`permission_request` events.

## Plan Mode Support

The SDK now supports plan mode directly:

```typescript
const sdk = new AutohandSDK({ planMode: true });
await sdk.start();

await sdk.disablePlanMode();
await sdk.enablePlanMode();
await sdk.setPlanMode(false);
```

`permissionMode: 'plan'` remains accepted as a legacy configuration value, but
new code should prefer `planMode` and `setPlanMode()` because CLI-3 exposes plan
mode as its own RPC control.
