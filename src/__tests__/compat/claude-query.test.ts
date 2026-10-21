import { afterEach, describe, expect, it } from 'bun:test';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { query, AbortError } from '../../compat/claude/index.js';

const folders: string[] = [];
async function cliFixture(mode = 'normal') {
  const cwd = await mkdtemp(join(tmpdir(), 'autohand-compat-query-')); folders.push(cwd);
  const cliPath = join(cwd, 'cli.cjs'); const log = join(cwd, 'requests.jsonl');
  await writeFile(cliPath, `#!/usr/bin/env node
const fs=require('node:fs');const {createInterface}=require('node:readline');
const log=${JSON.stringify(log)};const mode=${JSON.stringify(mode)};let model='fantail';let sessionId='session-fixture';
const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
const emit=(type,params)=>send({jsonrpc:'2.0',method:'autohand.'+type,params:{timestamp:new Date().toISOString(),...params}});
for(const event of ['SIGTERM','SIGINT'])process.on(event,()=>process.exit(0));
(async()=>{for await(const line of createInterface({input:process.stdin})){
 const r=JSON.parse(line);fs.appendFileSync(log,JSON.stringify({method:r.method,params:r.params,args:process.argv.slice(2)})+'\\n');let result={success:true};
 if(r.method==='autohand.getState')result={status:'idle',sessionId,model,workspace:process.cwd(),contextPercent:0,messageCount:0};
 if(r.method==='autohand.getToolsRegistry')result={tools:[{name:'read_file',description:'Read',source:'builtin'}],diagnostics:[]};
 if(r.method==='autohand.mcp.listServers')result={servers:[]};
 if(r.method==='autohand.changesDecision')result={success:mode!=='changes-failure',appliedCount:mode==='changes-failure'?0:1,skippedCount:0};
 if(r.method==='autohand.permissionModeSet')result={success:true,currentMode:r.params.mode,previousMode:'interactive'};
 if(r.method==='autohand.modelSet'){model=r.params.model;result={success:true,model}};
 if(r.method==='autohand.session.attach'){sessionId=r.params.sessionId;result={success:true,sessionId,workspaceRoot:process.cwd(),messageCount:2}};
 send({jsonrpc:'2.0',id:r.id,result});
 if(r.method==='autohand.abort'){emit('agentEnd',{sessionId,reason:'aborted'});continue;}
 if(r.method!=='autohand.prompt')continue;
 setImmediate(()=>{
  emit('agentStart',{sessionId,model,workspace:process.cwd()});
  if(mode==='wait')return;
  emit('messageStart',{messageId:'message-1',role:'assistant'});
  emit('messageUpdate',{messageId:'message-1',delta:'Hello'});
  emit('messageEnd',{messageId:'message-1',content:'Hello'});
  if(mode.startsWith('changes'))emit('changesBatchEnd',{batchId:'batch-1',changeCount:mode==='changes-invalid'?'bad':1});
  emit('turnEnd',{turnId:'turn-1',tokensUsed:3,tokensUsageStatus:'actual',durationMs:1});
  emit('agentEnd',{sessionId,reason:'completed'});
 });
}})();
`); await chmod(cliPath, 0o755);
  return { cwd, cliPath, log, env: { AUTOHAND_AI_API_KEY: 'fixture' }, settingSources: [] as const };
}
afterEach(async () => { await Promise.all(folders.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe('query facade over a real JSON-RPC subprocess', () => {
  it('emits init first and result last and closes the subprocess and config', async () => {
    const { log, ...fixture } = await cliFixture(); const messages = [];
    for await (const message of query({ prompt: 'Hello', options: { ...fixture, settingSources: [] } })) messages.push(message);
    expect(messages.map(message => message.type)).toEqual(['system', 'assistant', 'result']);
    expect(messages[0]).toMatchObject({ subtype: 'init', session_id: 'session-fixture', tools: ['Read'] });
    expect(messages.at(-1)).toMatchObject({ subtype: 'success', result: 'Hello', total_cost_usd: null });
    const requests = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    const args: string[] = requests[0].args;
    const configPath = args[args.indexOf('--config') + 1];
    expect(configPath).toBeDefined();await expect(readFile(configPath ?? '', 'utf8')).rejects.toThrow();
  });

  it('does not submit work when the consumer stops at init', async () => {
    const { log, ...fixture } = await cliFixture(); const q = query({ prompt: 'Hello', options: { ...fixture, settingSources: [] } });
    for await (const message of q) { expect(message.type).toBe('system'); break; }
    expect(await readFile(log, 'utf8')).not.toContain('autohand.prompt');
    await q.close();
  });

  it('applies canonically authorized file changes before returning success', async () => {
    const { log, ...fixture } = await cliFixture('changes');
    const messages = [];
    for await (const message of query({ prompt: 'Edit', options: { ...fixture, settingSources: [], permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true } })) messages.push(message);
    expect(await readFile(log, 'utf8')).toContain('autohand.changesDecision');
    expect(messages.at(-1)).toMatchObject({ type: 'result', subtype: 'success' });
  });

  it('refuses success when a file batch fails to apply or arrives in plan mode', async () => {
    for (const mode of ['changes-failure', 'changes']) {
      const { log, ...fixture } = await cliFixture(mode);
      const q = query({ prompt: 'Edit', options: { ...fixture, settingSources: [], permissionMode: mode === 'changes' ? 'plan' : 'bypassPermissions', allowDangerouslySkipPermissions: true } });
      const consume = async () => { for await (const message of q) expect(message.type).not.toBe('result'); };
      await expect(consume()).rejects.toThrow(mode === 'changes' ? /plan mode/ : /could not apply/);
      expect(await readFile(log, 'utf8')).toContain(mode === 'changes' ? 'reject_all' : 'accept_all');
    }
  });

  it('validates file batch metadata before applying any change', async () => {
    const { log, ...fixture } = await cliFixture('changes-invalid');
    const consume = async () => { for await (const message of query({ prompt: 'Edit', options: { ...fixture, settingSources: [] } })) expect(message.type).not.toBe('result'); };
    await expect(consume()).rejects.toThrow(/invalid file-change batch/);
    expect(await readFile(log, 'utf8')).not.toContain('autohand.changesDecision');
  });

  it('supports a control before consumption and resumes through RPC without obsolete flags', async () => {
    const { log, ...fixture } = await cliFixture(); const q = query({ prompt: 'Hello', options: { ...fixture, settingSources: [], resume: 'previous-session' } });
    await q.setModel('moa');const messages=[];for await(const message of q)messages.push(message);
    expect(messages[0]).toMatchObject({ model: 'moa', session_id: 'previous-session' });
    const requests=await readFile(log,'utf8');expect(requests).toContain('autohand.session.attach');
    expect(requests).not.toContain('--session-id');expect(requests).not.toContain('--resume');
  });

  it('handles sequential streaming input in one process and rejects non-text payloads', async () => {
    const { log, ...fixture }=await cliFixture(); expect(log).toContain('requests.jsonl');
    async function* input(){yield {type:'user' as const,message:{role:'user' as const,content:'One'}};yield {type:'user' as const,message:{role:'user' as const,content:'Two'}};}
    const messages=[];for await(const message of query({prompt:input(),options:{...fixture,settingSources:[]}}))messages.push(message);
    expect(messages.filter(message=>message.type==='system')).toHaveLength(1);expect(messages.filter(message=>message.type==='result')).toHaveLength(2);
  });

  it('aborts while awaiting the CLI and releases the iterator', async () => {
    const { log, ...fixture }=await cliFixture('wait'); expect(log).toContain('requests.jsonl');const abortController=new AbortController();
    const q=query({prompt:'Wait',options:{...fixture,settingSources:[],abortController}});
    await q.next();const pending=q.next();await new Promise(resolve=>setTimeout(resolve,20));abortController.abort();
    await expect(pending).rejects.toBeInstanceOf(AbortError);await q.close();
  });

  it('closes while a streaming input producer never resolves', async () => {
    const { log, ...fixture } = await cliFixture();
    const producer = { [Symbol.asyncIterator]() { return { next: () => new Promise<IteratorResult<never>>(() => {}) }; } };
    const q = query({ prompt: producer, options: { ...fixture, settingSources: [] } });
    await q.next();
    const waiting = q.next();
    await new Promise(resolve => setTimeout(resolve, 10));
    const closed = q.close();
    await expect(waiting).rejects.toBeInstanceOf(AbortError);
    await closed;
    expect(await readFile(log, 'utf8')).not.toContain('autohand.prompt');
  }, 1_000);
});
