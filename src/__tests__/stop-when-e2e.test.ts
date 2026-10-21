import { afterEach, describe, expect, it } from 'bun:test';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AutohandSDK,
  Agent,
  hasToolCall,
  isStepCount,
} from '../index.js';

const temporaryDirectories: string[] = [];

async function createStepControlCli(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'autohand-stop-when-'));
  temporaryDirectories.push(directory);
  const cliPath = join(directory, 'fake-step-control-cli.cjs');
  await writeFile(cliPath, `#!/usr/bin/env node
const readline = require('node:readline');
const lines = readline.createInterface({ input: process.stdin });
let promptRequest;
let decisionCount = 0;
let cancelled = false;
const write = value => process.stdout.write(JSON.stringify(value) + '\\n');
const notify = (method, params) => write({ jsonrpc: '2.0', method, params });

(async () => {
  for await (const line of lines) {
    const request = JSON.parse(line);
    if (request.method === 'autohand.abort') {
      cancelled = true;
      write({ jsonrpc: '2.0', id: request.id, result: { success: true } });
      notify('autohand.messageUpdate', { delta: 'Cancelled', timestamp: 't2' });
      notify('autohand.turnEnd', { turnId: 'turn-1', reason: 'aborted', timestamp: 't3' });
      continue;
    }
    if (request.method === 'autohand.prompt') {
      promptRequest = request;
      write({ jsonrpc: '2.0', id: request.id, result: { success: true } });
      if (request.params.message === 'After cancellation') {
        notify('autohand.messageEnd', { content: 'Decisions: ' + decisionCount, timestamp: 't4' });
        notify('autohand.turnEnd', { turnId: 'turn-2', reason: 'completed', timestamp: 't5' });
        continue;
      }
      notify('autohand.turnStart', {
        turnId: 'turn-1',
        timestamp: '2026-07-29T00:00:00.000Z',
      });
      notify('autohand.stepEnd', {
        stepId: 'step-1',
        step: {
          stepNumber: 1,
          thought: 'Inspect the entrypoint.',
          toolCalls: [{
            id: 'tool-1',
            tool: 'read_file',
            args: { path: 'src/index.ts' },
          }],
          toolResults: [{
            tool: 'read_file',
            success: true,
            output: 'export const ready = true;',
          }],
        },
        timestamp: '2026-07-29T00:00:01.000Z',
      });
      continue;
    }

    if (request.method === 'autohand.stepDecision') {
      decisionCount += 1;
      if (cancelled) {
        write({ jsonrpc: '2.0', id: request.id, result: { success: false } });
        continue;
      }
      const validPrompt = ['Inspect one step', 'Inspect two steps'].includes(
        promptRequest?.params?.message
      ) && promptRequest?.params?.stopWhen?.mode === 'host';
      const expectedStop = promptRequest?.params?.message === 'Inspect one step'
        || decisionCount === 2;
      const validDecision = request.params?.stepId === 'step-' + decisionCount
        && request.params?.stop === expectedStop;
      if (!validPrompt || !validDecision) {
        write({
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32602, message: 'invalid step-control handshake' },
        });
        continue;
      }

      write({ jsonrpc: '2.0', id: request.id, result: { success: true } });
      if (!request.params.stop) {
        notify('autohand.stepEnd', {
          stepId: 'step-2',
          step: {
            stepNumber: 2,
            thought: 'Inspect the exports.',
            toolCalls: [{
              id: 'tool-2',
              tool: 'read_file',
              args: { path: 'src/sdk/agent.ts' },
            }],
            toolResults: [{
              tool: 'read_file',
              success: true,
              output: 'export class Agent {}',
            }],
          },
          timestamp: '2026-07-29T00:00:02.000Z',
        });
        continue;
      }
      notify('autohand.messageEnd', {
        messageId: 'message-1',
        content: '',
        timestamp: '2026-07-29T00:00:03.000Z',
      });
      notify('autohand.turnEnd', {
        turnId: 'turn-1',
        reason: 'stop_condition',
        timestamp: '2026-07-29T00:00:04.000Z',
      });
    }
  }
})();
`);
  await chmod(cliPath, 0o755);
  return cliPath;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe('stopWhen process contract', () => {
  for (const resolution of ['never', 'late success', 'late rejection'] as const) {
    it(`aborts a pending condition with ${resolution} and releases the next prompt`, async () => {
      const cliPath = await createStepControlCli();
      const agent = await Agent.create({ cliPath, timeout: 2_000 });
      let entered = (): void => {};
      const conditionEntered = new Promise<void>((resolve) => { entered = resolve; });
      let resolveCondition = (_value: boolean): void => {};
      let rejectCondition = (_reason: Error): void => {};
      const condition = new Promise<boolean>((resolve, reject) => {
        resolveCondition = resolve;
        rejectCondition = reject;
      });
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        const run = await agent.send('Inspect one step', {
          stopWhen: () => { entered(); return condition; },
        });
        const result = run.wait();
        void result.catch(() => undefined);
        await conditionEntered;
        const nextRun = await agent.send('After cancellation');
        const nextResult = nextRun.wait();
        void nextResult.catch(() => undefined);
        await run.abort();
        const aborted = await Promise.race([
          result,
          new Promise<never>((_resolve, reject) => {
            deadline = setTimeout(() => reject(new Error('Abort did not settle the run')), 1_000);
          }),
        ]);
        expect(aborted.status).toBe('aborted');
        expect(aborted.events.map((event) => event.type)).toEqual([
          'turn_start', 'step_end', 'message_update', 'agent_end',
        ]);
        if (resolution === 'late success') resolveCondition(true);
        if (resolution === 'late rejection') rejectCondition(new Error('Late predicate failure'));
        expect((await nextResult).text).toBe('Decisions: 0');
        expect((await agent.run('After cancellation')).text).toBe('Decisions: 0');
      } finally {
        if (deadline !== undefined) clearTimeout(deadline);
        await agent.close();
      }
    });
  }

  it('stops through the real RPC process after the first completed tool step', async () => {
    const cliPath = await createStepControlCli();
    const sdk = new AutohandSDK({ cliPath, timeout: 10_000 });
    await sdk.start();

    try {
      const events = [];
      for await (const event of sdk.streamPrompt({
        message: 'Inspect one step',
        stopWhen: isStepCount(1),
      })) {
        events.push(event);
      }

      const stepEnd = events.find((event) => event.type === 'step_end');
      expect(stepEnd?.type).toBe('step_end');
      if (stepEnd?.type === 'step_end') {
        expect(stepEnd.step.stepNumber).toBe(1);
      }
      const agentEnd = events.find((event) => event.type === 'agent_end');
      expect(agentEnd?.type).toBe('agent_end');
      if (agentEnd?.type === 'agent_end') {
        expect(agentEnd.reason).toBe('stopped');
      }
    } finally {
      await sdk.close();
    }
  });

  it('supports custom and built-in tool-call predicates', async () => {
    const step = {
      stepNumber: 1,
      toolCalls: [{
        id: 'tool-1',
        tool: 'read_file',
        args: { path: 'src/index.ts' },
      }],
      toolResults: [],
    };

    await expect(hasToolCall(' read_file ')({ steps: [step] })).resolves.toBe(true);
    await expect(hasToolCall('write_file')({ steps: [step] })).resolves.toBe(false);
    let error: unknown;
    try {
      isStepCount(0);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(RangeError);
    expect((error as Error).message).toContain('positive integer');
  });

  it('continues after a false decision and stops at the next boundary', async () => {
    const cliPath = await createStepControlCli();
    const sdk = new AutohandSDK({ cliPath, timeout: 10_000 });
    await sdk.start();

    try {
      const steps: number[] = [];
      for await (const event of sdk.streamPrompt({
        message: 'Inspect two steps',
        stopWhen: isStepCount(2),
      })) {
        if (event.type === 'step_end') {
          steps.push(event.step.stepNumber);
        }
      }

      expect(steps).toEqual([1, 2]);
    } finally {
      await sdk.close();
    }
  });

  it('stops the CLI before surfacing a predicate failure', async () => {
    const cliPath = await createStepControlCli();
    const sdk = new AutohandSDK({ cliPath, timeout: 10_000 });
    await sdk.start();

    try {
      const consume = async (): Promise<void> => {
        for await (const event of sdk.streamPrompt({
          message: 'Inspect one step',
          stopWhen: async () => {
            throw new Error('condition exploded');
          },
        })) {
          // Consume through the terminal event before the predicate error surfaces.
          void event;
        }
      };

      await expect(consume()).rejects.toThrow('condition exploded');
    } finally {
      await sdk.close();
    }
  });
});
