/**
 * 05 File Editor Agent - Agent that reads and edits files.
 *
 * This is adapted from the library SDK's 05-file-editor-agent example.
 * The tin-wrapper SDK communicates with the CLI via JSON-RPC over stdio.
 *
 * Uses EDIT_FILE for surgical find-and-replace changes.
 *
 * Prerequisites:
 * - Autohand CLI must be installed and available in PATH
 * - CLI must be authenticated (run `autohand login` first)
 *
 * Usage:
 *   bun run examples/05-file-editor.ts
 */

import { AutohandSDK } from '../src/index.js';
import type { SDKEvent } from '../src/types/index.js';

/**
 * Main function that creates and runs a file editor agent
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

    // Send a prompt that requires file editing
    const prompt = 'Read README.md and fix any obvious typos in comments.';
    console.log(`Sending prompt: "${prompt}"\n`);

    let fullResponse = '';
    for await (const event of sdk.streamPrompt({ message: prompt })) {
      if (event.type === 'tool_start') {
        console.log(`[Tool called: ${event.toolName}]`);
      } else if (event.type === 'tool_update') {
        // Show tool output (file contents, command output, etc.)
        process.stdout.write(event.output);
      } else if (event.type === 'tool_end') {
        console.log(`[Tool completed: ${event.toolName}]`);
        if (event.output) {
          console.log('Output:');
          console.log(event.output.substring(0, 1000));
          if (event.output.length > 1000) console.log('... (truncated)');
        }
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
