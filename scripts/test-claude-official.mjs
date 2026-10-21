import { createServer } from 'node:http';
import { mkdtemp, readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(join(tmpdir(), 'autohand-official-compat-'));
const original = 'def calculate_average(numbers):\n    return sum(numbers) / len(numbers)\n\ndef get_user_name(user):\n    return user["name"].upper()\n';
const fixed = 'def calculate_average(numbers):\n    return sum(numbers) / len(numbers) if numbers else 0\n\ndef get_user_name(user):\n    return (user or {}).get("name", "").upper()\n';
let calls = 0;
const paths = [];
const toolResults = [];
const server = createServer(async (request, response) => {
  paths.push(request.url);
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/auth/me') {
    response.end(JSON.stringify({ user: { id: 'compat-fixture', email: 'compat@example.test', name: 'Compatibility fixture' } }));
    return;
  }
  if (request.url !== '/v1/messages') { response.end(JSON.stringify({ data: [] })); return; }
  let body = ''; for await (const chunk of request) body += chunk;
  for (const message of JSON.parse(body).messages ?? []) for (const block of Array.isArray(message.content) ? message.content : []) {
    if (block.type === 'tool_result') toolResults.push(block);
  }
  calls += 1;
  const content = calls === 1
    ? [{ type: 'tool_use', id: 'read-fixture', name: 'read_file', input: { path: 'utils.py' } }]
    : calls === 2
      ? [{ type: 'tool_use', id: 'write-fixture', name: 'write_file', input: { path: 'utils.py', contents: fixed } }]
      : [{ type: 'text', text: 'Fixed the two crash cases in utils.py.' }];
  response.end(JSON.stringify({ id: `msg_${calls}`, type: 'message', role: 'assistant', model: 'claude-sonnet-5', content,
    stop_reason: calls < 3 ? 'tool_use' : 'end_turn', stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }));
});
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const home = join(directory, 'home'); await mkdir(home);
  await mkdir(join(directory, 'agent'));
  await writeFile(join(directory, 'utils.py'), original);
  const config = join(home, 'config.json');
  await writeFile(config, JSON.stringify({ auth: { token: `ahc_${'a'.repeat(43)}` }, provider: 'anthropic',
    anthropic: { model: 'claude-sonnet-5', apiKey: 'provider-fixture', baseUrl: base },
    telemetry: { enabled: false }, network: { maxRetries: 0 } }), { mode: 0o600 });
  const env = { ...process.env, AUTOHAND_HOME: home, AUTOHAND_CONFIG: config,
    AUTOHAND_CLI_PATH: resolve(root, 'packages', `${process.platform}-${process.arch}`, 'bin', process.platform === 'win32' ? 'autohand.exe' : 'autohand'),
    AUTOHAND_AUTH_API_URL: `${base}/auth`, AUTOHAND_API_URL: base,
    ANTHROPIC_API_KEY: 'provider-fixture', AUTOHAND_SKIP_UPDATE_CHECK: '1', AUTOHAND_TELEMETRY_DISABLED: '1' };
  delete env.AUTOHAND_AI_API_KEY; delete env.AUTOHAND_API_KEY;
  const examples = [];
  for (const name of ['quickstart', 'hello-world']) {
    const file = join(root, 'tests/compat/official', `${name}.ts`);
    let output;
    try {
      output = await exec(process.env.BUN_EXECUTABLE ?? 'bun', [file], { cwd: directory, env, timeout: 45_000, maxBuffer: 1024 * 1024 });
      const success = name === 'quickstart' && output.stdout.includes('Done: success')
        && await readFile(join(directory, 'utils.py'), 'utf8') === fixed;
      examples.push({ name, success, stdout: output.stdout, stderr: output.stderr });
    } catch (error) { examples.push({ name, success: false, stdout: error.stdout ?? '', stderr: error.stderr ?? error.message }); }
  }
  const officialProviderRequests = calls;
  const officialPaths = [...paths];
  calls = 0;
  const { query } = await import('../dist/compat/claude/index.js');
  const smoke = [];
  for await (const message of query({ prompt: 'Exercise the explicit unrestricted file mutation fixture.', options: {
    cwd: directory, env, permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true,
  } })) smoke.push(message);
  const mutationSmoke = { explicitBypassConsent: true, providerRequests: calls,
    passed: smoke.at(-1)?.subtype === 'success' && await readFile(join(directory, 'utils.py'), 'utf8') === fixed,
    changedFile: await readFile(join(directory, 'utils.py'), 'utf8') === fixed, toolResults };
  // Unsupported constraints fail before spawning, so blocked examples may never
  // contact the explicit local auth fixture.
  const report = { proof: 'official rejection checks plus a separate released-CLI 0.9.8 mutation smoke using local account/model fixtures',
    cleanAccountlessMigration: false, liveProvider: false,
    passed: examples.filter(example => example.success).length, total: examples.length,
    providerRequests: officialProviderRequests, officialPaths,
    mutationSmoke,
    examples };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!examples.every(example => example.success)) process.exitCode = 1;
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
