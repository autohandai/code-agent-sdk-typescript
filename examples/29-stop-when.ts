/**
 * Pause an agent after one completed tool step, inspect the step, then continue
 * the same session.
 *
 * Usage:
 *   AUTOHAND_CLI_PATH=/path/to/autohand bun run examples/29-stop-when.ts
 */

import { Agent, isStepCount } from '@autohandai/agent-sdk';

const cliPath = process.env.AUTOHAND_CLI_PATH;
const model = process.env.AUTOHAND_MODEL;

async function main(): Promise<void> {
  const agent = await Agent.create({
    cwd: '.',
    ...(cliPath !== undefined && cliPath !== '' ? { cliPath } : {}),
    ...(model !== undefined && model !== '' ? { model } : {}),
    permissionMode: 'yolo',
    instructions: [
      'Inspect the repository with tools before answering.',
      'Use read_file for local files; do not use browser tools.',
      'Keep every change explicit and testable.',
    ].join('\n'),
  });

  try {
    const inspected = await agent.run(
      'Use read_file exactly once to inspect package.json, then explain the package name.',
      { stopWhen: isStepCount(1) }
    );

    if (inspected.status !== 'stopped') {
      throw new Error(`Expected a stopped run, received ${inspected.status}.`);
    }

    const [step] = inspected.steps;
    if (step === undefined) {
      throw new Error('The stopped run did not include its completed step.');
    }

    console.log(`Paused after step ${step.stepNumber}.`);
    console.log(`Tools: ${step.toolCalls.map((call) => call.tool).join(', ')}`);

    const completed = await agent.run(
      'Continue from the inspected tool result and give the concise answer.'
    );
    console.log(completed.text);
  } finally {
    await agent.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
