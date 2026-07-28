import { afterEach, describe, expect, it } from 'bun:test';
import { spawn } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const temporaryDirectories: string[] = [];

interface ExampleResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'autohand-session-example-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function createExampleCli(directory: string): Promise<string> {
  const cliPath = path.join(directory, 'example-cli.cjs');
  await writeFile(cliPath, `#!/usr/bin/env node
const readline = require('node:readline');
const lines = readline.createInterface({ input: process.stdin });
const timestamp = '2026-07-28T00:00:00.000Z';
const scenario = process.env.AUTOHAND_EXAMPLE_SCENARIO;
let permissionAcknowledged = false;

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\\n');
}

function reject(id, message) {
  send({ jsonrpc: '2.0', id, error: { code: -32602, message } });
}

(async () => {
  for await (const line of lines) {
    const request = JSON.parse(line);
    if (request.method === 'autohand.prompt') {
      const prompt = request.params?.message;
      const requiredText = {
        '02': 'peer claims',
        '03': 'delegate_parallel',
        '04': 'Create team',
        '10': 'src/api.ts',
      }[scenario];
      if (requiredText !== undefined
        && (typeof prompt !== 'string' || !prompt.includes(requiredText))) {
        reject(request.id, 'prompt is missing required scenario context');
        continue;
      }
      send({ jsonrpc: '2.0', id: request.id, result: { success: true } });
      if (scenario === '02') {
        send({
          jsonrpc: '2.0',
          method: 'autohand.permissionRequest',
          params: {
            requestId: 'permission-1',
            tool: 'write_file',
            description: 'Write src/shared.ts',
            context: { path: 'src/shared.ts' },
            timestamp,
          },
        });
        send({
          jsonrpc: '2.0',
          method: 'autohand.turnEnd',
          params: { turnId: 'turn-1', reason: 'completed', timestamp },
        });
        continue;
      }
      if (scenario === '03') {
        send({
          jsonrpc: '2.0',
          method: 'autohand.toolStart',
          params: {
            toolId: 'tool-1',
            toolName: 'delegate_parallel',
            args: { tasks: ['review API', 'review tests'] },
            timestamp,
          },
        });
        send({
          jsonrpc: '2.0',
          method: 'autohand.hook.subagentStop',
          params: {
            subagentId: 'subagent-1',
            subagentName: 'reviewer',
            subagentType: 'project',
            success: true,
            duration: 42,
            timestamp,
          },
        });
        send({
          jsonrpc: '2.0',
          method: 'autohand.toolEnd',
          params: {
            toolId: 'tool-1',
            toolName: 'delegate_parallel',
            success: true,
            output: 'Two reviews completed',
            timestamp,
          },
        });
        send({
          jsonrpc: '2.0',
          method: 'autohand.turnEnd',
          params: { turnId: 'turn-1', reason: 'completed', timestamp },
        });
        continue;
      }
      if (scenario === '04') {
        for (const [toolId, toolName] of [
          ['tool-1', 'create_team'],
          ['tool-2', 'add_teammate'],
          ['tool-3', 'create_team_task'],
        ]) {
          send({
            jsonrpc: '2.0',
            method: 'autohand.toolStart',
            params: { toolId, toolName, args: {}, timestamp },
          });
        }
        send({
          jsonrpc: '2.0',
          method: 'autohand.turnEnd',
          params: { turnId: 'turn-1', reason: 'completed', timestamp },
        });
        continue;
      }
      if (scenario === '10') {
        send({
          jsonrpc: '2.0',
          method: 'autohand.messageEnd',
          params: {
            messageId: 'message-1',
            content: JSON.stringify({
              summary: 'Coordinate changes',
              avoidPaths: ['src/api.ts'],
            }),
            timestamp,
          },
        });
        send({
          jsonrpc: '2.0',
          method: 'autohand.turnEnd',
          params: { turnId: 'turn-1', reason: 'completed', timestamp },
        });
        continue;
      }
      send({
        jsonrpc: '2.0',
        method: 'autohand.messageUpdate',
        params: { messageId: 'message-1', delta: 'streaming-ready', timestamp },
      });
      send({
        jsonrpc: '2.0',
        method: 'autohand.turnEnd',
        params: { turnId: 'turn-1', reason: 'completed', timestamp },
      });
      continue;
    }
    if (scenario === '02' && request.method === 'autohand.permissionAcknowledged') {
      if (request.params?.requestId !== 'permission-1') {
        reject(request.id, 'unexpected permission acknowledgement');
        continue;
      }
      permissionAcknowledged = true;
      send({ jsonrpc: '2.0', id: request.id, result: { success: true } });
      continue;
    }
    if (scenario === '02' && request.method === 'autohand.permissionResponse') {
      if (!permissionAcknowledged
        || request.params?.requestId !== 'permission-1'
        || request.params?.decision !== 'allow_once') {
        reject(request.id, 'permission decision did not follow the handshake');
        continue;
      }
      send({ jsonrpc: '2.0', id: request.id, result: { success: true } });
      continue;
    }
    if (scenario === '05' && request.method === 'autohand.goal.create') {
      if (!request.params?.objective?.includes('src/api.ts')) {
        reject(request.id, 'goal is missing peer-written paths');
        continue;
      }
      send({
        jsonrpc: '2.0',
        id: request.id,
        result: { ok: true, goal: null, queue: [], message: 'Goal created' },
      });
      continue;
    }
    if (scenario === '06' && request.method === 'autohand.getSkillsRegistry') {
      send({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          success: true,
          skills: [{
            id: 'testing',
            name: 'testing',
            description: 'Test-driven SDK development',
            category: 'engineering',
            isCurated: true,
          }],
          categories: [{ name: 'engineering', count: 1 }],
        },
      });
      continue;
    }
    if (scenario === '07' && request.method === 'autohand.mcp.listTools') {
      send({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: [{
            name: 'read_file',
            description: 'Read a project file',
            serverName: 'filesystem',
          }],
        },
      });
      continue;
    }
    if (scenario === '08' && request.method === 'autohand.automode.start') {
      if (request.params?.maxIterations !== 3
        || !request.params?.prompt?.includes('peer paths and claims')) {
        reject(request.id, 'auto-mode is missing bounded peer-aware instructions');
        continue;
      }
      send({
        jsonrpc: '2.0',
        id: request.id,
        result: { success: true, sessionId: 'auto-1' },
      });
      continue;
    }
    if (scenario === '09' && request.method === 'autohand.autoresearch.start') {
      const subagents = request.params?.subagents;
      if (request.params?.maxIterations !== 5
        || subagents?.ideaGeneration !== true
        || subagents?.measurementAnalysis !== true
        || subagents?.finalization !== true) {
        reject(request.id, 'autoresearch sub-agent phases are incomplete');
        continue;
      }
      send({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          success: true,
          active: true,
          message: 'Autoresearch started',
        },
      });
      continue;
    }
    send({ jsonrpc: '2.0', id: request.id, result: { success: true } });
  }
})();
`);
  await chmod(cliPath, 0o755);
  return cliPath;
}

