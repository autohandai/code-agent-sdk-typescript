import { afterEach, describe, expect, it } from 'bun:test';
import { createReadStream, promises as fs } from 'fs';
import { createHash } from 'crypto';
import os from 'os';
import path from 'path';
import {
  ActiveAgentRegistryReader,
  SessionAwarenessMonitor,
} from '../session/index.js';
import { RPCClient } from '../rpc/client.js';
import { AutohandSDK } from '../sdk/index.js';
import { Agent } from '../sdk/agent.js';
import type {
  ActiveAgentRecord,
  SessionPeerEvent,
} from '../types/index.js';

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'autohand-sdk-awareness-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function createConfigAwareCli(directory: string): Promise<string> {
  const cliPath = path.join(directory, 'config-aware-cli.cjs');
  await fs.writeFile(cliPath, `#!/usr/bin/env node
const fs = require('fs');
const readline = require('readline');
const configIndex = process.argv.indexOf('--config');
const configPath = configIndex === -1 ? undefined : process.argv[configIndex + 1];
const config = configPath === undefined
  ? {}
  : JSON.parse(fs.readFileSync(configPath, 'utf8'));
const lines = readline.createInterface({ input: process.stdin });
lines.on('line', (line) => {
  const request = JSON.parse(line);
  process.stdout.write(JSON.stringify({
    jsonrpc: '2.0',
    id: request.id,
    result: {
      status: 'idle',
      awareness: config.sessions?.awareness,
      configPath,
      configMode: configPath === undefined ? undefined : fs.statSync(configPath).mode & 0o777,
      configDirectoryMode: configPath === undefined
        ? undefined
        : fs.statSync(require('path').dirname(configPath)).mode & 0o777,
    },
  }) + '\\n');
});
`);
  await fs.chmod(cliPath, 0o755);
  return cliPath;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => fs.rm(directory, { recursive: true, force: true }),
  ));
});

function record(
  overrides: Partial<ActiveAgentRecord> = {},
): ActiveAgentRecord {
  return {
    version: 1,
    pid: 42,
    sessionId: 'peer-session',
    workspaceRoot: '/workspace/project',
    projectName: 'project',
    provider: 'openrouter',
    model: 'openrouter/auto',
    mode: 'rpc',
    status: 'working',
    startedAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:05.000Z',
    messageCount: 1,
    contextPercent: 4,
    tokensUsed: 120,
    activity: {
      phase: 'thinking',
      pathsWritten: [],
    },
    ...overrides,
  };
}

describe('ActiveAgentRegistryReader', () => {
  it('returns only live records in the workspace and sanitizes peer-authored activity', async () => {
    const directory = await createTemporaryDirectory();
    const activeAgents = path.join(directory, 'active-agents');
    await fs.mkdir(activeAgents);
    const pathsWritten = Array.from({ length: 25 }, (_, index) => `src/file-${index}.ts`);

    await Promise.all([
      fs.writeFile(path.join(activeAgents, 'peer.json'), JSON.stringify(record({
        activity: {
          phase: 'editing',
          instruction: '\u001B[31mfix auth\u001B[0m\u202E\u200B',
          command: 'bun\u0000 test',
          pathsWritten,
          claims: ['src/auth.ts'],
          headRef: { branch: 'main', sha: 'abc123' },
        },
      }))),
      fs.writeFile(path.join(activeAgents, 'other-workspace.json'), JSON.stringify(record({
        sessionId: 'other-workspace',
        workspaceRoot: '/workspace/other',
      }))),
      fs.writeFile(path.join(activeAgents, 'stale.json'), JSON.stringify(record({
        sessionId: 'stale',
        pid: 99,
      }))),
      fs.writeFile(path.join(activeAgents, 'invalid.json'), '{"version":1,"pid":"wrong"}'),
    ]);

    const reader = new ActiveAgentRegistryReader(activeAgents, {
      now: () => new Date('2026-07-27T00:00:10.000Z'),
      isPidAlive: (pid) => pid === 42,
    });

    const peers = await reader.listActive('/workspace/project', 'own-session');

    expect(peers).toHaveLength(1);
    expect(peers[0]?.activity).toEqual({
      phase: 'editing',
      instruction: 'fix auth',
      command: 'bun test',
      pathsWritten: pathsWritten.slice(0, 20),
      claims: ['src/auth.ts'],
      headRef: { branch: 'main', sha: 'abc123' },
    });
  });

  it('accepts legacy records that do not contain activity', async () => {
    const directory = await createTemporaryDirectory();
    const legacyRecord = record();
    delete legacyRecord.activity;
    await fs.writeFile(path.join(directory, 'legacy.json'), JSON.stringify(legacyRecord));
    const reader = new ActiveAgentRegistryReader(directory, {
      now: () => new Date('2026-07-27T00:00:10.000Z'),
      isPidAlive: () => true,
    });

    const peers = await reader.listActive('/workspace/project');

    expect(peers[0]?.activity).toBeUndefined();
  });

  it('uses session ID as a deterministic tie-breaker for equal heartbeat times', async () => {
    const directory = await createTemporaryDirectory();
    await Promise.all([
      fs.writeFile(path.join(directory, 'z.json'), JSON.stringify(record({
        sessionId: 'zeta',
      }))),
      fs.writeFile(path.join(directory, 'a.json'), JSON.stringify(record({
        sessionId: 'alpha',
      }))),
    ]);
    const reader = new ActiveAgentRegistryReader(directory, {
      now: () => new Date('2026-07-27T00:00:10.000Z'),
      isPidAlive: () => true,
    });

    const peers = await reader.listActive('/workspace/project');

    expect(peers.map((peer) => peer.sessionId)).toEqual(['alpha', 'zeta']);
  });
});

