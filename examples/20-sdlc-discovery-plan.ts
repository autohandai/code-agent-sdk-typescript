/**
 * SDLC workflow: discovery and planning.
 *
 * This runs the agent in CLI-3 plan mode so it can inspect the project and
 * produce an implementation plan without performing write operations.
 *
 * Usage:
 *   AUTOHAND_CLI_PATH=/path/to/autohand bun run examples/20-sdlc-discovery-plan.ts
 */

import { AutohandSDK, type SDKEvent } from '../src/index.js';

const cliPath = process.env.AUTOHAND_CLI_PATH;

async function main(): Promise<void> {
  const sdk = new AutohandSDK({
    cwd: process.cwd(),
    ...(cliPath !== undefined && cliPath !== '' ? { cliPath } : {}),
    model: process.env.AUTOHAND_MODEL,
    planMode: true,
    skills: ['typescript', 'testing'],
    agentsMd: {
      enable: true,
      path: './AGENTS.md',
    },
  });

  try {
    await sdk.start();

    await streamPrompt(sdk, {
      message: [
        'We are in discovery for a production TypeScript SDK change.',
        'Inspect the repository and produce an SDLC plan only.',
        'Do not edit files.',
        'Include scope, risks, test strategy, rollout steps, and explicit non-goals.',
      ].join('\n'),
    });
  } finally {
    await sdk.stop();
  }
}

async function streamPrompt(sdk: AutohandSDK, params: { message: string }): Promise<void> {
  for await (const event of sdk.streamPrompt(params)) {
    writeEvent(event);
  }
}

function writeEvent(event: SDKEvent): void {
  switch (event.type) {
    case 'message_update':
      process.stdout.write(event.delta);
      break;
    case 'tool_start':
      console.log(`\n[tool:start] ${event.toolName}`);
      break;
    case 'tool_end':
      console.log(`[tool:end] ${event.toolName} success=${event.success}`);
      break;
    case 'permission_request':
      console.log(`\n[permission] ${event.tool}: ${event.description}`);
      break;
    case 'error':
      console.error(`\n[error] ${event.message}`);
      break;
    default:
      break;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
