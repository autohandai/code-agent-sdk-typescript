/**
 * 06 Prompt Skills - Skills mentioned in prompt, SDK has them available.
 *
 * This example shows how to configure skills that the agent can reference
 * via "/skill <name>" syntax in prompts. The skills are pre-loaded and
 * available for the agent to use when mentioned.
 *
 * Prerequisites:
 * - Autohand CLI must be installed and available in PATH
 * - CLI must be authenticated (run `autohand login` first)
 *
 * Usage:
 *   bun run examples/06-prompt-skills.ts
 */

import { AutohandSDK } from '../src/index.js';
import type { SDKEvent } from '../src/types/index.js';

/**
 * Main function that creates an agent with pre-configured skills
 */
async function main(): Promise<void> {
  try {
    console.log('Initializing Autohand SDK with skills...\n');

    // Initialize SDK with skills that can be referenced in prompts
    const sdk = new AutohandSDK({
      cwd: process.cwd(),
      model: 'fantail2',
      cliPath: '/Users/igorcosta/Documents/autohand/cli-3/autohand',
      // These skills are available for the agent to use via "/skill <name>"
      skills: ['typescript', 'testing', 'react', 'nodejs'],
    });

    // Start the CLI subprocess
    await sdk.start();
    console.log('✓ SDK started\n');

    // Send a prompt that references skills
    const prompt = 'Review this TypeScript code using /skill typescript best practices and suggest improvements.';
    console.log(`Sending prompt: "${prompt}"\n`);
    console.log('The agent can reference pre-loaded skills via /skill syntax\n');

    // Stream the response
    for await (const event of sdk.streamPrompt({ message: prompt })) {
      handleEvent(event);
    }

    console.log('\n✓ SDK stopped');
    await sdk.stop();
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Handle streaming events from the agent
 */
function handleEvent(event: SDKEvent): void {
  switch (event.type) {
    case 'agent_start':
      console.log(`[Agent started: ${event.sessionId}]`);
      console.log(`  Model: ${event.model}`);
      break;
    case 'tool_start':
      console.log(`\n[Tool called: ${event.toolName}]`);
      break;
    case 'tool_update':
      process.stdout.write(event.output);
      break;
    case 'tool_end':
      console.log(`[Tool completed: ${event.toolName}]`);
      break;
    case 'permission_request':
      console.log(`\n[Permission request: ${event.tool}]`);
      console.log(`  Description: ${event.description}`);
      break;
    case 'message_update':
      if (event.delta) {
        process.stdout.write(event.delta);
      }
      break;
    case 'message_end':
      if (event.content) {
        console.log('\n[Message completed]');
      }
      break;
    case 'agent_end':
      console.log('\n[Agent ended]');
      break;
    case 'error':
      console.error(`\n[Error: ${event.message}]`);
      break;
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
