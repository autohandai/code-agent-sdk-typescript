/**
 * 03 Code Reviewer Agent - An agent that reads and analyzes files.
 *
 * This is adapted from the library SDK's 03-code-reviewer-agent example.
 * The tin-wrapper SDK communicates with the CLI via JSON-RPC over stdio.
 *
 * Give an agent file access tools and it can explore your codebase.
 *
 * Prerequisites:
 * - Autohand CLI must be installed and available in PATH
 * - CLI must be authenticated (run `autohand login` first)
 *
 * Usage:
 *   bun run examples/03-code-reviewer.ts
 */

import { AutohandSDK } from '../src/index.js';
import type { SDKEvent } from '../src/types/index.js';

/**
 * Main function that creates and runs a code reviewer agent
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

    // Send a prompt that requires file reading
    const prompt = 'What TypeScript files are in the current directory? Read each one and report any issues.';
    console.log(`Sending prompt: "${prompt}"\n`);

    let fullResponse = '';
    for await (const event of sdk.streamPrompt({ message: prompt })) {
      if (event.type === 'tool_start') {
        console.log(`[Tool called: ${event.toolName}]`);
      } else if (event.type === 'tool_end') {
        console.log(`[Tool completed: ${event.toolName}]`);
      } else if (event.type === 'permission_request') {
        console.log(`[Permission request: ${event.tool}]`);
        console.log(`  Description: ${event.description}`);
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
