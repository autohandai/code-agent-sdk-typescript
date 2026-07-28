/**
 * Observe and coordinate with concurrent Autohand sessions.
 *
 * Usage:
 *   AUTOHAND_TARGET_REPO=/path/to/project bun run examples/28-session-awareness.ts
 */

import { Agent } from '@autohandai/agent-sdk';

async function main(): Promise<void> {
  const agent = await Agent.create({
    cwd: process.env.AUTOHAND_TARGET_REPO ?? '.',
    sessions: { awareness: 'coordinate' },
  });

  try {
    const peers = await agent.getSessionPeers();
    console.log(`Found ${peers.length} peer session(s).`);

    for await (const event of agent.events()) {
      if (event.type === 'session_peer_joined') {
        console.log(`Peer joined: ${event.peer.sessionId}`);
      } else if (event.type === 'session_peer_updated') {
        console.log(
          `Peer ${event.peer.sessionId}: ${event.peer.activity?.phase ?? event.peer.status}`,
        );
      } else if (event.type === 'session_peer_left') {
        console.log(`Peer left: ${event.peer.sessionId}`);
      } else if (event.type === 'permission_request') {
        await agent.acknowledgePermission({ requestId: event.requestId });
        // Replace this explicit denial with an application/user decision.
        await agent.denyPermission(event.requestId, 'once');
      }
    }
  } finally {
    await agent.close();
  }
}

main().catch((error: unknown) => {
  console.error('Session-awareness example failed:', error);
  process.exitCode = 1;
});
