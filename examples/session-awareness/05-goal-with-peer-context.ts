/**
 * Create a durable SDK goal after inspecting concurrent workspace activity.
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
    const occupiedPaths = peers.flatMap((peer) => peer.activity?.pathsWritten ?? []);
    const goal = await agent.createGoal({
      objective: [
        'Harden the public SDK without overwriting concurrent work.',
        occupiedPaths.length === 0
          ? 'No peer-written paths are currently reported.'
          : `Treat these peer-written paths as occupied: ${occupiedPaths.join(', ')}.`,
      ].join(' '),
    });
    if (!goal.ok) {
      throw new Error(goal.message);
    }
    console.log(`Goal accepted with ${peers.length} active peer(s)`);
  } finally {
    await agent.close();
  }
}

main().catch((error: unknown) => {
  console.error('Goal example failed:', error);
  process.exitCode = 1;
});
