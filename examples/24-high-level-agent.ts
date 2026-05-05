/**
 * High-level Agent API.
 *
 * This is the recommended API for application code. It keeps the run lifecycle
 * explicit while hiding JSON-RPC and subprocess details.
 *
 * Usage:
 *   AUTOHAND_CLI_PATH=/path/to/autohand bun run examples/24-high-level-agent.ts
 */

import { Agent } from '../src/index.js';

const cliPath = process.env.AUTOHAND_CLI_PATH;

async function main(): Promise<void> {
  const agent = await Agent.create({
    cwd: '.',
    ...(cliPath !== undefined && cliPath !== '' ? { cliPath } : {}),
    model: process.env.AUTOHAND_MODEL,
    instructions: [
      'You are reviewing a TypeScript SDK API.',
      'Prefer small, typed, composable interfaces.',
      'Call out permission-sensitive work before recommending execution.',
    ].join('\n'),
  });

  try {
    const run = await agent.send('Review the public SDK API and list the next three production hardening tasks.');

    for await (const event of run.stream()) {
      switch (event.type) {
        case 'message_update':
          process.stdout.write(event.delta);
          break;
        case 'permission_request':
          console.log(`\n[permission] ${event.tool}: ${event.description}`);
          await agent.denyPermission(event.requestId, 'once');
          break;
        case 'tool_start':
          console.log(`\n[tool] ${event.toolName}`);
          break;
      }
    }

    const result = await run.wait();
    console.log(`\n\nRun ${result.id} ${result.status} with ${result.events.length} events.`);
  } finally {
    await agent.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
