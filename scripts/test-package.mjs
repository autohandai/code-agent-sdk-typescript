import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadTarget } from './cli-packages.mjs';
import { npmCommand } from './npm-command.mjs';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = `${process.platform}-${process.arch}`;
const native = await loadTarget(target);
const directory = await mkdtemp(join(tmpdir(), 'autohand-sdk-package-'));
const requests = [];
const manifests = new Map();
const release = JSON.parse(await readFile(join(root, 'cli-release.json'), 'utf8'));
for (const name of Object.keys(release.platforms)) {
  const item = await loadTarget(name);
  manifests.set(item.manifest.name, { target: name, manifest: item.manifest });
}
const compatFolder = join(root, 'packages/compat-data');
const compatManifest = JSON.parse(await readFile(join(compatFolder, 'package.json'), 'utf8'));
manifests.set(compatManifest.name, { target: 'compat-data', manifest: compatManifest });
let nativeArtifact;
let compatArtifact;
let base;
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, base).pathname);
  requests.push(path);
  if (path.startsWith('/artifacts/')) {
    const artifact = path === `/artifacts/${target}.tgz` ? nativeArtifact
      : path === '/artifacts/compat-data.tgz' ? compatArtifact : undefined;
    if (artifact === undefined) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', 'application/octet-stream');
    createReadStream(artifact).pipe(response);
    return;
  }
  if (path.startsWith('/provider')) {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ data: [{ id: 'fixture', context_length: 16384 }] }));
    return;
  }
  if (path === '/auth/me') {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ user: { id: 'package-fixture', email: 'sdk-fixture@example.test', name: 'SDK fixture' } }));
    return;
  }
  const item = manifests.get(path.slice(1));
  if (!item) {
    response.writeHead(302, { Location: `https://registry.npmjs.org${request.url}` }).end();
    return;
  }
  const version = item.manifest.version;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({
    name: item.manifest.name,
    'dist-tags': { latest: version },
    versions: { [version]: { ...item.manifest, dist: { tarball: `${base}/artifacts/${item.target}.tgz` } } },
  }));
});

async function pack(cwd) {
  const { stdout } = await exec(...npmCommand(['pack', '--json', '--workspaces=false', '--pack-destination', directory]), { cwd });
  return join(directory, JSON.parse(stdout)[0].filename);
}

