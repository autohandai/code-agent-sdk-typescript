/**
 * Basic usage example for Autohand SDK
 */

import { AutohandSDK } from '../src/index.js';

async function main() {
  // Create SDK instance
  const sdk = new AutohandSDK({
    cliPath: '/Users/igorcosta/Documents/autohand/cli-3/autohand', // Use local development CLI
    debug: false,
  });

  try {
    // Start the SDK
    await sdk.start();
    console.log('SDK started');

    // Send a prompt and stream the response
    console.log('Sending prompt: "Hello, Autohand!"\n');
    for await (const event of sdk.streamPrompt({ message: 'Hello, Autohand!' })) {
      if (event.type === 'message_update') {
        process.stdout.write(event.delta);
      } else if (event.type === 'message_end') {
        console.log('\n');
      }
    }

    console.log('Prompt completed');

    // Get state
    const state = await sdk.getState();
    console.log('Current state:', state);

    // Get messages
    const messages = await sdk.getMessages();
    console.log('Messages:', messages.length);

    // Stop the SDK
    await sdk.stop();
    console.log('SDK stopped');
  } catch (error) {
    console.error('Error:', error);
    await sdk.stop();
    process.exit(1);
  }
}

main();
