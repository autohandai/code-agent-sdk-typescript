/**
 * Runtime error to pull request.
 *
 * This example shows how an application can capture a runtime error and ask
 * Autohand to fix it instead of only logging it. Point AUTOHAND_TARGET_REPO at
 * the application repository that should receive the branch, commit, push, and
 * pull request.
 *
 * Usage:
 *   AUTOHAND_CLI_PATH=/path/to/autohand AUTOHAND_TARGET_REPO=/path/to/app bun run examples/26-runtime-error-to-pr.ts
 */

import { Agent } from '../src/index.js';

const cliPath = process.env.AUTOHAND_CLI_PATH;
const targetRepo = process.env.AUTOHAND_TARGET_REPO ?? '.';
const timeout = Number(process.env.AUTOHAND_TIMEOUT_MS ?? 300000);

function checkoutDiscount(cart: { subtotal: number; customer?: { loyaltyTier?: string } }): number {
  try {
    if (cart.customer!.loyaltyTier === 'gold') {
      return cart.subtotal * 0.15;
    }

    return cart.subtotal * 0.05;
  } catch (error) {
    throw new Error(`checkout discount failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function captureRuntimeError(): string {
  try {
    checkoutDiscount({
      subtotal: 129,
      // In the real app this value came from an older mobile client payload.
      customer: undefined,
    });
  } catch (error) {
    return error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
  }

  return [
    'TypeError: Cannot read properties of undefined (reading "loyaltyTier")',
    '    at checkoutDiscount (src/checkout/discounts.ts:42:21)',
    '    at createCheckoutSession (src/checkout/session.ts:88:18)',
    'Request: POST /checkout',
    'Payload: {"subtotal":129,"customer":null}',
  ].join('\n');
}

async function main(): Promise<void> {
  const capturedError = captureRuntimeError();

  const agent = await Agent.create({
    cwd: targetRepo,
    ...(cliPath !== undefined && cliPath !== '' ? { cliPath } : {}),
    model: process.env.AUTOHAND_MODEL,
    timeout,
    instructions: [
      'You are a QA engineering agent that turns production error reports into small repair pull requests.',
      'Reproduce the failure when the repository makes that possible.',
      'Fix the root cause, add or update a focused regression test, run the relevant validation command, commit the fix, push a branch, and create a pull request.',
      'Keep the pull request description concise and include the error signature, the fix summary, and the validation result.',
    ].join('\n'),
  });

  try {
    const run = await agent.send([
      'A runtime error was captured by the application error boundary.',
      'Use this error report to repair the application automatically.',
      '',
      'Captured error:',
      '```text',
      capturedError,
      '```',
      '',
      'Expected user impact:',
      'A checkout session should still calculate a safe default discount when the customer object is missing.',
      '',
      'Please create a pull request with the fix.',
    ].join('\n'));

    for await (const event of run.stream()) {
      switch (event.type) {
        case 'message_update':
          process.stdout.write(event.delta);
          break;
        case 'tool_start':
          console.log(`\n[tool] ${event.toolName}`);
          break;
        case 'permission_request':
          console.log(`\n[permission] ${event.tool}: ${event.description}`);
          break;
        case 'error':
          console.error(`\n[error] ${event.message}`);
          break;
      }
    }

    const result = await run.wait();
    console.log(`\n\nRun ${result.id} ${result.status}.`);
  } finally {
    await agent.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
