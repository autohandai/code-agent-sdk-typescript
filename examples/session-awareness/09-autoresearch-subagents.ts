/**
 * Run autoresearch with specialist sub-agent phases and peer awareness.
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
    const started = await agent.startAutoresearch({
      objective: 'Reduce SDK startup latency without disturbing peer-owned files.',
      metricName: 'startup_p95',
      metricUnit: 'ms',
      direction: 'lower',
      maxIterations: 5,
      subagents: {
        ideaGeneration: true,
        measurementAnalysis: true,
        finalization: true,
      },
    });
    if (!started.success) {
      throw new Error(started.error ?? 'Autoresearch did not start');
    }
    console.log(
      `Autoresearch started with sub-agent phases and ${peers.length} peer(s)`,
    );
  } finally {
    await agent.close();
  }
}

main().catch((error: unknown) => {
  console.error('Autoresearch example failed:', error);
  process.exitCode = 1;
});
