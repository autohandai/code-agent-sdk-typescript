import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execute = promisify(execFile);
const repository = fileURLToPath(new URL('..', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'autohand-package-proof-'));
const packageRoot = join(temporary, 'package');
const requests = { stop: [], cancel: [], rate: [], provider: [], sessions: [] };
async function within(promise, label) {
  let timeout;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`${label} timed out`)), 15_000);
    })]);
  } finally {
    clearTimeout(timeout);
  }
}
const server = createServer(async (request, response) => {
  try {
    if (request.url === '/auth/me') {
      assert.equal(request.headers.authorization, 'Bearer fixture-session-token');
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ user: { id: 'package-proof', email: 'proof@example.test' } }));
      return;
    }
    const scenario = request.url?.split('/')[1];
    assert.ok(Object.hasOwn(requests, scenario), `Unexpected endpoint: ${request.url}`);
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'GET') {
      response.end(JSON.stringify({ data: [{ id: 'gpt-4.1' }] }));
      return;
    }
    let body = '';
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    requests[scenario].push(input);
    if (scenario === 'provider') {
      assert.equal(request.headers.authorization, 'Bearer fixture-inference-key');
      assert.equal(input.model, 'fantail');
      response.end(JSON.stringify({
        id: 'provider-fixture',
        choices: [{ message: { role: 'assistant', content: 'PROCESS_PROVIDER_OVERRIDE_OK' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }));
      return;
    }
    if (scenario === 'rate') {
      response.writeHead(429, { 'Retry-After': '60' });
      response.end(JSON.stringify({ error: { message: 'Package fixture quota exhausted', type: 'rate_limit_error' } }));
      return;
    }
    const first = requests[scenario].length === 1;
    response.end(JSON.stringify({
      id: `completion-${scenario}-${requests[scenario].length}`,
      created: 1,
      model: 'gpt-4.1',
      choices: [{
        index: 0,
        finish_reason: first ? 'tool_calls' : 'stop',
        message: first
          ? { role: 'assistant', content: '', tool_calls: [{
            id: `read-${scenario}`, type: 'function',
            function: { name: 'read_file', arguments: JSON.stringify({ path: 'package.json' }) },
          }] }
          : { role: 'assistant', content: JSON.stringify({ finalResponse: '@autohandai/agent-sdk' }) },
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }));
  } catch (error) {
    response.writeHead(500);
    response.end(JSON.stringify({ error: { message: String(error) } }));
  }
});

async function configFor(scenario) {
  const directory = join(temporary, `home-${scenario}`);
  await mkdir(directory);
  const configPath = join(directory, 'config.json');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await writeFile(configPath, JSON.stringify({
    provider: 'openai',
    model: 'gpt-4.1',
    auth: { token: 'fixture-session-token' },
    openai: { authMode: 'api-key', apiKey: 'fixture-key', model: 'gpt-4.1', baseUrl: `http://127.0.0.1:${address.port}/${scenario}/v1` },
    agent: { autoMemory: false, enableRequestQueue: true, sessionRetryLimit: 2, sessionRetryDelay: 0 },
    telemetry: { enabled: false },
    permissions: { mode: 'unrestricted' },
  }));
  return {
    AUTOHAND_HOME: directory,
    AUTOHAND_CONFIG: configPath,
    AUTOHAND_AUTH_API_URL: `http://127.0.0.1:${address.port}/auth`,
    AUTOHAND_API_URL: `http://127.0.0.1:${address.port}`,
    AUTOHAND_NO_UPDATE_CHECK: '1',
    AUTOHAND_TELEMETRY_DISABLED: '1',
    NO_PROXY: '127.0.0.1,localhost',
  };
}

try {
  const filename = 'autohand-sdk.tgz';
  await execute('bun', ['pm', 'pack', '--ignore-scripts', '--filename', join(temporary, filename)], {
    cwd: repository, timeout: 180_000, maxBuffer: 4_000_000,
  });
  await execute('tar', ['-xzf', join(temporary, filename), '-C', temporary]);
  await assert.rejects(access(join(packageRoot, 'src')));
  await execute('bun', ['install', '--production', '--ignore-scripts'], { cwd: packageRoot, timeout: 120_000 });
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(Object.keys(manifest.optionalDependencies).filter(name => name.startsWith('@autohandai/agent-sdk-')).length, 5);
  await assert.rejects(access(join(packageRoot, 'cli', 'BUILD_INFO.json')));
  const pairedCLI = process.env.AUTOHAND_PACKAGE_PROOF_CLI;
  const packagedRequire = createRequire(join(packageRoot, 'package.json'));
  let selectedCLI = pairedCLI;
  if (!selectedCLI) {
    try { selectedCLI = packagedRequire.resolve(`@autohandai/agent-sdk-${process.platform}-${process.arch}/bin/${process.platform === 'win32' ? 'autohand.exe' : 'autohand'}`); }
    catch { throw new Error('The native optional CLI package is missing. Install a matching platform package, or set AUTOHAND_PACKAGE_PROOF_CLI to the explicitly paired CLI. PATH fallback is not package compatibility proof.'); }
  }
  process.env.AUTOHAND_CLI_PATH = selectedCLI;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { Agent, AutohandSDK } = await import(pathToFileURL(join(packageRoot, 'dist', 'index.js')).href);

  const discoveryEnvironment = await configFor('discovery');
  const extension = join(packageRoot, '.autohand', 'extensions', 'sdk.fixture');
  await mkdir(join(extension, 'agents'), { recursive: true });
  await writeFile(join(extension, 'autohand.extension.json'), JSON.stringify({
    schemaVersion: 1, extensionApi: 1, id: 'sdk.fixture', name: 'SDK fixture', version: '1.0.0',
    description: 'Installed-package discovery fixture', contributes: { agents: ['agents/package-helper.md'] },
  }));
  await writeFile(join(extension, 'agents', 'package-helper.md'),
    '---\ndescription: Package helper\ntools: read_file\n---\nPrivate package instructions.\n');
  const discoverySDK = new AutohandSDK({
    cwd: packageRoot, env: discoveryEnvironment,
    agents: JSON.stringify({ 'inline-helper': { description: 'Inline helper', prompt: 'Private inline instructions', tools: ['read_file'] } }),
  });
  try {
    await discoverySDK.start();
    let agents = await discoverySDK.supportedAgents();
    assert.ok(agents.some(agent => agent.name === 'reviewer' && agent.source === 'builtin'));
    assert.ok(agents.some(agent => agent.name === 'inline-helper' && agent.source === 'session'));
    assert.ok(agents.some(agent => agent.name === 'package-helper' && agent.extensionId === 'sdk.fixture'));
    assert.ok(!JSON.stringify(agents).includes('Private'));
    for (const operation of ['disable', 'enable']) {
      for await (const event of discoverySDK.streamPrompt({ message: `/extensions ${operation} sdk.fixture --scope project` })) {
        assert.notEqual(event.type, 'error');
      }
      agents = await discoverySDK.supportedAgents();
      assert.equal(agents.some(agent => agent.name === 'package-helper'), operation === 'enable');
    }
    console.log('PASS installed SDK: built-in, inline and extension discovery with disable/enable refresh');
  } finally {
    await discoverySDK.close();
  }

  const providerEnvironment = await configFor('provider');
  const savedConfig = JSON.parse(await readFile(providerEnvironment.AUTOHAND_CONFIG, 'utf8'));
  savedConfig.openai.baseUrl = 'http://127.0.0.1:1/unused';
  savedConfig.features = { experimentalBrowserToolsV2: true };
  await writeFile(providerEnvironment.AUTOHAND_CONFIG, JSON.stringify(savedConfig));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const providerAgent = await Agent.create({
    cwd: packageRoot, provider: 'autohandai', model: 'fantail', apiKey: 'fixture-inference-key',
    baseUrl: `http://127.0.0.1:${address.port}/provider/v1`, env: providerEnvironment,
    features: { experimentalFork: true },
  });
  try {
    const capabilities = await providerAgent.setBrowserCapabilities({ protocolVersion: 2, extensionVersion: '1.0.0', tools: ['browser_navigate'] });
    assert.equal(capabilities.enabled, true, 'A startup feature override must retain unrelated saved features');
    const result = await within(providerAgent.run('Reply with the expected marker.'), 'Explicit provider run');
    assert.equal(result.status, 'completed');
    assert.equal(result.text, 'PROCESS_PROVIDER_OVERRIDE_OK');
    assert.equal(requests.provider.length, 1);
    const persisted = JSON.parse(await readFile(providerEnvironment.AUTOHAND_CONFIG, 'utf8'));
    assert.equal(persisted.provider, 'openai');
    assert.deepEqual(persisted.openai, savedConfig.openai);
    assert.equal(persisted.autohandai, undefined);
    console.log('PASS installed SDK: explicit Autohand AI overrides saved OpenAI and preserves saved credentials');
  } finally {
    await providerAgent.close();
  }

  const exampleEnvironment = { ...process.env, ...await configFor('stop') };
  exampleEnvironment.AUTOHAND_CLI_PATH = selectedCLI;
  delete exampleEnvironment.AUTOHAND_MODEL;
  const example = await execute('bun', ['run', 'examples/29-stop-when.ts'], {
    cwd: packageRoot, env: exampleEnvironment, timeout: 30_000,
  });
  assert.match(example.stdout, /Paused after step 1\./);
  assert.match(example.stdout, /Tools: read_file/);
  assert.match(example.stdout, /@autohandai\/agent-sdk/);
  assert.equal(requests.stop.length, 2);
  assert.ok(requests.stop[1].messages.some((message) =>
    message.role === 'tool' && String(message.content).includes('@autohandai/agent-sdk')));
  console.log('PASS installed example: default CLI read_file, stopped step, persisted output, continuation');

  const cancelledAgent = await Agent.create({ cwd: packageRoot, env: await configFor('cancel'), permissionMode: 'yolo' });
  try {
    let entered;
    const conditionEntered = new Promise((resolve) => { entered = resolve; });
    const run = await cancelledAgent.send('Read package.json', {
      stopWhen: () => { entered(); return new Promise(() => {}); },
    });
    const result = run.wait();
    await within(conditionEntered, 'Condition entry');
    await run.abort();
    assert.equal((await within(result, 'Cancelled run')).status, 'aborted');
    const continued = await within(cancelledAgent.run('Continue from the saved tool result'), 'Next prompt');
    assert.equal(continued.status, 'completed');
    assert.equal(continued.text, '@autohandai/agent-sdk');
    assert.equal(requests.cancel.length, 2);
    console.log('PASS installed SDK: abort with unresolved predicate and subsequent prompt');
  } finally {
    await cancelledAgent.close();
  }

  const rateAgent = await Agent.create({ cwd: packageRoot, env: await configFor('rate'), permissionMode: 'yolo' });
  try {
    const result = await within(rateAgent.run('Read package.json'), 'Rate-limited run');
    const rateEvents = result.events.filter((event) => event.type === 'hook_rate_limit');
    assert.equal(rateEvents.length, 1);
    assert.equal(rateEvents[0].httpStatus, 429);
    assert.equal(rateEvents[0].retryAfterMs, 60_000);
    assert.equal(rateEvents[0].provider, 'openai');
    assert.equal(rateEvents[0].model, 'gpt-4.1');
    assert.equal(rateEvents[0].code, 'rate_limited');
    assert.ok(result.events.some((event) => event.type === 'hook_session_error'));
    assert.equal(requests.rate.length, 1, 'Rate limits must not trigger session retries');
    console.log('PASS installed SDK: HTTP 429 produces typed rate-limit hook without session retry');
  } finally {
    await rateAgent.close();
  }
  const sessionEnvironment = await configFor('sessions');
  const originalAgent = await Agent.create({ cwd: packageRoot, env: sessionEnvironment, permissionMode: 'yolo' });
  let sourceID;
  const rawSessionPackets = [];
  const removeRawObserver = originalAgent.onNotification(packet => { rawSessionPackets.push(packet); });
  try {
    const result = await originalAgent.run('Read package.json and report the package name');
    assert.equal(result.status, 'completed');
    sourceID = (await originalAgent.getState()).sessionId;
    assert.ok(sourceID);
    const metadata = JSON.parse(await readFile(join(sessionEnvironment.AUTOHAND_HOME, 'sessions', sourceID, 'metadata.json'), 'utf8'));
    assert.equal(metadata.sessionId, sourceID);
  } finally { removeRawObserver(); await originalAgent.close(); }
  assert.ok(rawSessionPackets.some(packet => packet.method === "autohand.messageEnd"));
  const resumed = new AutohandSDK({ cwd: packageRoot, env: sessionEnvironment, sessionId: sourceID });
  try {
    await resumed.start();
    assert.equal((await resumed.getState()).sessionId, sourceID);
    assert.ok(JSON.stringify(await resumed.getMessages()).includes('Read package.json'));
  } finally { await resumed.close(); }
  const forked = new AutohandSDK({ cwd: packageRoot, env: sessionEnvironment, fork: sourceID, features: { experimentalFork: true } });
  try {
    await forked.start();
    const forkID = (await forked.getState()).sessionId;
    assert.ok(forkID && forkID !== sourceID);
    assert.ok(JSON.stringify(await forked.getMessages()).includes('Read package.json'));
    const metadata = JSON.parse(await readFile(join(sessionEnvironment.AUTOHAND_HOME, 'sessions', forkID, 'metadata.json'), 'utf8'));
    assert.equal(metadata.branch.sourceSessionId, sourceID);
    assert.equal(metadata.branch.type, 'fork');
    assert.equal(requests.sessions.length, 2, 'Restoring/forking does not call inference');
  } finally { await forked.close(); }
  console.log('PASS installed SDK: actual persisted session ID, resumed history, fork ancestry and no extra inference');
  const ephemeralSDK = new AutohandSDK({cwd: packageRoot, env: sessionEnvironment, ephemeral: true});
  try {
    await ephemeralSDK.start();
    const ephemeralID = (await ephemeralSDK.getState()).sessionId;
    assert.ok(ephemeralID && ephemeralID !== sourceID);
    await assert.rejects(access(join(sessionEnvironment.AUTOHAND_HOME, 'sessions', ephemeralID, 'metadata.json')));
    assert.equal(requests.sessions.length, 2, 'Ephemeral inspection does not call inference');
  } finally { await ephemeralSDK.close(); }
  console.log('PASS installed SDK: raw CLI notifications and ephemeral startup without a session file or inference');

  console.log(`Package proof passed (${pairedCLI ? 'explicit paired CLI: ' + pairedCLI : 'default optional platform CLI'}).`);
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (process.env.AUTOHAND_KEEP_PACKAGE_PROOF === '1') {
    console.log(`Package proof artifacts: ${temporary}`);
  } else {
    await rm(temporary, { recursive: true, force: true });
  }
}
