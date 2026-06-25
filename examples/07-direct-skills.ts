/**
 * 07 Direct Skills - Skills provided directly via SDK with file paths.
 *
 * This example shows how to provide skills directly to the SDK, including
 * custom skill files from local paths. The SDK automatically copies skill
 * files to the appropriate directory and passes them to the CLI.
 *
 * Prerequisites:
 * - Autohand CLI must be installed and available in PATH
 * - AUTOHAND_AI_API_KEY must be set for Autohand AI SDK Cloud usage
 * - Optional: Create a custom skill file at ./skills/my-custom/SKILL.md
 *
 * Usage:
 *   bun run examples/07-direct-skills.ts
 */

import { AutohandSDK } from '../src/index.js';
import type { SDKEvent, SkillReference } from '../src/types/index.js';

/**
 * Main function that creates an agent with direct skill configuration
 */
async function main(): Promise<void> {
  try {
    console.log('Initializing Autohand SDK with direct skills...\n');

    // Define skills - mix of built-in names and file paths
    const skills: SkillReference[] = [
      'typescript',                                    // Built-in skill
      'testing',                                       // Built-in skill
      // File paths are auto-detected by containing '/' or '.md'
      // './skills/my-custom/SKILL.md',                // Uncomment if you have this file
      // '../shared-skills/code-review/SKILL.md',      // Relative path to shared skills
      // {                                              // Object form for explicit control
      //   name: 'custom-api',
      //   path: '/path/to/SKILL.md',
      //   scope: 'project'
      // }
    ];

    // Initialize SDK with direct skill configuration
    const sdk = new AutohandSDK({
      cwd: process.cwd(),
      provider: 'autohandai',
      model: 'fantail',
      apiKey: process.env.AUTOHAND_AI_API_KEY,
      cliPath: '/Users/igorcosta/Documents/autohand/cli-3/autohand',
      skills, // SDK auto-detects file paths and copies them to ~/.autohand/skills/
    });

    // Start the CLI subprocess
    await sdk.start();
    console.log('✓ SDK started');
    console.log('✓ Skills loaded:', skills.join(', '));
    console.log('');

    // Send a prompt - skills are already loaded, no prompt mention needed
    const prompt = 'Review this codebase and suggest improvements.';
    console.log(`Sending prompt: "${prompt}"\n`);
    console.log('(Skills are pre-loaded and available to the agent)\n');

    // Stream the response
    for await (const event of sdk.streamPrompt({ message: prompt })) {
      handleEvent(event);
    }

    console.log('\n✓ SDK stopped');
    await sdk.stop();
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Handle streaming events from the agent
 */
function handleEvent(event: SDKEvent): void {
  switch (event.type) {
    case 'agent_start':
      console.log(`[Agent started: ${event.sessionId}]`);
      console.log(`  Model: ${event.model}`);
      break;
    case 'tool_start':
      console.log(`\n[Tool called: ${event.toolName}]`);
      break;
    case 'tool_update':
      process.stdout.write(event.output);
      break;
    case 'tool_end':
      console.log(`[Tool completed: ${event.toolName}]`);
      break;
    case 'permission_request':
      console.log(`\n[Permission request: ${event.tool}]`);
      console.log(`  Description: ${event.description}`);
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
    case 'agent_end':
      console.log('\n[Agent ended]');
      break;
    case 'error':
      console.error(`\n[Error: ${event.message}]`);
      break;
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
