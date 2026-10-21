import { describe, expect, it } from 'bun:test';
import { buildCliArgs } from '../transport/transport.js';
describe('current CLI session startup', () => {
  it('maps legacy IDs and paths to the actual RPC session startup option', () => {
    expect(buildCliArgs({sessionId:'saved',persistSession:true})).toEqual(['--mode','rpc','--sdk-session-reference','saved']);
    expect(buildCliArgs({sessionPath:'/saved/path',resume:true})).toEqual(['--mode','rpc','--sdk-session-reference','/saved/path']);
  });
  it('continues the latest workspace session and gives a fork its explicit source', () => {
    expect(buildCliArgs({resume:true})).toEqual(['--mode','rpc','--sdk-resume-last']);
    expect(buildCliArgs({continue:true})).toEqual(['--mode','rpc','--sdk-resume-last']);
    expect(buildCliArgs({fork:'saved',sessionId:'saved'})).toEqual(['--mode','rpc','--fork','saved']);
  });
});
