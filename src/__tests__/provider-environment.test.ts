import { describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Transport } from '../transport/transport.js';

describe('provider selection at process startup', () => {
  for (const provider of ['autohandai', 'openrouter', 'custom:acme'] as const) {
    it(`forwards explicit ${provider} after custom environment overrides`, async () => {
      const directory = await mkdtemp(path.join(tmpdir(), 'sdk-provider-env-'));
      const cliPath = path.join(directory, 'cli.mjs');
      await writeFile(cliPath, `#!/usr/bin/env node
import { createInterface } from 'node:readline';
for await (const line of createInterface({ input: process.stdin })) {
  const { id } = JSON.parse(line);
  console.log(JSON.stringify({ jsonrpc: '2.0', id, result: { provider: process.env.AUTOHAND_PROVIDER } }));
}
`, { mode: 0o755 });
      const transport = new Transport({ cliPath, provider, env: { AUTOHAND_PROVIDER: 'ollama' } });
      try {
        await transport.start();
        expect(await transport.request('fixture.provider')).toEqual({ provider });
      } finally {
        await transport.stop();
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});
