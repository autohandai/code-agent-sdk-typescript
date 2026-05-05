/**
 * 13 Permissions - Demonstrating permission modes.
 *
 * This is adapted from the library SDK's 13-permissions-yolo example.
 * The tin-wrapper SDK communicates with the CLI via JSON-RPC over stdio.
 *
 * Demonstrates different permission modes and how to handle permission requests.
 *
 * Prerequisites:
 * - Autohand CLI must be installed and available in PATH
 * - CLI must be authenticated (run `autohand login` first)
 *
 * Usage:
 *   bun run examples/13-permissions.ts
 */

import { AutohandSDK } from '../src/index.js';
import type { PermissionMode } from '../src/types/index.js';

/**
 * Main function that demonstrates permission modes
 */
async function main(): Promise<void> {
  try {
    console.log('=== Permission Modes Demo ===\n');

    const permissionModes: PermissionMode[] = [
      'interactive',
      'restricted',
      'unrestricted',
    ];

    for (const mode of permissionModes) {
      console.log(`\n--- Testing ${mode} mode ---`);

      const sdk = new AutohandSDK({
        cliPath: '/Users/igorcosta/Documents/autohand/cli-3/autohand', // Use local development CLI
      });

      // Start the CLI subprocess
      await sdk.start();
      await sdk.setPermissionMode(mode);
      console.log(`✓ SDK started with permission mode: ${mode}`);

      // Send a prompt that requires permissions
      const prompt = 'List the files in the current directory';
      console.log(`\nSending prompt: "${prompt}"`);

      try {
        let fullResponse = '';
        for await (const event of sdk.streamPrompt({ message: prompt })) {
          if (event.type === 'tool_start') {
            console.log(`\n[Tool called: ${event.toolName}]`);
          } else if (event.type === 'tool_end') {
            console.log(`\n[Tool completed: ${event.toolName}]`);
            if (event.output) {
              console.log('  Output:', event.output.substring(0, 500));
              if (event.output.length > 500) console.log('  ... (truncated)');
            }
          } else if (event.type === 'permission_request') {
            console.log(`\n[Permission request: ${event.tool}]`);
            console.log(`  Description: ${event.description}`);
            console.log(`  Request ID: ${event.requestId}`);

            if (mode === 'interactive') {
              console.log('  Auto-approving for demo...');
              await sdk.allowPermission(event.requestId, 'once');
            }
          } else if (event.type === 'message_update') {
            process.stdout.write(event.delta);
            fullResponse += event.delta;
          } else if (event.type === 'message_end' && event.content) {
            fullResponse = event.content;
          }
        }
        console.log('\n✓ Prompt completed');
      } catch (error) {
        console.log(`\n✗ Prompt failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Stop the CLI subprocess
      await sdk.stop();
      console.log('✓ SDK stopped');
    }

    console.log('\n=== Demo Complete ===');
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main().catch(error => {
  // Exit with error code on failure
  process.exit(1);
});
