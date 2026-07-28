/**
 * Discover curated skills while retaining concurrent-session visibility.
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
      agent.getSkillsRegistry(),
    ]);
    if (!registry.success) {
      throw new Error(registry.error ?? 'Skill registry unavailable');
    }
    const skill = registry.skills.find((entry) => entry.isCurated)
      ?? registry.skills[0];
    if (skill === undefined) {
      throw new Error('No skills are available');
    }
    console.log(`Skill ${skill.name} available while ${peers.length} peer(s) are active`);
  } finally {
    await agent.close();
  }
}

main().catch((error: unknown) => {
  console.error('Skills example failed:', error);
  process.exitCode = 1;
});
