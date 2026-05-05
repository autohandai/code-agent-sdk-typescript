/**
 * 10 Multi-Tool Reasoning - Using multiple tools across turns.
 *
 * This is adapted from the library SDK's 10-multi-tool-reasoning example.
 * The tin-wrapper SDK communicates with the CLI via JSON-RPC over stdio.
 *
 * Demonstrates an agent that uses READ_FILE and BASH together across
 * multiple turns to understand code, run tests, and report a summary.
 * Shows the ReAct loop with multi-tool turns.
 *
 * Prerequisites:
 * - Autohand CLI must be installed and available in PATH
 * - CLI must be authenticated (run `autohand login` first)
 *
 * Usage:
 *   bun run examples/10-multi-tool-reasoning.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AutohandSDK } from '../src/index.js';
import type { SDKEvent } from '../src/types/index.js';

/**
 * Main function that demonstrates multi-tool reasoning
 */
async function main(): Promise<void> {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-tool-example-'));

  try {
    // Create a small project with a module and a test
    fs.writeFileSync(
      path.join(tmpdir, 'math-utils.ts'),
      `export function fibonacci(n: number): number {
  /** Return the nth Fibonacci number. */
  if (n <= 0) return 0;
  if (n === 1) return 1;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}

export function factorial(n: number): number {
  /** Return n factorial. */
  if (n < 0) {
    throw new Error("factorial undefined for negative numbers");
  }
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}
`
    );
    fs.writeFileSync(
      path.join(tmpdir, 'test-math-utils.ts'),
      `import { fibonacci, factorial } from "./math-utils";

function testFibonacci(): void {
  console.assert(fibonacci(0) === 0);
  console.assert(fibonacci(1) === 1);
  console.assert(fibonacci(5) === 5);
  console.assert(fibonacci(10) === 55);
  console.log("Fibonacci tests passed");
}

function testFactorial(): void {
  console.assert(factorial(0) === 1);
  console.assert(factorial(5) === 120);
  console.assert(factorial(10) === 3628800);
  console.log("Factorial tests passed");
}

testFibonacci();
testFactorial();
`
    );
    fs.writeFileSync(
      path.join(tmpdir, 'package.json'),
      `{ "name": "test-project", "type": "module" }\n`
    );

    console.log('=== Multi-Tool Reasoning Demo ===\n');
    console.log(`Created test project in: ${tmpdir}\n`);

    // Initialize SDK with configuration
    const sdk = new AutohandSDK({
      cliPath: '/Users/igorcosta/Documents/autohand/cli-3/autohand', // Use local development CLI
    });

    // Start the CLI subprocess
    await sdk.start();
    console.log('✓ SDK started\n');

    // Agent-based approach: READ_FILE + BASH across turns
    console.log('=== Agent-based multi-tool approach ===');
    const oldCwd = process.cwd();
    process.chdir(tmpdir);
    try {
      const prompt = 'First, glob for all TypeScript files in this directory. Then read each TypeScript file. Finally, run `bun run test-math-utils.ts` and report the test results. Summarize the codebase.';
      console.log(`Sending prompt: "${prompt}"\n`);

      let fullResponse = '';
      for await (const event of sdk.streamPrompt({ message: prompt })) {
        if (event.type === 'tool_start') {
          console.log(`[Tool called: ${event.toolName}]`);
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
    } finally {
      process.chdir(oldCwd);
    }

    // Stop the CLI subprocess
    await sdk.stop();
    console.log('\n✓ SDK stopped');
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  } finally {
    // Cleanup
    fs.rmSync(tmpdir, { recursive: true, force: true });
    console.log(`\n✓ Cleaned up test directory: ${tmpdir}`);
  }
}

main().catch(error => {
  // Exit with error code on failure
  process.exit(1);
});
