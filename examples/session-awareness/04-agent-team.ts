/**
 * Combine CLI team orchestration with session awareness.
 *
 * Team tools create separate teammate CLI processes. Those processes publish
 * `mode: "teammate"` records, so the lead can inspect them as normal peers.
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
    const teammates = (await agent.getSessionPeers())
      .filter((peer) => peer.mode === 'teammate');
    for (const teammate of teammates) {
      console.log(
        `Team peer ${teammate.sessionId}: ${teammate.activity?.phase ?? teammate.status}`,
      );
    }

    for await (const event of agent.stream([
      'Create team sdk-review.',
      'Add a reviewer teammate and assign an API review task.',
      'Respect paths claimed by every active teammate.',
    ].join(' '))) {
      if (
        event.type === 'tool_start'
        && ['create_team', 'add_teammate', 'create_team_task'].includes(event.toolName)
      ) {
        console.log(`Team tool: ${event.toolName}`);
      } else if (event.type === 'agent_end') {
        console.log('Team orchestration completed');
      }
    }
  } finally {
    await agent.close();
  }
}

main().catch((error: unknown) => {
  console.error('Agent team example failed:', error);
  process.exitCode = 1;
});
