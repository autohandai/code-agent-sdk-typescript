/**
 * Replayable autoresearch with the high-level Agent API.
 *
 * The target must be a clean Git repository with at least one commit and Bun
 * scripts named test, build, typecheck, and lint. The example permits autonomous
 * local edits and commits, but explicitly tells the agent not to push.
 *
 * Usage:
 *   AUTOHAND_TARGET_REPO=/path/to/project bun run examples/27-autoresearch-ledger.ts
 *
 * Optional:
 *   AUTOHAND_REPLAY_CURRENT=1      replay with both frozen and current evaluators
 *   AUTOHAND_CONFIRM_PRUNE=1       apply the displayed prune plan
 *   AUTOHAND_CLI_PATH=/path/to/cli use a custom CLI binary
 */

import {
  Agent,
  type AutoresearchOperationEvent,
  type SDKEvent,
} from '@autohandai/agent-sdk';

const cliPath = process.env.AUTOHAND_CLI_PATH;
const model = process.env.AUTOHAND_MODEL;
const targetRepository = process.env.AUTOHAND_TARGET_REPO ?? '.';

const measureScript = [
  'set -euo pipefail',
  '',
  'now_ms() {',
  "  bun -e 'process.stdout.write(String(Date.now()))'",
  '}',
  '',
  'test_started="$(now_ms)"',
  'bun run test',
  'test_finished="$(now_ms)"',
  '',
  'build_started="$(now_ms)"',
  'bun run build',
  'build_finished="$(now_ms)"',
  '',
  'printf \'METRIC test_ms=%s\\n\' "$((test_finished - test_started))"',
  'printf \'METRIC build_ms=%s\\n\' "$((build_finished - build_started))"',
].join('\n');

function requireSuccess(
  operation: string,
  result: { success: boolean; error?: string }
): void {
  if (!result.success) {
    throw new Error(`${operation} failed: ${result.error ?? 'unknown error'}`);
  }
}

function printAutoresearchEvent(event: SDKEvent): void {
  if (event.type !== 'autoresearch') return;

  if ('operation' in event) {
    const operationEvent: AutoresearchOperationEvent = event;
    console.log(
      `[ledger:${operationEvent.phase}] ${operationEvent.operation}`
      + (operationEvent.attemptId ? ` ${operationEvent.attemptId}` : '')
    );
    return;
  }

  console.log(`[autoresearch:${event.phase}] ${event.statusText}`);
}