describe('SessionAwarenessMonitor', () => {
  it('emits ordered join, activity update, and leave events while excluding this session', async () => {
    const own = record({ sessionId: 'own-session' });
    const joined = record();
    const updated = record({
      updatedAt: '2026-07-27T00:00:10.000Z',
      activity: { phase: 'running_command', command: 'bun test', pathsWritten: [] },
    });
    const snapshots = [
      [own, joined],
      [own, updated],
      [own],
    ];
    const events: SessionPeerEvent[] = [];
    const reader = {
      listActive: async (): Promise<ActiveAgentRecord[]> => snapshots.shift() ?? [],
    };
    const monitor = new SessionAwarenessMonitor({
      workspaceRoot: '/workspace/project',
      ownSessionId: 'own-session',
      reader,
      onEvent: (event) => events.push(event),
      onError: () => undefined,
    });

    await monitor.refresh();
    await monitor.refresh();
    await monitor.refresh();

    expect(events.map((event) => event.type)).toEqual([
      'session_peer_joined',
      'session_peer_updated',
      'session_peer_left',
    ]);
    const activityEvent = events[1];
    expect(activityEvent?.type).toBe('session_peer_updated');
    if (activityEvent?.type !== 'session_peer_updated') {
      throw new Error('Expected a session peer update');
    }
    expect(activityEvent.peer.sessionId).toBe('peer-session');
    expect(activityEvent.peer.activity?.phase).toBe('running_command');
    expect(activityEvent.peer.activity?.command).toBe('bun test');
  });

  it('keeps polling after a transient registry read failure', async () => {
    const events: SessionPeerEvent[] = [];
    const errors: string[] = [];
    let attempts = 0;
    const monitor = new SessionAwarenessMonitor({
      workspaceRoot: '/workspace/project',
      pollIntervalMs: 2,
      reader: {
        listActive: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error('temporarily unavailable');
          return [record()];
        },
      },
      onEvent: (event) => events.push(event),
      onError: (error) => errors.push(`${error.operation}:${error.message}`),
    });

    await monitor.start();
    for (let attempt = 0; attempt < 20 && events.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    monitor.stop();

    expect(events.map((event) => event.type)).toEqual(['session_peer_joined']);
    expect(errors).toEqual(['initial_read:temporarily unavailable']);
  });

  it('does not publish a refresh that completes after the monitor stops', async () => {
    const events: SessionPeerEvent[] = [];
    let resolveRecords: (records: ActiveAgentRecord[]) => void = () => undefined;
    const records = new Promise<ActiveAgentRecord[]>((resolve) => {
      resolveRecords = resolve;
    });
    const monitor = new SessionAwarenessMonitor({
      workspaceRoot: '/workspace/project',
      reader: { listActive: async () => records },
      onEvent: (event) => events.push(event),
      onError: () => undefined,
    });

    const refreshing = monitor.refresh();
    monitor.stop();
    resolveRecords([record()]);
    await refreshing;

    expect(events).toEqual([]);
    expect(monitor.getPeers()).toEqual([]);
  });

  it('does not emit updates for heartbeat-only timestamp changes', async () => {
    const events: SessionPeerEvent[] = [];
    const snapshots = [
      [record()],
      [record({ updatedAt: '2026-07-27T00:00:10.000Z' })],
    ];
    const monitor = new SessionAwarenessMonitor({
      workspaceRoot: '/workspace/project',
      reader: {
        listActive: async () => snapshots.shift() ?? [],
      },
      onEvent: (event) => events.push(event),
      onError: () => undefined,
    });

    await monitor.refresh();
    await monitor.refresh();

    expect(events.map((event) => event.type)).toEqual(['session_peer_joined']);
  });
});

