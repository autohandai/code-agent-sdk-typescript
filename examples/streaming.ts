/**
 * Streaming example for Autohand SDK
 */

import { AutohandSDK } from '../src/index.js';

async function main() {
  const sdk = new AutohandSDK({
    cwd: process.cwd(),
    debug: true,
  });

  try {
    await sdk.start();
    console.log('SDK started');

    // Stream a prompt with events
    for await (const event of sdk.streamPrompt({
      message: 'Analyze the current directory structure',
    })) {
      switch (event.type) {
        case 'agent_start':
          console.log(`[Agent] Started: ${event.sessionId}`);
          break;
        case 'turn_start':
          console.log(`[Turn] Started: ${event.turnId}`);
          break;
        case 'message_start':
          console.log(`[Message] Started: ${event.messageId}`);
          break;
        case 'message_update':
          process.stdout.write(event.delta);
          break;
        case 'message_end':
          console.log('\n[Message] Completed');
          break;
        case 'tool_start':
          console.log(`[Tool] ${event.toolName} started`);
          break;
        case 'tool_end':
          console.log(`[Tool] ${event.toolName} completed: ${event.success ? 'success' : 'failed'}`);
          break;
        case 'agent_end':
          console.log(`[Agent] Ended: ${event.reason}`);
          break;
        case 'error':
          console.error(`[Error] ${event.message}`);
          break;
      }
    }

    await sdk.stop();
    console.log('SDK stopped');
  } catch (error) {
    console.error('Error:', error);
    await sdk.stop();
    process.exit(1);
  }
}

main();