async function main(): Promise<void> {
  const agent = await Agent.create({
    cwd: targetRepository,
    ...(cliPath !== undefined && cliPath !== '' ? { cliPath } : {}),
    ...(model !== undefined && model !== '' ? { model } : {}),
    permissionMode: 'unrestricted',
    timeout: 10 * 60_000,
    instructions: [
      'Keep each autoresearch candidate focused and inside the configured scope.',
      'Commit only candidates accepted by the deterministic decision engine.',
      'Do not push branches or create pull requests.',
    ].join('\n'),
  });

  let sessionStarted = false;

  try {
    if (!(await agent.supportsCommand('/autoresearch'))) {
      throw new Error('The connected Autohand CLI does not support /autoresearch.');
    }

    const started = await agent.startAutoresearch({
      objective: 'Reduce test runtime without regressing build time or validation',
      metricName: 'test_ms',
      metricUnit: 'ms',
      direction: 'lower',
      measureScript,
      checksCommand: 'bun run typecheck && bun run lint',
      maxIterations: 3,
      timeoutMs: 10 * 60_000,
      filesInScope: ['src', 'tests', 'package.json', 'bun.lock'],
      secondaryObjectives: [
        { name: 'build_ms', unit: 'ms', direction: 'lower' },
      ],
      constraints: [
        { metricName: 'build_ms', operator: '<=', threshold: 600_000 },
      ],
      sampling: { minSamples: 3, maxSamples: 9, confidenceThreshold: 2 },
      retention: { maxArtifactBytes: 500_000_000, maxArtifactAgeDays: 30 },
      environmentAllowlist: ['CI'],
    });
    requireSuccess('startAutoresearch', started);
    sessionStarted = true;

    if (started.instruction === undefined || started.instruction.trim() === '') {
      throw new Error('startAutoresearch succeeded without returning a loop instruction.');
    }

    // The typed start call persists configuration and captures the baseline. The
    // returned instruction drives the autonomous experiment loop.
    const run = await agent.send(started.instruction);
    for await (const event of run.stream()) {
      printAutoresearchEvent(event);
      if (event.type === 'message_update') {
        process.stdout.write(event.delta);
      } else if (event.type === 'tool_start') {
        console.log(`\n[tool] ${event.toolName}`);
      } else if (event.type === 'error') {
        console.error(`\n[error] ${event.message}`);
      }
    }

    const result = await run.wait();
    console.log(`\nAutoresearch run ${result.id} finished with status ${result.status}.`);

    const status = await agent.getAutoresearchStatus();
    requireSuccess('getAutoresearchStatus', status);
    console.log(status.statusText);

    const history = await agent.getAutoresearchHistory();
    requireSuccess('getAutoresearchHistory', history);
    console.table(history.attempts.map((attempt) => ({
      attemptId: attempt.attemptId,
      decision: attempt.latestDecision?.outcome ?? 'pending',
      replayable: attempt.replayable,
      materialization: attempt.materialization,
      pinned: attempt.pinned,
    })));

    const candidate = history.attempts.find((attempt) =>
      attempt.replayable && attempt.materialization !== 'baseline'
    );
    const reference = history.attempts.find((attempt) =>
      attempt.materialization === 'baseline'
    );

    if (candidate) {
      const originalReplay = await agent.replayAutoresearch({
        attemptId: candidate.attemptId,
        evaluator: 'original',
      });
      requireSuccess('replayAutoresearch(original)', originalReplay);
      console.log('Original replay drift:', originalReplay.driftWarnings ?? []);

      if (process.env.AUTOHAND_REPLAY_CURRENT === '1') {
        const currentReplay = await agent.replayAutoresearch({
          attemptId: candidate.attemptId,
          evaluator: 'current',
        });
        requireSuccess('replayAutoresearch(current)', currentReplay);
        console.log('Current replay drift:', currentReplay.driftWarnings ?? []);
      }

      const rescored = await agent.rescoreAutoresearch({
        attemptId: candidate.attemptId,
      });
      requireSuccess('rescoreAutoresearch', rescored);
      console.log('Appended rescore decisions:', rescored.decisions.length);

      if (reference && reference.attemptId !== candidate.attemptId) {
        const comparison = await agent.compareAutoresearch({
          leftAttemptId: candidate.attemptId,
          rightAttemptId: reference.attemptId,
        });
        requireSuccess('compareAutoresearch', comparison);
        console.dir(comparison.comparison, { depth: 4 });
      }

      const pinned = await agent.pinAutoresearch({
        attemptId: candidate.attemptId,
        pinned: true,
      });
      requireSuccess('pinAutoresearch', pinned);
    }

    const pareto = await agent.getAutoresearchPareto();
    requireSuccess('getAutoresearchPareto', pareto);
    console.log('Constraint-passing Pareto attempts:', pareto.attemptIds);

    const preview = await agent.pruneAutoresearch({ dryRun: true });
    requireSuccess('pruneAutoresearch(preview)', preview);
    console.table(preview.candidates);

    if (process.env.AUTOHAND_CONFIRM_PRUNE === '1') {
      const applied = await agent.pruneAutoresearch({ dryRun: false, yes: true });
      requireSuccess('pruneAutoresearch(apply)', applied);
      console.log(`Pruned ${applied.bytesFreed} bytes.`);
    }
  } finally {
    try {
      if (sessionStarted) {
        const stopped = await agent.stopAutoresearch();
        if (!stopped.success) {
          console.error(`stopAutoresearch failed: ${stopped.error ?? 'unknown error'}`);
        }
      }
    } finally {
      await agent.close();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
