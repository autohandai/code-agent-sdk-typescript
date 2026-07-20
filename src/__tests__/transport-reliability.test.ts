import { afterEach, describe, expect, it } from 'bun:test';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { LineReader } from '../transport/line-reader.js';
import { Transport } from '../transport/transport.js';
import { AutohandSDK } from '../sdk/index.js';

const temporaryDirectories: string[] = [];

async function createFakeCli(pidFile?: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'autohand-ts-sdk-'));
  temporaryDirectories.push(directory);
  const cliPath = join(directory, 'fake-cli.cjs');
  const pidWrite = pidFile === undefined
    ? ''
    : `printf '%s\\n' "$$" >> ${JSON.stringify(pidFile)}`;
  await writeFile(cliPath, `#!/bin/sh
${pidWrite}
trap 'exit 0' TERM INT
while IFS= read -r line; do
  id=$(printf '%s\\n' "$line" | sed -E 's/.*"id":([0-9]+).*/\\1/')
  case "$line" in
    *'"method":"test.exit"'*) exit 17 ;;
    *'"method":"test.close_stdout"'*) exec 1>&-; sleep 5 ;;
    *'"method":"test.final_no_newline"'*)
      trap '' TERM
      printf '{"jsonrpc":"2.0","id":%s,"result":{"final":true}}' "$id"
      exec 1>&-
      sleep 5 ;;
    *'"method":"test.final_batch"'*)
      next_id=$((id + 1))
      printf '{"jsonrpc":"2.0","id":%s,"result":{"batch":1}}\\n' "$id"
      printf '{"jsonrpc":"2.0","id":%s,"result":{"batch":2}}' "$next_id"
      exec 1>&-
      sleep 5 ;;
    *'"method":"autohand.planModeSet"'*)
      printf '{"jsonrpc":"2.0","id":%s,"result":{"success":true}}' "$id"
      exec 1>&-
      sleep 5 ;;
    *'"method":"test.hang"'*) ;;
    *'"method":"test.malformed_error"'*)
      printf '{"jsonrpc":"2.0","id":%s,"error":null}\\n' "$id" ;;
    *'"method":"test.malformed"'*)
      printf 'not-json\\n'
      printf '{"jsonrpc":"2.0","id":%s,"result":{"method":"autohand.getState","env":"%s"}}\\n' "$id" "\${AUTOHAND_TEST_ENV:-}"
      ;;
    *) printf '{"jsonrpc":"2.0","id":%s,"result":{"method":"autohand.getState","env":"%s"}}\\n' "$id" "\${AUTOHAND_TEST_ENV:-}" ;;
  esac
done
`);
  await chmod(cliPath, 0o755);
  return cliPath;
}

