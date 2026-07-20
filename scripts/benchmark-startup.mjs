import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { AutohandSDK, Transport } from '../dist/index.js';

const budgetMs = 50;
const warmups = 5;
const sampleCount = 50;
const directory = await mkdtemp(join(tmpdir(), 'autohand-ts-startup-'));
const cliPath = join(directory, 'fake-cli');
const importTarget = new URL('../dist/index.js', import.meta.url).href;

await writeFile(cliPath, `#!/bin/sh
trap 'exit 0' TERM INT
while IFS= read -r line; do
  printf '{"jsonrpc":"2.0","id":1,"result":{"status":"ready"}}\\n'
done
`);
await chmod(cliPath, 0o755);

async function measureUsableStartup() {
  const transport = new Transport({ cliPath, timeout: 500 });
  const startedAt = performance.now();
  await transport.start();
  await transport.request('autohand.getState', {});
  const elapsed = performance.now() - startedAt;
  await transport.stop();
  return elapsed;
}

async function measureSdkStart() {
  const sdk = new AutohandSDK({
    bare: true,
    timeout: 500,
    envVars: {
      AUTOHAND_SKIP_PING: '1',
      AUTOHAND_SKIP_UPDATE_CHECK: '1',
    },
  });
  const startedAt = performance.now();
  await sdk.start();
  const elapsed = performance.now() - startedAt;
  await sdk.close();
  return elapsed;
}

async function measurePublicImport() {
  return new Promise((resolve, reject) => {
    let output = '';
    const child = spawn(process.execPath, [
      '--input-type=module',
      '--eval',
      `const startedAt = performance.now(); await import(${JSON.stringify(importTarget)}); process.stdout.write(String(performance.now() - startedAt))`,
    ], { stdio: ['ignore', 'pipe', 'inherit'] });
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      const duration = Number(output);
      if (code === 0 && Number.isFinite(duration)) resolve(duration);
      else reject(new Error(`Import probe exited with code ${code}: ${output}`));
    });
  });
}

function summarize(samples) {
  samples.sort((left, right) => left - right);
  const percentile = (value) => samples[Math.ceil(samples.length * value) - 1];
  return {
    samples: sampleCount,
    medianMs: Number(percentile(0.5).toFixed(3)),
    p95Ms: Number(percentile(0.95).toFixed(3)),
    maxMs: Number(samples[samples.length - 1].toFixed(3)),
    passed: percentile(0.95) < budgetMs,
  };
}

try {
  for (let index = 0; index < warmups; index += 1) {
    await measurePublicImport();
    await measureSdkStart();
    await measureUsableStartup();
  }

  const importSamples = [];
  const sdkStartSamples = [];
  const startupSamples = [];
  for (let index = 0; index < sampleCount; index += 1) {
    importSamples.push(await measurePublicImport());
    sdkStartSamples.push(await measureSdkStart());
    startupSamples.push(await measureUsableStartup());
  }
  const publicImport = summarize(importSamples);
  const sdkStart = summarize(sdkStartSamples);
  const usableStartup = summarize(startupSamples);
  const report = {
    language: 'typescript',
    budgetMs,
    metrics: {
      publicImportMs: publicImport,
      sdkStartReturnMs: sdkStart,
      fixtureSpawnToFirstRpcMs: usableStartup,
    },
    passed: publicImport.passed && sdkStart.passed && usableStartup.passed,
  };
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