async function writePeerRecord(
  autohandHome: string,
  workspaceRoot: string,
  scenario: string,
): Promise<void> {
  const activeAgents = path.join(autohandHome, 'active-agents');
  await mkdir(activeAgents, { recursive: true });
  await writeFile(path.join(activeAgents, 'peer-session.json'), JSON.stringify({
    version: 1,
    pid: process.pid,
    sessionId: scenario === '04' ? 'teammate-reviewer' : 'peer-session',
    workspaceRoot,
    projectName: 'example-project',
    provider: 'openrouter',
    model: 'openrouter/auto',
    mode: scenario === '04' ? 'teammate' : 'rpc',
    status: 'working',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 3,
    contextPercent: 12,
    tokensUsed: 480,
    activity: {
      phase: scenario === '04' ? 'waiting_input' : 'editing',
      instruction: 'Review the shared API',
      pathsWritten: ['src/api.ts'],
    },
  }));
}

async function bundleExample(entryPath: string, outputDirectory: string): Promise<string> {
  const result = await Bun.build({
    entrypoints: [entryPath],
    outdir: outputDirectory,
    target: 'bun',
    plugins: [{
      name: 'sdk-source',
      setup(builder) {
        builder.onResolve(
          { filter: /^@autohandai\/agent-sdk$/ },
          () => ({ path: path.join(process.cwd(), 'src', 'index.ts') }),
        );
      },
    }],
  });
  if (!result.success || result.outputs[0] === undefined) {
    const messages = result.logs.map((log) => log.message).join('\n');
    throw new Error(`Failed to bundle example ${entryPath}: ${messages}`);
  }
  return result.outputs[0].path;
}

async function runExample(relativePath: string): Promise<ExampleResult> {
  const directory = await createTemporaryDirectory();
  const workspaceRoot = path.join(directory, 'workspace');
  const autohandHome = path.join(directory, 'autohand-home');
  const scenario = path.basename(relativePath).slice(0, 2);
  await Promise.all([
    mkdir(workspaceRoot, { recursive: true }),
    mkdir(autohandHome, { recursive: true }),
  ]);
  await writePeerRecord(autohandHome, workspaceRoot, scenario);
  const cliPath = await createExampleCli(directory);
  const bundledPath = await bundleExample(
    path.join(process.cwd(), relativePath),
    path.join(directory, 'bundle'),
  );

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bundledPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        AUTOHAND_CLI_PATH: cliPath,
        AUTOHAND_HOME: autohandHome,
        AUTOHAND_TARGET_REPO: workspaceRoot,
        AUTOHAND_EXAMPLE_SCENARIO: scenario,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });
  });
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ));
});