describe('session awareness public API', () => {
  it('fails fast when JavaScript supplies an unsupported awareness tier', () => {
    let message = '';
    try {
      new AutohandSDK({
        sessions: {
          awareness: 'loud' as 'warn',
        },
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe('Unsupported session awareness tier: loud');
  });

  it('queries peers and publishes peer lifecycle events through RPCClient', async () => {
    const autohandHome = await createTemporaryDirectory();
    const activeAgents = path.join(autohandHome, 'active-agents');
    await fs.mkdir(activeAgents);
    await fs.writeFile(
      path.join(activeAgents, 'peer.json'),
      JSON.stringify(record({
        pid: process.pid,
        workspaceRoot: process.cwd(),
        updatedAt: new Date().toISOString(),
      })),
    );
    const client = new RPCClient({
      cwd: process.cwd(),
      envVars: { AUTOHAND_HOME: autohandHome },
    });

    const peers = await client.getSessionPeers();
    const event = await client.events().next();

    expect(peers.map((peer) => peer.sessionId)).toEqual(['peer-session']);
    expect(event.done).toBe(false);
    if (event.done === true) throw new Error('Expected a peer event');
    expect(event.value.type).toBe('session_peer_joined');
    if (event.value.type !== 'session_peer_joined') {
      throw new Error('Expected a session peer join');
    }
    expect(event.value.peer.sessionId).toBe('peer-session');
    await client.stop();
  });

  it('streams registry failures as recoverable awareness errors', async () => {
    const autohandHome = await createTemporaryDirectory();
    await fs.writeFile(path.join(autohandHome, 'active-agents'), 'not a directory');
    const cliPath = await createConfigAwareCli(autohandHome);
    const client = new RPCClient({
      cliPath,
      cwd: process.cwd(),
      envVars: { AUTOHAND_HOME: autohandHome },
    });

    await client.start();
    const event = await client.events().next();
    await client.stop();

    expect(event.done).toBe(false);
    if (event.done === true) throw new Error('Expected an awareness error event');
    expect(event.value.type).toBe('session_awareness_error');
    if (event.value.type !== 'session_awareness_error') {
      throw new Error('Expected a session awareness error');
    }
    expect(event.value.operation).toBe('initial_read');
    expect(event.value.recoverable).toBe(true);
  });

  it('exposes peer queries through AutohandSDK and Agent', async () => {
    const expected = [record()];
    const sdk = new AutohandSDK();
    (sdk as unknown as {
      client: { getSessionPeers: () => Promise<ActiveAgentRecord[]> };
    }).client = {
      getSessionPeers: async () => expected,
    };
    const agent = Agent.fromSDK(sdk);

    await expect(sdk.getSessionPeers()).resolves.toEqual(expected);
    await expect(agent.getSessionPeers()).resolves.toEqual(expected);
  });

  it('applies the awareness tier before CLI startup without mutating the user config', async () => {
    const autohandHome = await createTemporaryDirectory();
    const userConfigPath = path.join(autohandHome, 'config.json');
    const cliPath = await createConfigAwareCli(autohandHome);
    await fs.writeFile(userConfigPath, JSON.stringify({
      provider: 'openrouter',
      sessions: { awareness: 'warn' },
    }));
    const sdk = new AutohandSDK({
      cliPath,
      cwd: process.cwd(),
      sessions: { awareness: 'coordinate' },
      envVars: { AUTOHAND_HOME: autohandHome },
    });

    await sdk.start();
    const state = await sdk.getState() as unknown as {
      awareness: string;
      configPath: string;
      configMode: number;
      configDirectoryMode: number;
    };
    await sdk.stop();

    expect(state.awareness).toBe('coordinate');
    expect(state.configMode).toBe(0o600);
    expect(state.configDirectoryMode).toBe(0o700);
    expect(JSON.parse(await fs.readFile(userConfigPath, 'utf8'))).toEqual({
      provider: 'openrouter',
      sessions: { awareness: 'warn' },
    });
    await expect(fs.access(state.configPath)).rejects.toThrow();
  });

  it('preserves TOML settings when applying the awareness overlay', async () => {
    const autohandHome = await createTemporaryDirectory();
    await fs.writeFile(path.join(autohandHome, 'config.toml'), [
      'provider = "openrouter"',
      '[openrouter]',
      'model = "openrouter/auto"',
      '[sessions]',
      'awareness = "passive"',
    ].join('\n'));
    const cliPath = await createConfigAwareCli(autohandHome);
    const sdk = new AutohandSDK({
      cliPath,
      sessions: { awareness: 'coordinate' },
      envVars: { AUTOHAND_HOME: autohandHome },
    });

    await sdk.start();
    const state = await sdk.getState() as unknown as { awareness: string };
    await sdk.stop();

    expect(state.awareness).toBe('coordinate');
  });

  it('rejects duplicate CLI config files instead of changing config precedence', async () => {
    const autohandHome = await createTemporaryDirectory();
    await Promise.all([
      fs.writeFile(path.join(autohandHome, 'config.json'), '{}'),
      fs.writeFile(path.join(autohandHome, 'config.toml'), 'provider = "openrouter"'),
    ]);
    const cliPath = await createConfigAwareCli(autohandHome);
    const sdk = new AutohandSDK({
      cliPath,
      sessions: { awareness: 'warn' },
      envVars: { AUTOHAND_HOME: autohandHome },
    });

    await expect(sdk.start()).rejects.toThrow('Failed to prepare session awareness');
    await sdk.stop();
  });

  it('rejects a missing explicit CLI config instead of silently dropping it', async () => {
    const autohandHome = await createTemporaryDirectory();
    const cliPath = await createConfigAwareCli(autohandHome);
    const sdk = new AutohandSDK({
      cliPath,
      sessions: { awareness: 'warn' },
      envVars: {
        AUTOHAND_HOME: autohandHome,
        AUTOHAND_CONFIG: path.join(autohandHome, 'missing.toml'),
      },
    });

    await expect(sdk.start()).rejects.toThrow('Failed to prepare session awareness');
    await sdk.stop();
  });
});

describe('session awareness documentation', () => {
  it('ships the configuration, peer-query, streaming, and coordination workflow', async () => {
    const guide = await fs.readFile(
      path.join(process.cwd(), 'docs', 'session-awareness.md'),
      'utf8',
    );
    const example = await fs.readFile(
      path.join(process.cwd(), 'examples', '28-session-awareness.ts'),
      'utf8',
    );
    const packageJson = JSON.parse(
      await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8'),
    ) as { files: string[] };

    expect(guide).toContain("awareness: 'coordinate'");
    expect(guide).toContain('getSessionPeers()');
    expect(guide).toContain('session_peer_joined');
    expect(guide).toContain('permission_request');
    expect(example).toContain("event.type === 'session_peer_updated'");
    expect(packageJson.files).toContain('docs/session-awareness.md');
    expect(packageJson.files).toContain('examples/28-session-awareness.ts');
  });

  it('bundles verified CLI artifacts with session awareness', async () => {
    const buildInfo = JSON.parse(
      await fs.readFile(path.join(process.cwd(), 'cli', 'BUILD_INFO.json'), 'utf8'),
    ) as {
      sourceCommit: string;
      features: string[];
      sha256: Record<string, string>;
    };

    expect(buildInfo.sourceCommit).toMatch(/^[a-f0-9]{40}$/);
    expect(buildInfo.features).toContain('concurrent-session-awareness');
    expect(Object.keys(buildInfo.sha256).sort()).toEqual([
      'autohand-linux-arm64',
      'autohand-linux-x64',
      'autohand-macos-arm64',
      'autohand-macos-x64',
      'autohand-windows-x64.exe',
    ]);
    for (const [artifact, expectedHash] of Object.entries(buildInfo.sha256)) {
      expect(expectedHash).toMatch(/^[a-f0-9]{64}$/);
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(path.join(process.cwd(), 'cli', artifact))) {
        hash.update(chunk);
      }
      expect(hash.digest('hex')).toBe(expectedHash);
    }
  });
});
