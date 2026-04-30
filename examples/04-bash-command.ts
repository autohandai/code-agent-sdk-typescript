/**
 * 04 Bash Command - Agent that runs shell commands.
 *
 * This is adapted from the library SDK's 04-bash-command example.
 * The tin-wrapper SDK communicates with the CLI via JSON-RPC over stdio.
 *
 * The agent can execute arbitrary shell commands — powerful but requires trust.
 *
 * Prerequisites:
 * - Autohand CLI must be installed and available in PATH
 * - CLI must be authenticated (run `autohand login` first)
 *
 * Usage:
 *   bun run examples/04-bash-command.ts
 */

import { AutohandSDK } from '../src/index.js';

/**
 * Main function that creates and runs a terminal agent
 */
async function main(): Promise<void> {
  try {
    console.log('Initializing Autohand SDK...\n');

    // Initialize SDK with configuration
    const sdk = new AutohandSDK({
      cliPath: '/Users/igorcosta/Documents/autohand/cli-3/autohand', // Use local development CLI
    });

    // Start the CLI subprocess
    await sdk.start();
    console.log('✓ SDK started\n');

    // Send a prompt that requires bash commands
    console.log('Sending prompt: "What is the current directory listing and total file count?"\n');

    let fullResponse = '';
    for await (const event of sdk.streamPrompt({ message: 'What is the current directory listing and total file count?' })) {
      if (event.type === 'tool_start') {
        console.log(`[Tool called: ${event.toolName}]`);
      } else if (event.type === 'tool_end') {
        console.log(`[Tool completed: ${event.toolName}]`);
      } else if (event.type === 'permission_request') {
        console.log(`[Permission request: ${event.tool}]`);
        // Auto-approve for this example
        await sdk.permissionResponse({ requestId: event.requestId, allowed: true });
      } else if (event.type === 'message_update') {
        process.stdout.write(event.delta);
        fullResponse += event.delta;
      } else if (event.type === 'message_end' && event.content) {
        fullResponse = event.content;
      }
    }

    console.log('\n=== Agent Response ===');
    console.log(fullResponse);

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
