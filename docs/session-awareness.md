# Concurrent Session Awareness

The SDK uses CLI-3's shared active-agent registry to expose other live Autohand
sessions working in the same workspace. Records are validated at the filesystem
boundary, stale and dead processes are ignored, and peer-authored terminal text
is sanitized before it reaches application code.

## Configure the tier

```typescript
import { Agent } from '@autohandai/agent-sdk';

const agent = await Agent.create({
  cwd: '/path/to/project',
  sessions: {
    awareness: 'coordinate',
  },
});
```

The tiers match CLI-3:

- `passive` publishes activity and reports peer presence.
- `warn` is the default and adds advisory Git, file-collision, and repository-drift guards.
- `coordinate` also asks before writing a path claimed by a live peer.

When an SDK tier is explicit, the SDK copies the effective CLI config into a
private `0600` temporary file, overlays only `sessions.awareness`, passes it to
CLI-3 before the agent is created, and removes it at shutdown. It never mutates
the user's config. The registry remains under
`$AUTOHAND_HOME/active-agents` (normally `~/.autohand/active-agents`).

## Query current peers

`Agent`, `AutohandSDK`, and `RPCClient` expose the same query:

```typescript
const peers = await agent.getSessionPeers();

for (const peer of peers) {
  console.log(peer.sessionId, peer.activity?.phase);
  console.log(peer.activity?.instruction);
  console.log(peer.activity?.pathsWritten);
}
```

The current SDK-owned CLI process is excluded. Older CLI records without an
`activity` block remain valid and return presence information only.

## Stream lifecycle changes

Peer events share the normal ordered SDK event stream:

```typescript
for await (const event of agent.events()) {
  if (event.type === 'session_peer_joined') {
    console.log('joined', event.peer.sessionId);
  } else if (event.type === 'session_peer_updated') {
    console.log('phase', event.peer.activity?.phase);
  } else if (event.type === 'session_peer_left') {
    console.log('left', event.peer.sessionId);
  }
}
```

`session_peer_updated` is emitted only when meaningful peer state changes; the
five-second heartbeat timestamp alone does not generate event noise.
Recoverable registry failures are surfaced as `session_awareness_error` events;
the SDK keeps polling because awareness is advisory.

## Coordinate-tier confirmations

A peer claim uses CLI-3's normal permission protocol. A client must acknowledge
the request before collecting the user's decision:

```typescript
if (event.type === 'permission_request') {
  await agent.acknowledgePermission({ requestId: event.requestId });

  if (userApproved) {
    await agent.allowPermission(event.requestId, 'once');
  } else {
    await agent.denyPermission(event.requestId, 'once');
  }
}
```

With CLI `--yes`, auto-confirm, YOLO, or unrestricted mode, the write proceeds
and CLI-3 records the advisory warning without waiting for a response.

## Security and compatibility

- Registry data is treated as untrusted external input.
- ANSI escapes, control characters, bidi overrides, and zero-width characters
  are removed from peer instruction and command text.
- Activity text is clamped to 200 characters; written paths and claims are
  clamped to 20 entries.
- The reader never deletes registry files. CLI-3 remains the single owner of
  heartbeat, liveness, staleness, and cleanup.
- Awareness is local-machine only, matching CLI-3's design.

## Executable integration examples

The [`examples/session-awareness`](../examples/session-awareness) collection
contains ten runnable examples that combine awareness with:

1. streamed agent responses;
2. coordinate-tier permission decisions;
3. typed sub-agent delegation events;
4. CLI teams and teammate peer records;
5. durable goals;
6. community skill discovery;
7. MCP tool inspection;
8. auto-mode;
9. sub-agent-assisted autoresearch; and
10. validated structured output.

Each example is exercised as a separate process by the SDK end-to-end suite
against a deterministic JSON-RPC CLI fixture and a real active-agent registry.