try {
  nativeArtifact = await pack(native.folder);
  compatArtifact = await pack(compatFolder);
  const sdkArtifact = await pack(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const project = join(directory, 'consumer');
  await mkdir(project);
  await writeFile(join(project, 'package.json'), '{"private":true,"type":"module"}');
  await exec(...npmCommand(['install', sdkArtifact, '--ignore-scripts', '--no-audit', '--no-fund', '--registry', base,
    '--cache', join(directory, 'cache')]), { cwd: project, timeout: 120_000 });
  const scope = join(project, 'node_modules', '@autohandai');
  const platforms = (await readdir(scope)).filter(name => name.startsWith('agent-sdk-'));
  assert.deepEqual(platforms, [`agent-sdk-${target}`]);
  assert.deepEqual(requests.filter(path => path.startsWith('/artifacts/')).sort(), [`/artifacts/${target}.tgz`, '/artifacts/compat-data.tgz'].sort());

  const binary = join(scope, `agent-sdk-${target}`, 'bin', process.platform === 'win32' ? 'autohand.exe' : 'autohand');
  const { stdout: version } = await exec(binary, ['--version'], { timeout: 30_000 });
  assert.match(version, /^0\.9\.8(?:\s|$)/);

  // Local auth and provider fixtures keep this independent of accounts and paid inference.
  const home = join(directory, 'home');
  await mkdir(home);
  const config = join(home, 'config.json');
  await writeFile(config, JSON.stringify({ auth: { token: `ahc_${'a'.repeat(43)}` }, provider: 'openrouter', model: 'fixture', openrouter: { apiKey: 'package-test-only', baseUrl: `${base}/provider` }, telemetry: { enabled: false }, theme: 'dark' }));
  const source = `import { Agent, AutohandSDK } from '@autohandai/agent-sdk';
import {query,tool,createSdkMcpServer} from '@autohandai/agent-sdk/claude';
import {z} from 'zod';
const options={provider:'openrouter',apiKey:'package-test-only',baseUrl:${JSON.stringify(`${base}/provider`)},timeout:15000,env:{AUTOHAND_AUTH_API_URL:${JSON.stringify(`${base}/auth`)},AUTOHAND_API_URL:${JSON.stringify(base)},AUTOHAND_HOME:${JSON.stringify(home)},OPENROUTER_API_KEY:'package-test-only',AUTOHAND_NO_UPDATE_CHECK:'1',AUTOHAND_SKIP_VERSION_CHECK:'1',AUTOHAND_TELEMETRY_DISABLED:'1'}};
const agent=await Agent.create(options);await agent.close();
const sdk=new AutohandSDK(options);try{await sdk.start();const state=await sdk.getState();if(!state||typeof state!=='object')throw new Error('Missing real CLI RPC state');console.log('Agent.create and real CLI RPC passed')}finally{await sdk.close()}
const greeting=tool('hello','Greet',{name:z.string()},async({name})=>({content:[{type:'text',text:name}]}));
const server=createSdkMcpServer({name:'installed-tools',tools:[greeting]});
if(server.instance.isConnected())throw new Error('MCP started eagerly');
if((await greeting.handler({name:'Igor'},undefined)).content[0].text!=='Igor')throw new Error('Tool handler failed');
const q=query({prompt:'No provider request should start',options:{provider:options.provider,apiKey:options.apiKey,baseUrl:options.baseUrl,model:'fixture',env:options.env}});
try{const initialized=await q.initializationResult();if(initialized.type!=='system'||!initialized.session_id)throw new Error('Missing compatibility init')}finally{await q.close()}
console.log('Installed Claude entry point, tool schema and real CLI initialization passed');
`;
  const smoke = join(project, 'smoke.mjs');
  await writeFile(smoke, source);
  const env = { ...process.env };
  delete env.AUTOHAND_CLI_PATH;
  const installed = await exec(process.execPath, [smoke], { cwd: project, env, timeout: 45_000 });
  assert.match(installed.stdout, /real CLI RPC passed/);
  assert.match(installed.stdout, /Installed Claude entry point/);

  const migrationInput = join(project, 'migration-input.ts');
  const migrationSource = "import {query} from '@anthropic-ai/claude-agent-sdk';\n";
  await writeFile(migrationInput, migrationSource);
  const migrationBin = join(scope, 'agent-sdk/dist/cli.js');
  const dryMigration = await exec(process.execPath, [migrationBin, 'migrate-claude', migrationInput], { cwd: project });
  assert.equal(JSON.parse(dryMigration.stdout).imports, 1);
  assert.equal(await readFile(migrationInput, 'utf8'), migrationSource);
  await exec(process.execPath, [migrationBin, 'migrate-claude', migrationInput, '--write'], { cwd: project });
  assert.match(await readFile(migrationInput, 'utf8'), /@autohandai\/agent-sdk\/claude/);

  if (process.platform !== 'win32') {
    // A separate process avoids module resolution caches and proves the literal PATH fallback.
    await rename(join(scope, `agent-sdk-${target}`), join(directory, 'hidden-platform-package'));
    const fallback = await exec(process.execPath, [smoke], {
      cwd: project, timeout: 45_000,
      env: { ...env, PATH: `${join(directory, 'hidden-platform-package', 'bin')}:${env.PATH ?? ''}` },
    });
    assert.match(fallback.stdout, /real CLI RPC passed/);
  }
  assert.ok(requests.includes('/auth/me'), 'real CLI must check the local auth fixture');
  console.log(JSON.stringify({ target, version: version.trim(), platformPackages: platforms, binaryDownloads: requests.filter(p => p.startsWith('/artifacts/')), agentCreate: true, realRPC: true, auth: 'local auth-service fixture', pathFallback: process.platform !== 'win32' }));
} finally {
  await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
