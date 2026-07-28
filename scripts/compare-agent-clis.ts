#!/usr/bin/env bun

import { spawn } from 'node:child_process';
import path from 'node:path';

const AGENT_NAMES = ['autohand', 'cursor', 'pi'] as const;

type AgentName = typeof AGENT_NAMES[number];
type RunStatus = 'passed' | 'failed' | 'timed_out' | 'unavailable';

interface HarnessOptions {
  prompt: string;
  workspace: string;
  agents: AgentName[];
  timeoutMs: number;
  json: boolean;
}

interface AgentCommand {
  executable: string;
  args: string[];
}

interface AgentResult {
  agent: AgentName;
  status: RunStatus;
  command: AgentCommand;
  durationMs: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  reportedError: string | null;
}

interface ComparisonReport {
  version: 1;
  prompt: string;
  workspace: string;
  timeoutMs: number;
  results: AgentResult[];
}

function readValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseAgents(value: string): AgentName[] {
  const requested = value.split(',').map((agent) => agent.trim()).filter(Boolean);
  if (requested.length === 0) {
    throw new Error('--agents requires at least one agent');
  }

  const invalid = requested.filter(
    (agent): agent is string => !AGENT_NAMES.includes(agent as AgentName),
  );
  if (invalid.length > 0) {
    throw new Error(`unknown agents: ${invalid.join(', ')}`);
  }

  return [...new Set(requested as AgentName[])];
}

function parseOptions(args: readonly string[]): HarnessOptions {
  let prompt: string | undefined;
  let workspace = process.cwd();
  let agents: AgentName[] = [...AGENT_NAMES];
  let timeoutMs = 120_000;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    switch (flag) {
      case '--prompt':
        prompt = readValue(args, index, flag);
        index += 1;
        break;
      case '--workspace':
        workspace = path.resolve(readValue(args, index, flag));
        index += 1;
        break;
      case '--agents':
        agents = parseAgents(readValue(args, index, flag));
        index += 1;
        break;
      case '--timeout-ms': {
        const value = Number(readValue(args, index, flag));
        if (!Number.isSafeInteger(value) || value <= 0) {
          throw new Error('--timeout-ms must be a positive integer');
        }
        timeoutMs = value;
        index += 1;
        break;
      }
      case '--json':
        json = true;
        break;
      default:
        throw new Error(`unknown argument: ${flag ?? ''}`);
    }
  }

  if (prompt === undefined || prompt.trim().length === 0) {
    throw new Error('--prompt is required');
  }

  return { prompt, workspace, agents, timeoutMs, json };
}

function commandFor(agent: AgentName, options: HarnessOptions): AgentCommand {
  switch (agent) {
    case 'autohand':
      return {
        executable: process.env.AUTOHAND_COMPARE_AUTOHAND_BIN ?? 'autohand',
        args: [
          '--path',
          options.workspace,
          '--output-format',
          'stream-json',
          '--patch',
          '--prompt',
          options.prompt,
        ],
      };
    case 'cursor':
      return {
        executable: process.env.AUTOHAND_COMPARE_CURSOR_BIN ?? 'cursor-agent',
        args: [
          '--print',
          '--output-format',
          'stream-json',
          '--mode',
          'ask',
          '--trust',
          '--workspace',
          options.workspace,
          options.prompt,
        ],
      };
    case 'pi':
      return {
        executable: process.env.AUTOHAND_COMPARE_PI_BIN ?? 'pi',
        args: [
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
          options.prompt,
        ],
      };
    default: {
      const exhaustive: never = agent;
      throw new Error(`unsupported agent: ${exhaustive}`);
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : null;
}

function detectReportedError(
  agent: AgentName,
  stdout: string,
  stderr: string,
): string | null {
  if (agent === 'autohand') {
    const denied = stderr.match(
      /Tool '[^']+' was denied by the permission policy\./,
    );
    if (denied?.[0] !== undefined) {
      return denied[0];
    }
  }

  for (const line of stdout.split('\n')) {
    if (line.trim().length === 0) {
      continue;
    }
    try {
      const event = asRecord(JSON.parse(line) as unknown);
      if (event === null) {
        continue;
      }
      if (event.type === 'error') {
        return typeof event.message === 'string'
          ? event.message
          : 'Agent stream reported an error event';
      }
      const message = asRecord(event.message);
      if (message?.stopReason === 'error') {
        return typeof message.errorMessage === 'string'
          ? message.errorMessage
          : 'Agent message stopped with an error';
      }
      if (event.is_error === true || event.isError === true) {
        return typeof event.error === 'string'
          ? event.error
          : 'Agent result reported an error';
      }
    } catch {
      // Human-readable output is valid for some CLI versions.
    }
  }
  return null;
}

async function runAgent(
  agent: AgentName,
  options: HarnessOptions,
): Promise<AgentResult> {
  const command = commandFor(agent, options);
  const startedAt = performance.now();

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const child = spawn(command.executable, command.args, {
      cwd: options.workspace,
      env: agent === 'pi'
        ? { ...process.env, PI_OFFLINE: '1' }
        : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const finish = (
      status: RunStatus,
      exitCode: number | null,
      signal: NodeJS.Signals | null,
    ): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (forceKillTimer !== undefined) {
        clearTimeout(forceKillTimer);
      }
      const reportedError = detectReportedError(agent, stdout, stderr);
      resolve({
        agent,
        status: status === 'passed' && reportedError !== null ? 'failed' : status,
        command,
        durationMs: Math.round(performance.now() - startedAt),
        exitCode,
        signal,
        stdout,
        stderr,
        reportedError,
      });
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      stderr += error.message;
      finish(error.code === 'ENOENT' ? 'unavailable' : 'failed', null, null);
    });
    child.on('close', (exitCode, signal) => {
      finish(
        timedOut ? 'timed_out' : exitCode === 0 ? 'passed' : 'failed',
        exitCode,
        signal,
      );
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, 250);
    }, options.timeoutMs);
  });
}

function renderHumanReport(report: ComparisonReport): string {
  const lines = [
    `Agent CLI comparison for ${report.workspace}`,
    `Prompt: ${report.prompt}`,
    '',
  ];
  for (const result of report.results) {
    lines.push(
      `${result.agent.padEnd(8)} ${result.status.padEnd(11)} `
        + `${String(result.durationMs).padStart(6)}ms exit=${result.exitCode ?? '-'}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const results = await Promise.all(
    options.agents.map(async (agent) => runAgent(agent, options)),
  );
  const report: ComparisonReport = {
    version: 1,
    prompt: options.prompt,
    workspace: options.workspace,
    timeoutMs: options.timeoutMs,
    results,
  };

  process.stdout.write(
    options.json
      ? `${JSON.stringify(report, null, 2)}\n`
      : renderHumanReport(report),
  );
  if (results.some(({ status }) => status !== 'passed')) {
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Agent CLI comparison failed: ${message}\n`);
  process.exitCode = 1;
});
