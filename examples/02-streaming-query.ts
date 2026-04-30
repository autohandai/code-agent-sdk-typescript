/**
 * 02 Streaming Query - See the agent response as it arrives.
 *
 * This is adapted from the library SDK's 02-streaming-query example.
 * The tin-wrapper SDK communicates with the CLI via JSON-RPC over stdio.
 *
 * Demonstrates real-time event streaming from agent execution.
 * Shows pattern matching for event handling and structured error handling.
 *
 * Prerequisites:
 * - Autohand CLI must be installed and available in PATH
 * - CLI must be authenticated (run `autohand login` first)
 *
 * Usage:
 *   bun run examples/02-streaming-query.ts
 */

import { AutohandSDK } from '../src/index.js';
import type { SDKEvent } from '../src/types/index.js';

/**
 * Pattern matching for stream events.
 * Makes illegal states unrepresentable and improves readability.
 */
function handleEvent(event: SDKEvent): void {
  switch (event.type) {
    case 'agent_start':
      console.log(`\n[Agent started: ${event.sessionId}]`);
      console.log(`  Model: ${event.model}`);
      break;
    case 'turn_start':
      console.log(`\n[Turn started: ${event.turnId}]`);
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
    case 'tool_start':
      console.log(`\n[Tool called: ${event.toolName}]`);
      break;
    case 'tool_end':
      console.log(`\n[Tool completed: ${event.toolName}]`);
      break;
    case 'permission_request':
      console.log(`\n[Permission request: ${event.tool}]`);
      console.log(`  Description: ${event.description}`);
      break;
    case 'turn_end':
      console.log('\n[Turn ended]');
      break;
    case 'agent_end':
      console.log('\n[Agent ended]');
      break;
    case 'error':
      console.error(`\n[Error: ${event.message}]`);
      break;
    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = event;
      break;
  }
}

/**
 * Structured error handling.
 */
function handleError(error: unknown): never {
  if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error(`Unknown error: ${String(error)}`);
  }
  process.exit(1);
}

/**
 * Main execution flow.
 * Clean separation of concerns with functional composition.
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

    // Execute with streaming
    console.log('Streaming response:\n');
    for await (const event of sdk.streamPrompt({ message: 'Explain closures in one sentence' })) {
      handleEvent(event);
    }

    // Stop the CLI subprocess
    await sdk.stop();
    console.log('\n✓ SDK stopped');
  } catch (error) {
    handleError(error);
  }
}

main();
