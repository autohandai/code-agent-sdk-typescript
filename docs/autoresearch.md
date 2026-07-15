# Replayable Autoresearch Ledger

The TypeScript SDK exposes Autohand's replayable autoresearch engine through
typed JSON-RPC methods. An autoresearch session proposes focused code changes,
measures them repeatedly, records immutable candidate/evaluation/decision
history, and keeps only accepted candidates in the Git lineage.

Rejected and inconclusive candidates leave the working tree but remain
replayable while their artifacts are retained. Replay and rescore append records;
they never rewrite the original decision or automatically commit a candidate.

See [`examples/27-autoresearch-ledger.ts`](../examples/27-autoresearch-ledger.ts)
for a complete runnable program.

## Prerequisites

A new replayable session requires:

- `@autohandai/agent-sdk` 1.0.2 or newer and a CLI binary with autoresearch RPC support.
- A Git repository root with at least one commit.
- A clean working tree. Internal `.auto/` state is excluded, but unrelated tracked,
  untracked, or submodule changes block baseline capture.
- A benchmark that runs without user input and emits the metric contract below.
- A configured Autohand provider for the autonomous experiment loop.

Use `await agent.supportsCommand('/autoresearch')` when your application may
connect to older CLI binaries.

## Metric contract

Every benchmark invocation must emit exactly one finite value for the primary
objective and every secondary objective:

```text
METRIC test_ms=<number>
METRIC build_ms=<number>
```

Other benchmark output is allowed. Missing, duplicate, `NaN`, or infinite values
fail the evaluation. Hard constraints must reference the primary objective or a
declared secondary objective.

This evaluator measures tests and builds, then emits both configured values:

```typescript
const measureScript = [
  'set -euo pipefail',
  'now_ms() { bun -e \'process.stdout.write(String(Date.now()))\'; }',
  'test_started="$(now_ms)"',
  'bun run test',
  'test_finished="$(now_ms)"',
  'build_started="$(now_ms)"',
  'bun run build',
  'build_finished="$(now_ms)"',
  'printf \'METRIC test_ms=%s\\n\' "$((test_finished - test_started))"',
  'printf \'METRIC build_ms=%s\\n\' "$((build_finished - build_started))"',
].join('\n');
```

Use `measureScript` for a frozen, explicit evaluator. `measureCommand` is a
convenience when one command already prints every required metric. The same
choice exists for correctness checks through `checksScript` and `checksCommand`.

## Start and drive the experiment loop

`startAutoresearch` persists the configuration, captures the sampled zero-diff
baseline, and returns the instruction for the autonomous loop. The host must send
that instruction to the agent; the typed start call alone does not propose code
changes.

```typescript
import { Agent } from '@autohandai/agent-sdk';

const agent = await Agent.create({
  cwd: '/path/to/clean/repository',
  permissionMode: 'unrestricted',
  instructions: 'Do not push branches or create pull requests.',
});

const started = await agent.startAutoresearch({
  objective: 'Reduce test runtime without breaking validation',
  metricName: 'test_ms',
  metricUnit: 'ms',
  direction: 'lower',
  measureScript,
  checksCommand: 'bun run typecheck && bun run lint',
  maxIterations: 3,
  timeoutMs: 600_000,
  filesInScope: ['src', 'tests', 'package.json', 'bun.lock'],
  secondaryObjectives: [
    { name: 'build_ms', unit: 'ms', direction: 'lower' },
  ],
  constraints: [
    { metricName: 'build_ms', operator: '<=', threshold: 600_000 },
  ],
  sampling: {
    minSamples: 3,
    maxSamples: 9,
    confidenceThreshold: 2,
  },
  retention: {
    maxArtifactBytes: 500_000_000,
    maxArtifactAgeDays: 30,
  },
  environmentAllowlist: ['CI'],
});

if (!started.success || !started.instruction) {
  throw new Error(started.error ?? 'Autoresearch did not return a loop instruction.');
}

const run = await agent.send(started.instruction);
for await (const event of run.stream()) {
  if (event.type === 'message_update') {
    process.stdout.write(event.delta);
  }
}
await run.wait();
```

`permissionMode: 'unrestricted'` is appropriate only for a repository where you
intend to permit autonomous local edits, benchmark commands, and accepted
candidate commits. Use your normal interactive permission policy when a host can
answer permission requests.

Calling `startAutoresearch` for an existing paused session resumes its persisted
configuration. It does not silently replace the existing evaluator or policy.

## Adaptive decisions

The default engine starts with three samples and adds samples one at a time up to
nine. It aggregates every objective with the median and median absolute deviation
(MAD). Automatic acceptance requires all hard constraints to pass conservatively
and primary confidence of at least `2.0` by default.

The possible outcomes are:

- `accepted` — the candidate remains materialized and the autonomous loop may commit it.
- `rejected` — a constraint conclusively failed or the primary metric regressed.
- `inconclusive` — noise still overlaps at the sample limit.
- `checks_failed` — the correctness command failed.
- `crashed` — benchmark or candidate execution failed.

Secondary objectives influence Pareto analysis but do not independently control
automatic acceptance unless they are also hard constraints.

## Status and history

```typescript
const status = await agent.getAutoresearchStatus();
if (!status.success) throw new Error(status.error);

const history = await agent.getAutoresearchHistory();
if (!history.success) throw new Error(history.error);

for (const attempt of history.attempts) {
  console.log({
    attemptId: attempt.attemptId,
    decision: attempt.latestDecision?.outcome,
    confidence: attempt.latestDecision?.confidence,
    replayable: attempt.replayable,
    materialization: attempt.materialization,
    drift: attempt.latestEvaluation?.driftWarnings,
  });
}
```

