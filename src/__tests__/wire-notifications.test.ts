import { describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AutohandSDK } from '../sdk/index.js';
import { Agent } from '../sdk/agent.js';
import type { WireNotification } from '../types/index.js';

describe('lossless CLI notifications', () => {
  it('preserves method identity, exact parameter shapes, ordering and independent observers', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'sdk-wire-'));
    const cli = path.join(directory, 'cli.mjs');
    const packets = [
      {method:'autohand.pipe.output', params:{type:'progress',content:'kept',future:{value:false}}},
      {method:'autohand.peerUpdate',params:{event:{type:'peer_joined'},timestamp:'now'}},
      {method:'autohand.future.array',params:[1,null,'value']},
      {method:'autohand.future.null',params:null},
    ];
    await writeFile(cli, `#!/usr/bin/env node
import { createInterface } from 'node:readline';
for await(const line of createInterface({input:process.stdin})) {
 const request=JSON.parse(line);
 if(request.method==='autohand.getState') for(const packet of ${JSON.stringify(packets)}) console.log(JSON.stringify({jsonrpc:'2.0',...packet}));
 console.log(JSON.stringify({jsonrpc:'2.0',id:request.id,result:{status:'idle',sessionId:'fixture',model:'fixture',workspace:process.cwd(),contextPercent:0,messageCount:0}}));
}
`, {mode:0o755});
    const sdk = new AutohandSDK({cliPath:cli,cwd:directory});
    const observed: WireNotification[] = [];
    try {
      const removeFailure = sdk.onNotification(() => { throw new Error('observer failure'); });
      const removeMutator = sdk.onNotification(packet => {
        if (Array.isArray(packet.params)) packet.params.push('mutated');
      });
      const remove = Agent.fromSDK(sdk).onNotification(packet => { observed.push(packet); });
      sdk.setSystemPrompt("fixture");
      await sdk.start();
      await sdk.getState();
      expect(observed).toEqual(packets);
      remove(); removeFailure(); removeMutator();
      await sdk.getState();
      expect(observed).toHaveLength(packets.length);
    } finally { await sdk.close(); await rm(directory,{recursive:true,force:true}); }
  });
});
