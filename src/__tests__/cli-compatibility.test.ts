import {expect,it} from 'bun:test';
import {Transport,buildCliArgs} from '../transport/transport.js';
it('rejects obsolete generated options before launching a CLI',async()=>{
 const transport=new Transport({cliPath:'/does-not-exist',autoSaveInterval:30});
 await expect(transport.start()).rejects.toThrow('unsupported by the current CLI');
});

it('makes ephemeral persistence an explicit opt-in',()=>{
 expect(buildCliArgs({})).not.toContain('--ephemeral');
 expect(buildCliArgs({ephemeral:true})).toContain('--ephemeral');
});