`legacy: true` means the attempt came from the compatibility `.auto/log.jsonl`
projection and has no candidate object. Such attempts remain visible but are not
replayable. The append-only ledger is stored under `.auto/ledger/`; applications
should use the SDK records rather than editing its JSONL or objects directly.

## Replay

Replay reconstructs a candidate in a detached temporary Git worktree and leaves
the caller's branch and working tree unchanged.

The frozen original evaluator is the default:

```typescript
const original = await agent.replayAutoresearch({
  attemptId,
  evaluator: 'original',
});
if (!original.success) throw new Error(original.error);
console.log(original.samples, original.decision, original.driftWarnings);
```

Use the current evaluator to measure the stored candidate against the session's
current benchmark and policy configuration:

```typescript
const current = await agent.replayAutoresearch({
  attemptId,
  evaluator: 'current',
});
if (!current.success) throw new Error(current.error);
```

An original replay freezes evaluator scripts and configuration, but does not
restore arbitrary environment variables. Both modes record safe environment
compatibility warnings. Only explicitly allowlisted, non-secret variables are
fingerprinted; secret-like environment names are rejected.

## Rescore

Rescoring applies the current deterministic policy to stored measurements without
running the benchmark:

```typescript
const one = await agent.rescoreAutoresearch({ attemptId });
if (!one.success) throw new Error(one.error);

const all = await agent.rescoreAutoresearch({ all: true });
if (!all.success) throw new Error(all.error);
```

Each call appends decision records. A new `accepted` rescore does not commit,
checkout, or otherwise promote a previously rejected candidate.

## Compare and Pareto analysis

```typescript
const comparison = await agent.compareAutoresearch({
  leftAttemptId: candidateAttemptId,
  rightAttemptId: baselineAttemptId,
});
if (!comparison.success) throw new Error(comparison.error);
console.dir(comparison.comparison, { depth: 4 });

const pareto = await agent.getAutoresearchPareto();
if (!pareto.success) throw new Error(pareto.error);
console.log(pareto.attemptIds);
```

Comparison returns raw samples, median/MAD aggregates, checks, execution outcomes,
and the latest decision for both sides. Pareto results contain non-dominated,
constraint-passing candidate IDs and are advisory; they are not committed winners.

## Pin and prune artifacts

Pin replay artifacts that must survive automatic retention:

```typescript
await agent.pinAutoresearch({ attemptId, pinned: true });
await agent.pinAutoresearch({ attemptId, pinned: false });
```

Pruning always previews unless deletion is explicitly confirmed:

```typescript
const preview = await agent.pruneAutoresearch({ dryRun: true });
console.table(preview.candidates);

// Apply only after presenting and approving the exact preview.
const applied = await agent.pruneAutoresearch({ dryRun: false, yes: true });
```

Automatic retention removes only unpinned rejected or inconclusive bulky objects,
oldest first. Accepted and pinned artifacts require explicit prune confirmation.
Candidate/evaluation/decision metadata remains permanent, and an
`artifact_pruned` record explains why an attempt is no longer replayable.

## Typed events

`SDKEvent` includes lifecycle events and `AutoresearchOperationEvent`. Both use
`type: 'autoresearch'`, so narrow operation notifications with the `operation`
property:

```typescript
import type {
  AutoresearchOperationEvent,
  SDKEvent,
} from '@autohandai/agent-sdk';

function handleEvent(event: SDKEvent): void {
  if (event.type !== 'autoresearch') return;

  if ('operation' in event) {
    const operationEvent: AutoresearchOperationEvent = event;
    console.log(operationEvent.operation, operationEvent.phase);
    return;
  }

  console.log(event.phase, event.statusText);
}
```

Apply the handler to events from `run.stream()` during the autonomous loop or
`sdk.events()` when using the low-level `AutohandSDK` API.

## Stop and clean up

Stopping pauses the loop without deleting `.auto/` or ledger history:

```typescript
try {
  // Start, run, and inspect autoresearch.
} finally {
  await agent.stopAutoresearch();
  await agent.close();
}
```

All methods in this guide are also available directly on `AutohandSDK` after
`await sdk.start()`. `Agent` is recommended for application code because it pairs
the returned loop instruction with the normal `Run` lifecycle.

## API summary

| Method | Purpose |
| --- | --- |
| `startAutoresearch` | Initialize or resume a session and return its loop instruction. |
| `getAutoresearchStatus` | Read active state, progress, attempts, and Pareto IDs. |
| `stopAutoresearch` | Pause without deleting persisted state. |
| `getAutoresearchHistory` | List immutable attempts, replayability, and materialization. |
| `replayAutoresearch` | Re-evaluate a candidate in an isolated worktree. |
| `rescoreAutoresearch` | Append decisions from stored measurements and current policy. |
| `compareAutoresearch` | Compare samples, aggregates, checks, and decisions. |
| `getAutoresearchPareto` | List constraint-passing non-dominated attempts. |
| `pinAutoresearch` | Protect or release candidate artifacts. |
| `pruneAutoresearch` | Preview or explicitly apply artifact retention. |

See the complete type signatures in the [API reference](./API_REFERENCE.md#autoresearch-ledger).
