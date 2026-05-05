/**
 * SDLC workflow: plan first, execute only after an explicit gate.
 *
 * By default this example stops after planning. Set AUTOHAND_EXECUTE_PLAN=1
 * to disable plan mode and ask the agent to implement the approved plan.
 *
 * Usage:
 *   AUTOHAND_CLI_PATH=/path/to/autohand bun run examples/21-sdlc-gated-implementation.ts
 *   AUTOHAND_EXECUTE_PLAN=1 AUTOHAND_CLI_PATH=/path/to/autohand bun run examples/21-sdlc-gated-implementation.ts
 */

import { AutohandSDK, type SDKEvent } from '../src/index.js';

const cliPath = process.env.AUTOHAND_CLI_PATH;
const executePlan = process.env.AUTOHAND_EXECUTE_PLAN === '1';

async function main(): Promise<void> {
  const sdk = new AutohandSDK({
    cwd: process.cwd(),
    ...(cliPath !== undefined && cliPath !== '' ? { cliPath } : {}),
    model: process.env.AUTOHAND_MODEL,
    planMode: true,
    skills: ['typescript', 'testing'],
  });

  try {
    await sdk.start();

    const planPrompt = [
      'Create an implementation plan for the requested SDK change.',
      'Use repository inspection only.',
      'Do not edit files in this planning pass.',
      'Return numbered steps with test coverage and rollback notes.',
    ].join('\n');

    console.log('--- planning ---\n');
    await streamPrompt(sdk, planPrompt);

    if (!executePlan) {
      console.log('\n--- gate closed ---');
      console.log('Set AUTOHAND_EXECUTE_PLAN=1 after reviewing the plan to run the implementation phase.');
      return;
    }

    await sdk.disablePlanMode();

    const executePrompt = [
      'Implement the approved plan.',
      'Keep changes scoped.',
      'Run the relevant checks with Bun.',
      'Summarize changed files and verification results.',
    ].join('\n');

    console.log('\n--- implementation ---\n');
    await streamPrompt(sdk, executePrompt);
  } finally {
    await sdk.stop();
  }
}

async function streamPrompt(sdk: AutohandSDK, message: string): Promise<void> {
  for await (const event of sdk.streamPrompt({ message })) {
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
    case 'tool_update':
      process.stdout.write(event.output);
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
