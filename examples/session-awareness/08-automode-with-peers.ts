/**
 * Start autonomous work without giving up visibility into concurrent sessions.
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
    const started = await agent.startAutomode({
      prompt: [
        'Improve SDK reliability.',
        'Before every write, account for active peer paths and claims.',
      ].join(' '),
      maxIterations: 3,
    });
    if (!started.success || started.sessionId === undefined) {
      throw new Error(started.error ?? 'Auto-mode did not start');
    }
    console.log(
      `Auto-mode ${started.sessionId} started with ${peers.length} peer(s) visible`,
    );
  } finally {
    await agent.close();
  }
}

main().catch((error: unknown) => {
  console.error('Auto-mode example failed:', error);
  process.exitCode = 1;
});
