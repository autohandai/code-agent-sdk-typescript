import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { npmCommand } from './npm-command.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const release = JSON.parse(await readFile(join(root, 'cli-release.json'), 'utf8'));

export async function verifyBinary(file, expected) {
  const metadata = await stat(file);
  if (metadata.size !== expected.size) throw new Error(`Unexpected CLI size: ${file}`);
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  if (hash.digest('hex') !== expected.sha256) throw new Error(`CLI checksum mismatch: ${file}`);
}

export async function loadTarget(target) {
  const asset = release.platforms[target];
  if (!asset) throw new Error(`Unsupported CLI package target: ${target}`);
  const folder = join(root, 'packages', target);
  const manifest = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
  const [os, cpu] = target.split('-');
  if (manifest.name !== `@autohandai/agent-sdk-${target}`
    || manifest.version !== release.version
    || JSON.stringify(manifest.os) !== JSON.stringify([os])
    || JSON.stringify(manifest.cpu) !== JSON.stringify([cpu])
    || (os === 'linux' && JSON.stringify(manifest.libc) !== '["glibc"]')
    || manifest.autohandCli?.sha256 !== asset.sha256
    || manifest.autohandCli?.size !== asset.size
    || manifest.autohandCli?.asset !== asset.asset
    || manifest.autohandCli?.version !== release.version) {
    throw new Error(`CLI package metadata differs from the pinned release: ${target}`);
  }
  return { asset, folder, manifest, binary: join(folder, 'bin', os === 'win32' ? 'autohand.exe' : 'autohand') };
}

async function prepare(target) {
  const { asset, binary } = await loadTarget(target);
  try {
    await verifyBinary(binary, asset);
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(binary), { recursive: true });
  const temporary = `${binary}.download`;
  try {
    const response = await fetch(`https://github.com/autohandai/code-cli/releases/download/${release.tag}/${asset.asset}`, {
      signal: AbortSignal.timeout(300_000),
    });
    if (!response.ok || !response.body) throw new Error(`CLI download failed: HTTP ${response.status}`);
    let bytes = 0;
    const limit = new Transform({
      transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        callback(bytes > asset.size ? new Error('CLI download exceeds pinned size') : null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body), limit, createWriteStream(temporary, { flags: 'wx' }));
    await verifyBinary(temporary, asset);
    await chmod(temporary, 0o755);
    await rename(temporary, binary);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function publish(target) {
  const { asset, binary, folder, manifest } = await loadTarget(target);
  await verifyBinary(binary, asset);
  const lookup = await fetch(`https://registry.npmjs.org/${encodeURIComponent(manifest.name)}/${manifest.version}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (lookup.ok) {
    const existing = await lookup.json();
    if (JSON.stringify(existing.autohandCli) !== JSON.stringify(manifest.autohandCli)
      || JSON.stringify(existing.os) !== JSON.stringify(manifest.os)
      || JSON.stringify(existing.cpu) !== JSON.stringify(manifest.cpu)
      || JSON.stringify(existing.libc) !== JSON.stringify(manifest.libc)) {
      throw new Error(`Published CLI package does not match pinned metadata: ${manifest.name}`);
    }
    console.error(`${manifest.name}@${manifest.version} already published`);
    return;
  }
  if (lookup.status !== 404) throw new Error(`npm lookup failed: HTTP ${lookup.status}`);
  execFileSync(...npmCommand(['publish', '--access', 'public', ...(process.env.GITHUB_ACTIONS ? ['--provenance'] : [])]), {
    cwd: folder, stdio: 'inherit',
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...requested] = process.argv.slice(2);
  if (!['prepare', 'verify', 'publish'].includes(command)) throw new Error('Expected prepare, verify, or publish');
  const targets = requested.length ? requested : Object.keys(release.platforms);
  for (const target of targets) {
    if (command === 'prepare') await prepare(target);
    if (command === 'verify') {
      const { binary, asset } = await loadTarget(target);
      await verifyBinary(binary, asset);
    }
    if (command === 'publish') await publish(target);
    console.error(`${command}: ${target} CLI ${release.version}`);
  }
}
