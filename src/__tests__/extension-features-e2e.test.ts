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
  const sdk = new AutohandSDK({ cliPath, timeout: 2_000 });
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
});
