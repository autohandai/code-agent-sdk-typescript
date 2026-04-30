/**
 * Simple example of using the Autohand SDK (CLI Wrapper)
 *
 * This is adapted from the library SDK's HelloAgent.ts example.
 * The tin-wrapper SDK communicates with the CLI via JSON-RPC over stdio.
 *
 * Prerequisites:
 * - Autohand CLI must be installed and available in PATH
 * - CLI must be authenticated (run `autohand login` first)
 *
 * Usage:
 *   bun run examples/01-hello-agent.ts
 */

import { AutohandSDK } from '../src/index.js';

/**
 * Main function that creates and runs an agent
 */
async function main(): Promise<void> {
  try {
    console.log('Initializing Autohand SDK...\n');

    // Initialize SDK with configuration
    const sdk = new AutohandSDK({
      debug: false,
      cliPath: '/Users/igorcosta/Documents/autohand/cli-3/autohand', // Use local development CLI
    });

    // Start the CLI subprocess
    await sdk.start();
    console.log('✓ SDK started\n');

    // Send a prompt to the agent and stream the response
    console.log('Sending prompt: "Tell me a good joke about code AI agents!"\n');
    console.log('=== Agent Response ===\n');

    let fullResponse = '';
    for await (const event of sdk.streamPrompt({ message: 'Tell me a good joke about code AI agents!' })) {
      if (event.type === 'message_update') {
        process.stdout.write(event.delta);
        fullResponse += event.delta;
      } else if (event.type === 'message_end' && event.content) {
        // CLI sends full content in message_end
        console.log(event.content);
        fullResponse = event.content;
      } else if (event.type === 'error') {
        console.error(`Error: ${event.message}`);
      }
    }

    console.log('\n=== Full Response ===');
    console.log(fullResponse);

    // Get the agent state
    const state = await sdk.getState();
    console.log('\n=== Agent State ===');
    console.log(JSON.stringify(state, null, 2));

    // Stop the CLI subprocess
    await sdk.stop();
    console.log('\n✓ SDK stopped');
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main().catch(error => {
  // Exit with error code on failure
  process.exit(1);
});
