# Reliability and startup performance

The SDK transport is write-ready on the child-process `spawn` event and does not use a fixed startup delay. The benchmark measures a cold public-package import, the exact `sdk.start()` return time with the shipped CLI, and transport framing through a completed `autohand.getState` request against a deterministic local RPC fixture.

Run the reproducible gate:

```bash
npm run benchmark:startup
```

Each gate performs five warmups and 50 measurements with a monotonic clock. The package-load timer runs inside a fresh Node process, immediately around `import()`, so Node boot time is not attributed to the SDK. The SDK-start timer uses the actual bundled CLI. The framing timer uses a deterministic RPC fixture so provider configuration, network access, and CLI application initialization are not attributed to wrapper overhead. Any metric fails at p95 50 ms or greater.

On the 2026-07-20 macOS arm64 verification host:

- Public import: median 13.758 ms, p95 16.800 ms, maximum 21.968 ms.
- `sdk.start()` return with the bundled CLI: median 0.615 ms, p95 0.794 ms, maximum 0.883 ms.
- Fixture spawn to first RPC: median 3.761 ms, p95 4.442 ms, maximum 5.051 ms.

The 50 ms SLO covers SDK initialization and the public `start()` contract. A first request to the full CLI may additionally load application/provider configuration and is reported separately in integration diagnostics; it is not relabeled as SDK startup.

## Reliability fixes

- Removed the unconditional 500 ms startup sleep.
- Propagated subprocess spawn failures through `start()` instead of throwing from an event callback.
- Coalesced concurrent `start()` calls so only one CLI subprocess is created.
- Failed pending RPC calls immediately when the CLI exits.
- Made repeated shutdown safe, including when the child exited before `stop()`.
- Removed timed-out and failed writes from the pending-request map.
- Rejected line readers waiting on a closed stdout stream.
- Forwarded the documented generic `env` configuration to the CLI.
- Made SDK startup transactional: failed startup configuration stops the child and remains retryable.
- Made transport shutdown wait for in-flight pre-spawn setup before capturing and terminating the child generation.
- Made SDK restarts wait for an in-flight stop and coalesce concurrent post-stop callers instead of reporting the session running before shutdown completes.
- Verify the client is still connected after the final startup configuration response before publishing the SDK as started.
- Broadcast notifications independently to every active event subscriber and close blocked iterators on shutdown.
- Bound each active subscriber to the latest 1,024 events so a stalled consumer cannot grow memory indefinitely.
- Reused the outstanding event read when prompt completion wins a race, preventing the next notification from being consumed by a stale waiter.
- Serialized prompt operations while leaving abort, permission, and discovery RPCs available during a turn; because prompt RPC acknowledgement precedes background work, both `prompt()` and `streamPrompt()` wait through terminal `agent_end`. Abandoning a stream sends `autohand.abort` and drains through that terminal event before the next prompt starts, or stops the transport if cleanup cannot be confirmed within two seconds. Prompt-owned subscriptions start from the new request and ignore stale historical backlog.
- Treat an unexpected stdout closure as transport termination even if the child process has not exited yet, drain every complete buffered frame (including a final unterminated JSON object) first, then enforce bounded TERM/KILL cleanup before restart.

Malformed stdout remains isolated to the bad line; subsequent valid JSON-RPC frames continue to be processed. The last 50 stderr lines are retained for process-exit diagnostics without contaminating stdout framing.
If a parseable response matches a pending ID but has an invalid result/error envelope, that request is rejected explicitly and removed rather than left unsettled.

## New protocol features

The SDK now exposes the current CLI contracts for skill discovery/installation and MCP inspection:

- `getSkillsRegistry()`
- `installSkill()`
- `listMcpServers()`
- `listMcpTools()`
- `getMcpServerConfigs()`

These methods use exact CLI wire names and typed response models. They are also available through the high-level `Agent` API.
