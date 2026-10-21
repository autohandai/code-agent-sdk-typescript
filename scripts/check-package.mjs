import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { npmCommand } from './npm-command.mjs';

const [artifact] = JSON.parse(execFileSync(...npmCommand(['pack', '--dry-run', '--json', '--workspaces=false']), { encoding: 'utf8' }));
assert.ok(artifact.size < 5 * 1024 * 1024, 'SDK tarball must remain below 5 MiB');
assert.ok(artifact.unpackedSize < 10 * 1024 * 1024, 'SDK contents must remain below 10 MiB');
assert.ok(artifact.files.some(file => file.path === 'README.md'));
assert.ok(artifact.files.some(file => file.path === 'dist/index.js'));
for (const required of ['COMPAT.md', 'dist/cli.js', 'dist/compat/claude/index.js', 'dist/compat/claude/index.d.ts']) {
  assert.ok(artifact.files.some(file => file.path === required), `Missing compatibility artifact: ${required}`);
}
assert.ok(artifact.files.every(file => !/^(cli|packages)\//.test(file.path)), 'Platform binaries must stay in optional packages');
console.log(JSON.stringify({ name: artifact.name, size: artifact.size, unpackedSize: artifact.unpackedSize, files: artifact.files.length }));
