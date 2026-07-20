import { afterEach, describe, expect, it } from 'bun:test';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutohandSDK } from '../index.js';

const temporaryDirectories: string[] = [];

async function createFeatureCli(options: {
  method: string;
  params: Record<string, unknown>;
  result: unknown;
  notification?: { method: string; params: Record<string, unknown> };
}): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'autohand-ts-features-'));
  temporaryDirectories.push(directory);
  const cliPath = join(directory, 'fake-feature-cli.cjs');
  const fixture = JSON.stringify(options);
  await writeFile(cliPath, `#!/usr/bin/env node
const readline = require('node:readline');
const fixture = ${fixture};
const lines = readline.createInterface({ input: process.stdin });
(async () => {
for await (const line of lines) {
  const request = JSON.parse(line);
  if (request.method === 'autohand.getState') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        status: 'idle',
        sessionId: null,
        model: 'fake',
        workspace: process.cwd(),
        contextPercent: 0,
        messageCount: 0,
      },
    }) + '\\n');
    if (fixture.notification !== undefined) {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        method: fixture.notification.method,
        params: fixture.notification.params,
      }) + '\\n');
    }
    continue;
  }
  if (request.method !== fixture.method
    || JSON.stringify(request.params ?? {}) !== JSON.stringify(fixture.params)) {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32602, message: 'unexpected method or params' },
    }) + '\\n');
    continue;
  }
  process.stdout.write(JSON.stringify({
    jsonrpc: '2.0',
    id: request.id,
    result: fixture.result,
  }) + '\\n');
}
})();
`);
  await chmod(cliPath, 0o755);
  return cliPath;
}

