import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const examplesDir = join(repoRoot, 'examples');
const requestedEntries = process.argv.slice(2);

const entries = requestedEntries.length > 0
  ? requestedEntries
  : readdirSync(examplesDir)
    .filter((fileName) => fileName.endsWith('.ts'))
    .sort()
    .map((fileName) => `examples/${fileName}`);

const outputName = requestedEntries.length === 1
  ? `autohand-sdk-${basename(requestedEntries[0], '.ts')}-check`
  : 'autohand-sdk-all-example-check';
const outputDir = join(tmpdir(), outputName);

rmSync(outputDir, { recursive: true, force: true });

const result = spawnSync('bun', [
  'build',
  ...entries,
  '--outdir',
  outputDir,
  '--target=node',
  '--external',
  '@autohandai/agent-sdk',
], {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
