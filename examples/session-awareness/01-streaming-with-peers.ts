/**
 * Stream an agent response while showing who else is active in the workspace.
 *
 * Usage:
 *   AUTOHAND_TARGET_REPO=/path/to/project bun run \
 *     examples/session-awareness/01-streaming-with-peers.ts
 */

import { Agent, type SDKConfig } from '@autohandai/agent-sdk';

async function main(): Promise<void> {
  const config: SDKConfig = {
    cwd: process.env.AUTOHAND_TARGET_REPO ?? '.',
    sessions: { awareness: 'warn' },
    ...(process.env.AUTOHAND_CLI_PATH === undefined
      ? {}
      : { cliPath: process.env.AUTOHAND_CLI_PATH }),
  };
  const agent = await Agent.create(config);

  try {
    const peers = await agent.getSessionPeers();
    for (const peer of peers) {
      console.log(`Peer ${peer.sessionId} is ${peer.activity?.phase ?? peer.status}`);
    }

    for await (const event of agent.stream(
      'Summarize the safest next change while respecting concurrent sessions.',
    )) {
      if (event.type === 'message_update') {
        process.stdout.write(event.delta);
      } else if (event.type === 'agent_end') {
        process.stdout.write('\n');
        console.log('Run completed');
      }
    }
  } finally {
    await agent.close();
  }
}

main().catch((error: unknown) => {
  console.error('Streaming example failed:', error);
  process.exitCode = 1;
});
