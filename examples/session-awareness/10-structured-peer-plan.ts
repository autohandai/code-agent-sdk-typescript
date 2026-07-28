/**
 * Produce validated structured output that accounts for peer-written paths.
 */

import { Agent, type SDKConfig } from '@autohandai/agent-sdk';

interface PeerSafePlan {
  summary: string;
  avoidPaths: string[];
}

function validatePeerSafePlan(value: unknown): PeerSafePlan {
  if (
    typeof value !== 'object'
    || value === null
    || !('summary' in value)
    || !('avoidPaths' in value)
    || typeof value.summary !== 'string'
    || !Array.isArray(value.avoidPaths)
    || !value.avoidPaths.every((entry) => typeof entry === 'string')
  ) {
    throw new Error('Invalid peer-safe plan');
  }
  return {
    summary: value.summary,
    avoidPaths: value.avoidPaths,
  };
}

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
    const peerPaths = peers.flatMap((peer) => peer.activity?.pathsWritten ?? []);
    const plan = await agent.runJson<PeerSafePlan>(
      `Plan a change without editing these peer-written paths: ${peerPaths.join(', ')}`,
      {
        schemaName: 'PeerSafePlan',
        schema: {
          summary: 'string',
          avoidPaths: ['string'],
        },
        validate: validatePeerSafePlan,
      },
    );
    console.log(`Plan avoids src/api.ts: ${plan.avoidPaths.includes('src/api.ts')}`);
  } finally {
    await agent.close();
  }
}

main().catch((error: unknown) => {
  console.error('Structured peer plan example failed:', error);
  process.exitCode = 1;
});
