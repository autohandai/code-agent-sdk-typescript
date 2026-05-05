/**
 * 08 Memory Management - Demonstrates agent memory persistence across sessions.
 *
 * The Autohand CLI provides built-in memory tools (save_memory / recall_memory)
 * that agents can use to persist and retrieve facts, preferences, or context
 * across conversation turns and even across separate SDK sessions.
 *
 * This example shows:
 * - Prompting an agent to save information to memory
 * - Observing memory tool events in the event stream
 * - Starting a fresh session and prompting the agent to recall prior memory
 * - Inspecting context usage to see memory files loaded into the context window
 *
 * Prerequisites:
 * - Autohand CLI must be installed and available in PATH
 * - CLI must be authenticated (run `autohand login` first)
 *
 * Usage:
 *   bun run examples/08-memory-management.ts
 */

import { AutohandSDK } from '../src/index.js';

/**
 * Helper to stream events and collect the final message
 */
async function streamPromptWithLogging(
  sdk: AutohandSDK,
  prompt: string
): Promise<string> {
  console.log(`\n> ${prompt}\n`);

  let fullResponse = '';

  for await (const event of sdk.streamPrompt({ message: prompt })) {
    switch (event.type) {
      case 'tool_start': {
        console.log(`[Tool: ${event.toolName}]`);
        break;
      }
      case 'tool_update': {
        process.stdout.write(event.output);
        break;
      }
      case 'tool_end': {
        console.log(`\n[Tool completed: ${event.toolName}]`);
        if (event.output) {
          const preview = event.output.substring(0, 500);
          console.log(preview);
          if (event.output.length > 500) {
            console.log('... (truncated)');
          }
        }
        break;
      }
      case 'permission_request': {
        console.log(`[Permission request: ${event.tool}]`);
        console.log(`  Description: ${event.description}`);
        await sdk.permissionResponse({
          requestId: event.requestId,
          allowed: true,
        });
        break;
      }
      case 'message_update': {
        process.stdout.write(event.delta);
        fullResponse += event.delta;
        break;
      }
      case 'message_end': {
        if (event.content) {
          fullResponse = event.content;
        }
        break;
      }
      default: {
        // Ignore other event types for this example
        break;
      }
    }
  }

  console.log('\n');
  return fullResponse;
}

/**
 * Main function that demonstrates memory save and recall across sessions
 */
async function main(): Promise<void> {
  try {
    console.log('=== Autohand SDK Memory Management Example ===\n');

    // -------------------------------------------------------------------------
    // Phase 1: Save a preference to memory
    // -------------------------------------------------------------------------

    const saveSdk = new AutohandSDK({
      cliPath: '/Users/igorcosta/Documents/autohand/cli-3/autohand',
    });

    await saveSdk.start();
    console.log('✓ SDK started (save session)\n');

    const savePrompt =
      'Save this to memory: "The user prefers TypeScript over JavaScript ' +
      'and likes functional programming patterns."';

    await streamPromptWithLogging(saveSdk, savePrompt);

    // Inspect context usage to confirm memory is tracked
    const usageBefore = await saveSdk.getContextUsage();
    console.log('Context usage before stop:');
    console.log(`  memoryFiles: ${usageBefore.memoryFiles} files`);
    console.log(`  total:       ${usageBefore.total} tokens\n`);

    await saveSdk.stop();
    console.log('✓ SDK stopped (save session)\n');

    // -------------------------------------------------------------------------
    // Phase 2: Start a fresh session and recall the memory
    // -------------------------------------------------------------------------

    const recallSdk = new AutohandSDK({
      cliPath: '/Users/igorcosta/Documents/autohand/cli-3/autohand',
    });

    await recallSdk.start();
    console.log('✓ SDK started (recall session)\n');

    const recallPrompt =
      'Recall what you know about my programming preferences from memory. ' +
      'What language do I prefer and what style do I like?';

    await streamPromptWithLogging(recallSdk, recallPrompt);

    // Inspect context usage again — memory files may be loaded into context
    const usageAfter = await recallSdk.getContextUsage();
    console.log('Context usage after recall:');
    console.log(`  memoryFiles: ${usageAfter.memoryFiles} files`);
    console.log(`  total:       ${usageAfter.total} tokens\n`);

    await recallSdk.stop();
    console.log('✓ SDK stopped (recall session)');
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}

main().catch(() => {
  process.exit(1);
});
