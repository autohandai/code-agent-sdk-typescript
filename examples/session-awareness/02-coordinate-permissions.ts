/**
 * Use coordinate awareness with the SDK permission handshake.
 *
 * Coordinate-tier claim conflicts arrive through the normal permission stream:
 * acknowledge first, then collect and send the user's decision.
 */

import { Agent, type SDKConfig } from '@autohandai/agent-sdk';

async function main(): Promise<void> {
  const config: SDKConfig = {
    cwd: process.env.AUTOHAND_TARGET_REPO ?? '.',
    sessions: { awareness: 'coordinate' },
    ...(process.env.AUTOHAND_CLI_PATH === undefined
      ? {}
      : { cliPath: process.env.AUTOHAND_CLI_PATH }),
  };
  const agent = await Agent.create(config);

  try {
    const peers = await agent.getSessionPeers();
    console.log(`Coordinate with ${peers.length} peer(s)`);

    for await (const event of agent.stream(
      'Update the shared API only after checking peer claims.',
    )) {
      if (event.type === 'permission_request') {
        await agent.acknowledgePermission({ requestId: event.requestId });
        await agent.allowPermission(event.requestId, 'once');
        console.log(`Permission approved for ${event.tool}`);
      } else if (event.type === 'agent_end') {
        console.log('Run completed');
      }
    }
  } finally {
    await agent.close();
  }
}

main().catch((error: unknown) => {
  console.error('Coordinate permission example failed:', error);
  process.exitCode = 1;
});
