import { afterEach, describe, expect, it } from 'bun:test';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const temporaryDirectories: string[] = [];

interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'agent-cli-comparison-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function createFixtureCli(
  directory: string,
  name: string,
): Promise<string> {
  const executable = path.join(directory, `${name}.cjs`);
  await writeFile(executable, `#!/usr/bin/env node
const args = process.argv.slice(2);
process.stdout.write(JSON.stringify({
  cli: ${JSON.stringify(name)},
  args,
  piOffline: process.env.PI_OFFLINE ?? null,
}) + '\\n');
`);
  await chmod(executable, 0o755);
  return executable;
}

async function runHarness(
  args: readonly string[],
  env: Readonly<Record<string, string>>,
): Promise<SpawnResult> {
  const process = Bun.spawn(
    ['bun', 'scripts/compare-agent-clis.ts', ...args],
    {
      cwd: path.resolve(import.meta.dir, '../..'),
      env: { ...Bun.env, ...env },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { exitCode, stdout, stderr };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(
      async (directory) => rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('agent CLI comparison harness', () => {
  it('runs the same prompt through Autohand, Cursor, and Pi with inspectable commands', async () => {
    const directory = await createTemporaryDirectory();
    const workspace = path.join(directory, 'workspace');
    await mkdir(workspace);
    const [autohand, cursor, pi] = await Promise.all([
      createFixtureCli(directory, 'autohand'),
      createFixtureCli(directory, 'cursor'),
      createFixtureCli(directory, 'pi'),
    ]);

    const result = await runHarness(
      [
        '--prompt',
        'Review the public API without editing files.',
        '--workspace',
        workspace,
        '--agents',
        'autohand,cursor,pi',
        '--timeout-ms',
        '2000',
        '--json',
      ],
      {
        AUTOHAND_COMPARE_AUTOHAND_BIN: autohand,
        AUTOHAND_COMPARE_CURSOR_BIN: cursor,
        AUTOHAND_COMPARE_PI_BIN: pi,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');

    const report = JSON.parse(result.stdout) as {
      version: number;
      prompt: string;
      workspace: string;
      results: Array<{
        agent: string;
        status: string;
        command: { executable: string; args: string[] };
        exitCode: number;
        stdout: string;
      }>;
    };
    expect(report.version).toBe(1);
    expect(report.prompt).toBe('Review the public API without editing files.');
    expect(report.workspace).toBe(workspace);
    expect(report.results.map(({ agent, status }) => ({ agent, status }))).toEqual([
      { agent: 'autohand', status: 'passed' },
      { agent: 'cursor', status: 'passed' },
      { agent: 'pi', status: 'passed' },
    ]);
    expect(report.results[0]?.command.args).toEqual([
      '--path',
      workspace,
      '--output-format',
      'stream-json',
      '--patch',
      '--prompt',
      'Review the public API without editing files.',
    ]);
    expect(report.results[1]?.command.args).toEqual([
      '--print',
      '--output-format',
      'stream-json',
      '--mode',
      'ask',
      '--trust',
      '--workspace',
      workspace,
      'Review the public API without editing files.',
    ]);
    expect(report.results[2]?.command.args).toEqual([
      '--print',
      '--mode',
      'json',
      '--tools',
      'read,grep,find,ls',
      '--no-session',
      '--no-extensions',
      '--no-skills',
      '--no-prompt-templates',
      '--no-themes',
      'Review the public API without editing files.',
    ]);
    expect(report.results.every(({ exitCode }) => exitCode === 0)).toBe(true);
    expect(report.results.every(({ stdout }) => stdout.length > 0)).toBe(true);
    expect(JSON.parse(report.results[2]?.stdout ?? '{}').piOffline).toBe('1');
  });

  it('reports a missing CLI as unavailable without hiding successful comparisons', async () => {
    const directory = await createTemporaryDirectory();
    const workspace = path.join(directory, 'workspace');
    await mkdir(workspace);
    const cursor = await createFixtureCli(directory, 'cursor');

    const result = await runHarness(
      [
        '--prompt',
        'Inspect only.',
        '--workspace',
        workspace,
        '--agents',
        'cursor,pi',
        '--json',
      ],
      {
        AUTOHAND_COMPARE_CURSOR_BIN: cursor,
        AUTOHAND_COMPARE_PI_BIN: path.join(directory, 'missing-pi'),
      },
    );

    expect(result.exitCode).toBe(2);
    const report = JSON.parse(result.stdout) as {
      results: Array<{
        agent: string;
        status: string;
        exitCode: number | null;
        stderr: string;
      }>;
    };
    expect(report.results[0]?.status).toBe('passed');
    expect(report.results[1]?.status).toBe('unavailable');
    expect(report.results[1]?.exitCode).toBe(null);
    expect(report.results[1]?.stderr).toContain('missing-pi');
  });

  it('terminates a CLI that exceeds the configured timeout', async () => {
    const directory = await createTemporaryDirectory();
    const workspace = path.join(directory, 'workspace');
    await mkdir(workspace);
    const executable = path.join(directory, 'stuck.cjs');
    await writeFile(executable, `#!/usr/bin/env node
process.on('SIGTERM', () => {});
setInterval(() => {}, 1000);
`);
    await chmod(executable, 0o755);

    const startedAt = performance.now();
    const result = await runHarness(
      [
        '--prompt',
        'Inspect only.',
        '--workspace',
        workspace,
        '--agents',
        'pi',
        '--timeout-ms',
        '1000',
        '--json',
      ],
      { AUTOHAND_COMPARE_PI_BIN: executable },
    );

    expect(performance.now() - startedAt).toBeLessThan(3_000);
    expect(result.exitCode).toBe(2);
    const report = JSON.parse(result.stdout) as {
      results: Array<{ status: string; signal: string | null }>;
    };
    expect(report.results[0]?.status).toBe('timed_out');
    expect(report.results[0]?.signal).toBe('SIGKILL');
  });

  it('fails zero-exit runs whose vendor stream reports an agent error', async () => {
    const directory = await createTemporaryDirectory();
    const workspace = path.join(directory, 'workspace');
    await mkdir(workspace);
    const autohand = path.join(directory, 'autohand.cjs');
    const pi = path.join(directory, 'pi.cjs');
    await Promise.all([
      writeFile(autohand, `#!/usr/bin/env node
process.stdout.write('{"type":"result","content":"Unable to determine"}\\n');
process.stderr.write("Tool 'read_file' was denied by the permission policy.\\n");
`),
      writeFile(pi, `#!/usr/bin/env node
process.stdout.write('{"type":"message_end","message":{"stopReason":"error","errorMessage":"401 invalid key"}}\\n');
`),
    ]);
    await Promise.all([chmod(autohand, 0o755), chmod(pi, 0o755)]);

    const result = await runHarness(
      [
        '--prompt',
        'Inspect only.',
        '--workspace',
        workspace,
        '--agents',
        'autohand,pi',
        '--json',
      ],
      {
        AUTOHAND_COMPARE_AUTOHAND_BIN: autohand,
        AUTOHAND_COMPARE_PI_BIN: pi,
      },
    );

    expect(result.exitCode).toBe(2);
    const report = JSON.parse(result.stdout) as {
      results: Array<{ status: string; reportedError: string | null }>;
    };
    expect(report.results.map(({ status, reportedError }) => ({
      status,
      reportedError,
    }))).toEqual([
      {
        status: 'failed',
        reportedError: "Tool 'read_file' was denied by the permission policy.",
      },
      { status: 'failed', reportedError: '401 invalid key' },
    ]);
  });
});