async function withSDK<T>(
  options: Parameters<typeof createFeatureCli>[0],
  run: (sdk: AutohandSDK) => Promise<T>
): Promise<T> {
  const cliPath = await createFeatureCli(options);
  const sdk = new AutohandSDK({ cliPath, timeout: 10_000 });
  await sdk.start();
  try {
    return await run(sdk);
  } finally {
    await sdk.close();
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe('extension RPC features', () => {
  it('acknowledges a permission request through the spawned CLI', async () => {
    const fixture = {
      method: 'autohand.permissionAcknowledged',
      params: { requestId: 'permission-1' },
      result: { success: true },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.acknowledgePermission(fixture.params)
    )).resolves.toEqual({ success: true });
  });

  it('rejects a malformed permission acknowledgement result', async () => {
    const fixture = {
      method: 'autohand.permissionAcknowledged',
      params: { requestId: 'permission-1' },
      result: { success: 'yes' },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.acknowledgePermission(fixture.params)
    )).rejects.toThrow(/Invalid RPC result for autohand\.permissionAcknowledged/);
  });

  it('responds to directory access through the spawned CLI', async () => {
    const fixture = {
      method: 'autohand.directoryAccessResponse',
      params: { requestId: 'directory-1', granted: true },
      result: { success: true },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.respondToDirectoryAccess(fixture.params)
    )).resolves.toEqual({ success: true });
  });

  it('rejects a malformed directory access response result', async () => {
    const fixture = {
      method: 'autohand.directoryAccessResponse',
      params: { requestId: 'directory-1', granted: false },
      result: { success: 1 },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.respondToDirectoryAccess(fixture.params)
    )).rejects.toThrow(/Invalid RPC result for autohand\.directoryAccessResponse/);
  });

  it('acknowledges directory access through the spawned CLI', async () => {
    const fixture = {
      method: 'autohand.directoryAccessAcknowledged',
      params: { requestId: 'directory-1' },
      result: { success: true },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.acknowledgeDirectoryAccess(fixture.params)
    )).resolves.toEqual({ success: true });
  });

  it('rejects a malformed directory access acknowledgement result', async () => {
    const fixture = {
      method: 'autohand.directoryAccessAcknowledged',
      params: { requestId: 'directory-1' },
      result: {},
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.acknowledgeDirectoryAccess(fixture.params)
    )).rejects.toThrow(/Invalid RPC result for autohand\.directoryAccessAcknowledged/);
  });

  it('applies a typed multi-file change decision through the spawned CLI', async () => {
    const fixture = {
      method: 'autohand.changesDecision',
      params: {
        batchId: 'batch-1',
        action: 'accept_selected' as const,
        selectedChangeIds: ['change-1'],
      },
      result: {
        success: true,
        appliedCount: 1,
        skippedCount: 1,
        errors: [{ changeId: 'change-2', error: 'conflict' }],
      },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.decideChanges(fixture.params)
    )).resolves.toEqual(fixture.result);
  });

  it('rejects malformed multi-file change decision counts', async () => {
    const fixture = {
      method: 'autohand.changesDecision',
      params: { batchId: 'batch-1', action: 'accept_all' as const },
      result: { success: true, appliedCount: 'one', skippedCount: 0 },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.decideChanges(fixture.params)
    )).rejects.toThrow(/Invalid RPC result for autohand\.changesDecision/);
  });

  it('gets paginated typed session history through the spawned CLI', async () => {
    const fixture = {
      method: 'autohand.getHistory',
      params: { page: 2, pageSize: 10 },
      result: {
        sessions: [{
          sessionId: 'session-1',
          createdAt: '2026-07-20T00:00:00.000Z',
          lastActiveAt: '2026-07-20T01:00:00.000Z',
          projectName: 'tin-wrapper',
          model: 'fantail',
          messageCount: 12,
          status: 'completed' as const,
        }],
        currentPage: 2,
        totalPages: 4,
        totalItems: 31,
      },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.getHistory(fixture.params)
    )).resolves.toEqual(fixture.result);
  });

  it('rejects session history entries with an unknown status', async () => {
    const fixture = {
      method: 'autohand.getHistory',
      params: {},
      result: {
        sessions: [{
          sessionId: 'session-1',
          createdAt: 't1',
          lastActiveAt: 't2',
          projectName: 'tin-wrapper',
          model: 'fantail',
          messageCount: 1,
          status: 'deleted',
        }],
        currentPage: 1,
        totalPages: 1,
        totalItems: 1,
      },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.getHistory(fixture.params)
    )).rejects.toThrow(/Invalid RPC result for autohand\.getHistory/);
  });

  it('gets typed session details and messages through the spawned CLI', async () => {
    const fixture = {
      method: 'autohand.getSession',
      params: { sessionId: 'session-1' },
      result: {
        success: true as const,
        sessionId: 'session-1',
        projectName: 'tin-wrapper',
        model: 'fantail',
        messageCount: 1,
        status: 'completed',
        createdAt: '2026-07-20T00:00:00.000Z',
        lastActiveAt: '2026-07-20T01:00:00.000Z',
        summary: 'Implemented the feature.',
        messages: [{
          id: 'message-1',
          role: 'assistant' as const,
          content: 'Done',
          timestamp: '2026-07-20T01:00:00.000Z',
          toolCalls: [{ id: 'tool-1', name: 'write_file', args: { path: 'a.ts' } }],
        }],
        workspaceRoot: '/workspace',
      },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.getSession(fixture.params)
    )).resolves.toEqual(fixture.result);
  });

  it('returns a typed missing-session result', async () => {
    const fixture = {
      method: 'autohand.getSession',
      params: { sessionId: 'missing' },
      result: { success: false as const, error: 'Session not found' },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.getSession(fixture.params)
    )).resolves.toEqual(fixture.result);
  });

  it('rejects incomplete successful session details', async () => {
    const fixture = {
      method: 'autohand.getSession',
      params: { sessionId: 'session-1' },
      result: { success: true, sessionId: 'session-1' },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.getSession(fixture.params)
    )).rejects.toThrow(/Invalid RPC result for autohand\.getSession/);
  });
});
