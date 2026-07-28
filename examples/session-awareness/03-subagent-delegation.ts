/**
 * Observe sub-agent delegation and concurrent top-level sessions together.
 *
 * Sub-agents run inside the owning CLI session, so their completion is exposed
 * as `hook_subagent_stop`; independent CLI sessions remain registry peers.
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
    console.log(`Active peers: ${(await agent.getSessionPeers()).length}`);

    for await (const event of agent.stream([
      'Review the API and tests in parallel.',
      'Use delegate_parallel with appropriate specialist sub-agents.',
      'Do not edit files owned by another active session.',
    ].join(' '))) {
      if (event.type === 'tool_start' && event.toolName === 'delegate_parallel') {
        console.log(`Delegation started: ${event.toolName}`);
      } else if (event.type === 'hook_subagent_stop') {
        console.log(`Sub-agent ${event.subagentName} completed in ${event.duration}ms`);
      } else if (event.type === 'tool_end' && event.toolName === 'delegate_parallel') {
        console.log(`Delegation ${event.success ? 'succeeded' : 'failed'}`);
      }
    }
  } finally {
    await agent.close();
  }
}

main().catch((error: unknown) => {
  console.error('Sub-agent delegation example failed:', error);
  process.exitCode = 1;
});