describe('session-awareness examples', () => {
  it('publishes and typechecks exactly ten focused examples', async () => {
    const [entries, packageJson, exampleTsconfig] = await Promise.all([
      readdir(path.join(process.cwd(), 'examples', 'session-awareness')),
      readFile(path.join(process.cwd(), 'package.json'), 'utf8'),
      readFile(path.join(process.cwd(), 'tsconfig.examples.json'), 'utf8'),
    ]);
    const examples = entries.filter((entry) => entry.endsWith('.ts')).sort();
    const packageFiles = (JSON.parse(packageJson) as { files: string[] }).files;

    expect(examples).toEqual([
      '01-streaming-with-peers.ts',
      '02-coordinate-permissions.ts',
      '03-subagent-delegation.ts',
      '04-agent-team.ts',
      '05-goal-with-peer-context.ts',
      '06-skills-and-peers.ts',
      '07-mcp-tools-and-peers.ts',
      '08-automode-with-peers.ts',
      '09-autoresearch-subagents.ts',
      '10-structured-peer-plan.ts',
    ]);
    expect(packageFiles).toContain('examples/session-awareness');
    expect(exampleTsconfig).toContain('examples/session-awareness/**/*.ts');
  });

  it('streams an agent response while reporting active peers', async () => {
    const result = await runExample('examples/session-awareness/01-streaming-with-peers.ts');

    expect(result).toEqual({
      exitCode: 0,
      stdout: [
        'Peer peer-session is editing',
        'streaming-ready',
        'Run completed',
        '',
      ].join('\n'),
      stderr: '',
    });
  });

  it('coordinates a permission decision while a peer is editing', async () => {
    const result = await runExample('examples/session-awareness/02-coordinate-permissions.ts');

    expect(result).toEqual({
      exitCode: 0,
      stdout: [
        'Coordinate with 1 peer(s)',
        'Permission approved for write_file',
        'Run completed',
        '',
      ].join('\n'),
      stderr: '',
    });
  });

  it('observes typed sub-agent completion beside active sessions', async () => {
    const result = await runExample('examples/session-awareness/03-subagent-delegation.ts');

    expect(result).toEqual({
      exitCode: 0,
      stdout: [
        'Active peers: 1',
        'Delegation started: delegate_parallel',
        'Sub-agent reviewer completed in 42ms',
        'Delegation succeeded',
        '',
      ].join('\n'),
      stderr: '',
    });
  });

  it('tracks CLI teammates as peer sessions during team orchestration', async () => {
    const result = await runExample('examples/session-awareness/04-agent-team.ts');

    expect(result).toEqual({
      exitCode: 0,
      stdout: [
        'Team peer teammate-reviewer: waiting_input',
        'Team tool: create_team',
        'Team tool: add_teammate',
        'Team tool: create_team_task',
        'Team orchestration completed',
        '',
      ].join('\n'),
      stderr: '',
    });
  });

  it('creates a durable goal with peer context', async () => {
    const result = await runExample('examples/session-awareness/05-goal-with-peer-context.ts');

    expect(result).toEqual({
      exitCode: 0,
      stdout: 'Goal accepted with 1 active peer(s)\n',
      stderr: '',
    });
  });

  it('discovers skills without losing peer visibility', async () => {
    const result = await runExample('examples/session-awareness/06-skills-and-peers.ts');

    expect(result).toEqual({
      exitCode: 0,
      stdout: 'Skill testing available while 1 peer(s) are active\n',
      stderr: '',
    });
  });

  it('inspects MCP tools together with active sessions', async () => {
    const result = await runExample('examples/session-awareness/07-mcp-tools-and-peers.ts');

    expect(result).toEqual({
      exitCode: 0,
      stdout: 'MCP filesystem/read_file available with 1 peer(s)\n',
      stderr: '',
    });
  });

  it('starts auto-mode while preserving peer awareness', async () => {
    const result = await runExample('examples/session-awareness/08-automode-with-peers.ts');

    expect(result).toEqual({
      exitCode: 0,
      stdout: 'Auto-mode auto-1 started with 1 peer(s) visible\n',
      stderr: '',
    });
  });

  it('starts sub-agent-assisted autoresearch with peer context', async () => {
    const result = await runExample(
      'examples/session-awareness/09-autoresearch-subagents.ts',
    );

    expect(result).toEqual({
      exitCode: 0,
      stdout: 'Autoresearch started with sub-agent phases and 1 peer(s)\n',
      stderr: '',
    });
  });

  it('returns a validated structured plan based on peer-written paths', async () => {
    const result = await runExample(
      'examples/session-awareness/10-structured-peer-plan.ts',
    );

    expect(result).toEqual({
      exitCode: 0,
      stdout: 'Plan avoids src/api.ts: true\n',
      stderr: '',
    });
  });
});
