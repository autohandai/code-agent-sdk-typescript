/**
 * SDLC workflow: release readiness review.
 *
 * This asks the agent to run the production gates and report release risk.
 * The CLI default permission mode keeps command execution visible to the host
 * application through permission_request events.
 *
 * Usage:
 *   AUTOHAND_CLI_PATH=/path/to/autohand bun run examples/22-sdlc-release-readiness.ts
 */

import { AutohandSDK, type SDKEvent } from '../src/index.js';

const cliPath = process.env.AUTOHAND_CLI_PATH;

async function main(): Promise<void> {
  const sdk = new AutohandSDK({
    cwd: process.cwd(),
    ...(cliPath !== undefined && cliPath !== '' ? { cliPath } : {}),
    model: process.env.AUTOHAND_MODEL,
    skills: ['typescript', 'testing'],
    agentsMd: 'auto',
  });

  try {
    await sdk.start();

    await streamPrompt(sdk, [
      'Run a release-readiness pass for this TypeScript SDK.',
      'Use the repository standard commands: bun run typecheck, bun run test, bun run build, bun run lint.',
      'If a command fails, stop and explain the failure with file references.',
      'If all commands pass, summarize residual risks and production readiness.',
    ].join('\n'));
  } finally {
    await sdk.stop();
  }
}

async function streamPrompt(sdk: AutohandSDK, message: string): Promise<void> {
  const toolResults: Array<{ name: string; success: boolean }> = [];

  for await (const event of sdk.streamPrompt({ message })) {
    switch (event.type) {
      case 'message_update':
        process.stdout.write(event.delta);
        break;
      case 'tool_start':
        console.log(`\n[tool:start] ${event.toolName}`);
        break;
      case 'tool_update':
        process.stdout.write(event.output);
        break;
      case 'tool_end':
        toolResults.push({ name: event.toolName, success: event.success });
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

  if (toolResults.length > 0) {
    console.log('\n--- tool summary ---');
    for (const result of toolResults) {
      console.log(`${result.name}: ${result.success ? 'pass' : 'fail'}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
