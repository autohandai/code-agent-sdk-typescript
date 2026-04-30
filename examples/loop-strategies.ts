/**
 * Loop Strategies - Different execution modes for the agent.
 *
 * This is adapted from the library SDK's loop-strategies examples.
 * The tin-wrapper SDK communicates with the CLI via JSON-RPC over stdio.
 *
 * Note: Loop strategies are configured on the CLI side. The tin-wrapper SDK
 * passes configuration to the CLI which handles the execution strategy.
 *
 * Available loop strategies (CLI-side):
 * - ReAct: Reason-Act loop (default)
 * - Plan-and-Execute: Plan first, then execute step-by-step
 * - Parallel: Execute tools in parallel when possible
 * - Reflexion: Self-reflective execution with error correction
 *
 * Prerequisites:
 * - Autohand CLI must be installed and available in PATH
 * - CLI must be authenticated (run `autohand login` first)
 *
 * Usage:
 *   bun run examples/loop-strategies.ts
 */

import { AutohandSDK } from '../src/index.js';
import type { SDKEvent } from '../src/types/index.js';

/**
 * Main function that demonstrates different execution strategies
 */
async function main(): Promise<void> {
  try {
    console.log('=== Loop Strategies Demo ===\n');
    console.log('Note: Loop strategies are configured on the CLI side.');
    console.log('The tin-wrapper SDK passes configuration to the CLI.\n');

    // Initialize SDK with configuration
    const sdk = new AutohandSDK({
      cliPath: '/Users/igorcosta/Documents/autohand/cli-3/autohand', // Use local development CLI
      // Execution modes can be configured via CLI flags or config
      // For example, use --loop-type plan-execute when starting the CLI
    });

    // Start the CLI subprocess
    await sdk.start();
    console.log('✓ SDK started\n');

    // Send a prompt that demonstrates the execution strategy
    const prompt = 'List all TypeScript files in the current directory and read each one. Summarize the codebase.';
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

    console.log('\n=== To use different loop strategies ===');
    console.log('Configure the CLI with appropriate flags or config:');
    console.log('  - ReAct (default): Standard reasoning loop');
    console.log('  - Plan-and-Execute: Plan first, then execute');
    console.log('  - Parallel: Execute tools in parallel');
    console.log('  - Reflexion: Self-reflective execution');
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main().catch(error => {
  // Exit with error code on failure
  process.exit(1);
});