async function createStreamingCli(): Promise<{ cliPath: string; completionFile: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'autohand-ts-streaming-'));
  temporaryDirectories.push(directory);
  const cliPath = join(directory, 'fake-streaming-cli');
  const completionFile = join(directory, 'completed.txt');
  await writeFile(cliPath, `#!/bin/sh
prompt_pid=""
trap 'test -z "$prompt_pid" || kill "$prompt_pid" 2>/dev/null; exit 0' TERM INT
while IFS= read -r line; do
  id=$(printf '%s\\n' "$line" | sed -E 's/.*"id":([0-9]+).*/\\1/')
  case "$line" in
    *'"method":"autohand.prompt"'*)
      printf '{"jsonrpc":"2.0","id":%s,"result":{"success":true}}\\n' "$id"
      case "$line" in
        *first*)
          (sleep 0.01
           printf '{"jsonrpc":"2.0","method":"autohand.messageUpdate","params":{"messageId":"old","delta":"old-partial","timestamp":"2026-07-20T00:00:00.000Z"}}\\n'
           sleep 1
           printf '{"jsonrpc":"2.0","method":"autohand.messageUpdate","params":{"messageId":"old","delta":"old-late","timestamp":"2026-07-20T00:00:01.000Z"}}\\n'
           printf '{"jsonrpc":"2.0","method":"autohand.turnEnd","params":{"turnId":"old","timestamp":"2026-07-20T00:00:02.000Z"}}\\n') & ;;
        *)
          (sleep 0.01
           printf '{"jsonrpc":"2.0","method":"autohand.messageUpdate","params":{"messageId":"new","delta":"second","timestamp":"2026-07-20T00:00:03.000Z"}}\\n'
           printf 'completed' > ${JSON.stringify(completionFile)}
           printf '{"jsonrpc":"2.0","method":"autohand.turnEnd","params":{"turnId":"new","timestamp":"2026-07-20T00:00:04.000Z"}}\\n') & ;;
      esac
      prompt_pid=$! ;;
    *'"method":"autohand.abort"'*)
      if test -n "$prompt_pid"; then
        kill "$prompt_pid" 2>/dev/null || true
        wait "$prompt_pid" 2>/dev/null || true
        prompt_pid=""
      fi
      printf '{"jsonrpc":"2.0","id":%s,"result":{"success":true}}\\n' "$id"
      printf '{"jsonrpc":"2.0","method":"autohand.turnEnd","params":{"turnId":"old","timestamp":"2026-07-20T00:00:02.000Z"}}\\n' ;;
    *) printf '{"jsonrpc":"2.0","id":%s,"result":{"status":"idle"}}\\n' "$id" ;;
  esac
done
`);
  await chmod(cliPath, 0o755);
  return { cliPath, completionFile };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe('transport reliability', () => {
  it('rejects a line waiter when the stream closes', async () => {
    const stream = new PassThrough();
    const reader = new LineReader(stream);
    const line = reader.readLine();
    stream.end();
    await expect(line).rejects.toThrow('Stream closed');
  });

  it('forwards generic environment variables and completes a first RPC', async () => {
    const cliPath = await createFakeCli();
    const transport = new Transport({
      cliPath,
      env: { AUTOHAND_TEST_ENV: 'forwarded' },
      timeout: 500,
    });
    await transport.start();
    await expect(transport.request('autohand.getState', {})).resolves.toEqual({
      method: 'autohand.getState',
      env: 'forwarded',
    });
    await transport.stop();
  });

  it('coalesces concurrent starts into one subprocess', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'autohand-ts-sdk-pids-'));
    temporaryDirectories.push(directory);
    const pidFile = join(directory, 'pids.txt');
    const cliPath = await createFakeCli(pidFile);
    const transport = new Transport({ cliPath, timeout: 2_000 });

    await Promise.all([transport.start(), transport.start(), transport.start()]);
    await transport.request('autohand.getState', {});
    expect((await readFile(pidFile, 'utf8')).trim().split('\n')).toHaveLength(1);
    await transport.stop();
  });

  it('waits for a pre-spawn start before completing a concurrent stop', async () => {
    const cliPath = await createFakeCli();
    const transport = new Transport({ timeout: 500 });
    let releaseDetection = (_value: string): void => undefined;
    const detectedPath = new Promise<string>((resolve) => {
      releaseDetection = resolve;
    });
    (transport as unknown as {
      detectCLIBinary: () => Promise<string>;
    }).detectCLIBinary = async () => detectedPath;

    const starting = transport.start();
    let stopSettled = false;
    const stopping = transport.stop().then(() => {
      stopSettled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(stopSettled).toBe(false);

    releaseDetection(cliPath);
    await Promise.all([starting, stopping]);
    expect(transport.isRunning()).toBe(false);
  });

  it('rejects every concurrent start caller when the shared spawn fails', async () => {
    const transport = new Transport({ cliPath: '/definitely/missing/autohand-cli' });
    const results = await Promise.allSettled([transport.start(), transport.start()]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(String(result.reason)).toContain('Failed to start CLI');
      }
    }
    expect(transport.isRunning()).toBe(false);
  });

  it('fails pending RPC immediately when the CLI exits and keeps stop idempotent', async () => {
    const cliPath = await createFakeCli();
    const transport = new Transport({ cliPath, timeout: 5_000 });
    await transport.start();

    const startedAt = performance.now();
    await expect(transport.request('test.exit', {})).rejects.toThrow('pending RPC: test.exit');
    expect(performance.now() - startedAt).toBeLessThan(500);
    expect(transport.isRunning()).toBe(false);
    await transport.stop();
    await transport.stop();
  });

  it('fails pending RPC and marks the transport stopped when stdout closes first', async () => {
    const cliPath = await createFakeCli();
    const transport = new Transport({ cliPath, timeout: 5_000 });
    await transport.start();

    const startedAt = performance.now();
    await expect(transport.request('test.close_stdout', {})).rejects.toThrow('CLI stdout closed');
    expect(performance.now() - startedAt).toBeLessThan(500);
    expect(transport.isRunning()).toBe(false);
    await transport.stop();
  });

  it('processes a final unterminated frame and reaps a TERM-ignoring child', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'autohand-ts-final-frame-'));
    temporaryDirectories.push(directory);
    const pidFile = join(directory, 'pids.txt');
    const cliPath = await createFakeCli(pidFile);
    const transport = new Transport({ cliPath, timeout: 5_000 });
    await transport.start();

    await expect(transport.request('test.final_no_newline', {})).resolves.toEqual({ final: true });
    expect(transport.isRunning()).toBe(false);
    const pid = Number((await readFile(pidFile, 'utf8')).trim());
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        process.kill(pid, 0);
      } catch {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch {
      alive = false;
    }
    expect(alive).toBe(false);

    await transport.start();
    await expect(transport.request('autohand.getState', {})).resolves.toEqual({
      method: 'autohand.getState',
      env: '',
    });
    expect((await readFile(pidFile, 'utf8')).trim().split('\n')).toHaveLength(2);
    await transport.stop();
  });

  it('drains every complete buffered response before handling stdout EOF', async () => {
    const cliPath = await createFakeCli();
    const transport = new Transport({ cliPath, timeout: 5_000 });
    await transport.start();

    const first = transport.request('test.final_batch', {});
    const second = transport.request('test.hang', {});
    await expect(Promise.all([first, second])).resolves.toEqual([
      { batch: 1 },
      { batch: 2 },
    ]);
    expect(transport.isRunning()).toBe(false);
    await transport.stop();
  });

  it('rejects SDK startup if the CLI exits after its final configuration response', async () => {
    const cliPath = await createFakeCli();
    const sdk = new AutohandSDK({ cliPath, planMode: true, timeout: 5_000 });

    await expect(sdk.start()).rejects.toThrow('CLI process terminated during SDK startup');
    expect(sdk.isStarted()).toBe(false);
    expect(sdk.isConnected()).toBe(false);
    await sdk.stop();
  });

  it('aborts an acknowledged background prompt before the next stream starts', async () => {
    const { cliPath } = await createStreamingCli();
    const sdk = new AutohandSDK({ cliPath, timeout: 1_000 });
    await sdk.start();

    const first = sdk.streamPrompt({ message: 'first' });
    const initial = await first.next();
    expect(initial.done).toBe(false);
    if (initial.done === false && initial.value.type === 'message_update') {
      expect(initial.value.delta).toBe('old-partial');
    }
    await first.return(undefined);

    const deltas: string[] = [];
    for await (const event of sdk.streamPrompt({ message: 'second' })) {
      if (event.type === 'message_update') deltas.push(event.delta);
    }
    expect(deltas).toEqual(['second']);
    await sdk.stop();
  });

  it('keeps non-streaming prompt alive through acknowledged background work', async () => {
    const { cliPath, completionFile } = await createStreamingCli();
    const sdk = new AutohandSDK({ cliPath, timeout: 1_000 });
    await sdk.start();

    await sdk.prompt({ message: 'direct' });

    expect(await readFile(completionFile, 'utf8')).toBe('completed');
    await sdk.stop();
  });

  it('removes timed-out requests from the pending map', async () => {
    const cliPath = await createFakeCli();
    const transport = new Transport({ cliPath, timeout: 20 });
    await transport.start();
    await expect(transport.request('test.hang', {})).rejects.toThrow('Request timeout');
    const pending = (transport as unknown as { pendingRequests: Map<unknown, unknown> }).pendingRequests;
    expect(pending.size).toBe(0);
    await transport.stop();
  });

  it('rejects a malformed matching error envelope instead of orphaning its request', async () => {
    const cliPath = await createFakeCli();
    const transport = new Transport({ cliPath, timeout: 5_000 });
    await transport.start();

    const outcome = await Promise.race([
      transport.request('test.malformed_error', {}).then(
        () => 'resolved',
        (error: unknown) => error instanceof Error ? error.message : String(error)
      ),
      new Promise<string>((resolve) => setTimeout(resolve, 250, 'still-pending')),
    ]);

    expect(outcome).toBe('Malformed JSON-RPC error response for test.malformed_error');
    const pending = (transport as unknown as { pendingRequests: Map<unknown, unknown> }).pendingRequests;
    expect(pending.size).toBe(0);
    await transport.stop();
  });

  it('skips malformed stdout without losing the next valid response', async () => {
    const cliPath = await createFakeCli();
    const transport = new Transport({ cliPath, timeout: 500 });
    await transport.start();
    await expect(transport.request('test.malformed', {})).resolves.toEqual({
      method: 'autohand.getState',
      env: '',
    });
    await transport.stop();
  });

  it('keeps usable cold-start p95 below 50ms', async () => {
    const cliPath = await createFakeCli();
    const samples: number[] = [];

    for (let index = 0; index < 20; index += 1) {
      const transport = new Transport({ cliPath, timeout: 500 });
      const startedAt = performance.now();
      await transport.start();
      await transport.request('autohand.getState', {});
      samples.push(performance.now() - startedAt);
      await transport.stop();
    }

    samples.sort((left, right) => left - right);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
    expect(p95).toBeDefined();
    expect(p95 as number).toBeLessThan(50);
  });
});
