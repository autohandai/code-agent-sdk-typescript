import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTarget, verifyBinary } from '../scripts/cli-packages.mjs';

const directories = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

test('rejects a damaged or truncated CLI binary before packaging', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sdk-integrity-'));
  directories.push(directory);
  const file = join(directory, 'autohand');
  const content = Buffer.from('known release bytes');
  const expected = { size: content.length, sha256: createHash('sha256').update(content).digest('hex') };
  await writeFile(file, content);
  await expect(verifyBinary(file, expected)).resolves.toBeUndefined();
  await writeFile(file, content.subarray(1));
  await expect(verifyBinary(file, expected)).rejects.toThrow('Unexpected CLI size');
  await writeFile(file, Buffer.alloc(content.length));
  await expect(verifyBinary(file, expected)).rejects.toThrow('CLI checksum mismatch');
});

test('loads all supported manifests and refuses an unknown target', async () => {
  for (const target of ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-x64']) {
    const { manifest } = await loadTarget(target);
    expect(manifest.version).toBe('0.9.8');
  }
  await expect(loadTarget('freebsd-x64')).rejects.toThrow('Unsupported CLI package target');
});
