/**
 * Permission handling example for Autohand SDK
 */

import { AutohandSDK } from '../src/index.js';

async function main() {
  const sdk = new AutohandSDK({
    cliPath: '/Users/igorcosta/Documents/autohand/cli-3/autohand', // Use local development CLI
    debug: false,
  });

  try {
    await sdk.start();
    console.log('SDK started');

    // Start a prompt that might require permissions
    for await (const event of sdk.streamPrompt({ message: 'Create a new file called test.txt with some content' })) {
      if (event.type === 'permission_request') {
        console.log(`[Permission Request] ${event.description}`);
        console.log(`Tool: ${event.tool}`);

        // Auto-allow all permissions for this example
        await sdk.permissionResponse({
          requestId: event.requestId,
          allowed: true,
        });
      } else if (event.type === 'message_update') {
        process.stdout.write(event.delta);
      } else if (event.type === 'agent_end') {
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
