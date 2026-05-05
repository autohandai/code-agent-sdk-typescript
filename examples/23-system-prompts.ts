/**
 * System prompt configuration.
 *
 * Use appendSystemPrompt for normal SDK integrations. Use setSystemPrompt only
 * when you intentionally own the complete agent contract.
 *
 * Usage:
 *   AUTOHAND_CLI_PATH=/path/to/autohand bun run examples/23-system-prompts.ts
 *   AUTOHAND_PROMPT_MODE=replace AUTOHAND_CLI_PATH=/path/to/autohand bun run examples/23-system-prompts.ts
 */

import { AutohandSDK } from '../src/index.js';

const cliPath = process.env.AUTOHAND_CLI_PATH;
const mode = process.env.AUTOHAND_PROMPT_MODE === 'replace' ? 'replace' : 'append';

function createSdk(): AutohandSDK {
  const sdk = new AutohandSDK({
    cwd: '.',
    ...(cliPath !== undefined && cliPath !== '' ? { cliPath } : {}),
    model: process.env.AUTOHAND_MODEL,
  });

  if (mode === 'replace') {
    return sdk.setSystemPrompt([
      'You are Autohand Code operating as a release-review agent.',
      'Inspect the repository carefully.',
      'Return concise findings with file references and verification steps.',
    ].join('\n'));
  }

  return sdk.appendSystemPrompt([
    'For this SDK repository, prefer Bun commands.',
    'Call out permission-sensitive operations before recommending execution.',
    'Keep responses focused on TypeScript SDK API design.',
  ].join('\n'));
}

async function main(): Promise<void> {
  const sdk = createSdk();

  try {
    await sdk.start();

    for await (const event of sdk.streamPrompt({
      message: 'Review the public SDK surface for system prompt ergonomics.',
    })) {
      switch (event.type) {
        case 'message_update':
          process.stdout.write(event.delta);
          break;
        case 'permission_request':
          console.log(`\n[permission] ${event.tool}: ${event.description}`);
          await sdk.denyPermission(event.requestId, 'once');
          break;
        case 'agent_end':
          return;
      }
    }
  } finally {
    await sdk.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
