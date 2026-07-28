/**
 * Inspect MCP capabilities alongside live workspace sessions.
 */

import { Agent, type SDKConfig } from '@autohandai/agent-sdk';

async function main(): Promise<void> {
  const config: SDKConfig = {
    cwd: process.env.AUTOHAND_TARGET_REPO ?? '.',
    sessions: { awareness: 'passive' },
    ...(process.env.AUTOHAND_CLI_PATH === undefined
      ? {}
      : { cliPath: process.env.AUTOHAND_CLI_PATH }),
  };
  const agent = await Agent.create(config);

  try {
    const [peers, registry] = await Promise.all([
      agent.getSessionPeers(),
      agent.listMcpTools(),
    ]);
    const tool = registry.tools[0];
    if (tool === undefined) {
      throw new Error('No MCP tools are connected');
    }
    console.log(
      `MCP ${tool.serverName}/${tool.name} available with ${peers.length} peer(s)`,
    );
  } finally {
    await agent.close();
  }
}

main().catch((error: unknown) => {
  console.error('MCP example failed:', error);
  process.exitCode = 1;
});
