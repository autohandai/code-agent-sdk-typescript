import { describe, expect, it } from 'bun:test';
import { readFile, stat } from 'node:fs/promises';
import { prepareOptions } from '../../compat/claude/options.js';

describe('Claude options runtime mapping', () => {
  it('writes private provider and permission configuration without narrowing allowedTools', async () => {
    const prepared = await prepareOptions({ env: { AUTOHAND_API_KEY: 'account-key', ANTHROPIC_API_KEY: 'test-key' }, model: 'sonnet', settingSources: [],
      allowedTools: ['Read', 'Bash(npm test:*)'], disallowedTools: ['Write'], permissionMode: 'dontAsk' });
    try {
      const config = JSON.parse(await readFile(prepared.config.configPath ?? '', 'utf8'));
      expect(config.anthropic).toMatchObject({ apiKey: 'test-key', model: 'claude-sonnet-5' });
      expect(config.permissions.mode).toBe('interactive');
      expect(config.permissions.allowList).toContain('read_file:*');
      expect(prepared.config.extraArgs).toContain('write_file,append_file');
      expect(config.permissions.availableTools).toBeUndefined();
      expect(prepared.config.extraArgs ?? []).not.toContain('--allowed-tools');
      expect((await stat(prepared.config.configPath ?? '')).mode & 0o777).toBe(0o600);
    } finally { await prepared.cleanup(); }
    await expect(stat(prepared.config.configPath ?? '')).rejects.toThrow();
  });

  it('translates all three external MCP transports and subagent tool aliases', async () => {
    const prepared = await prepareOptions({ env: { AUTOHAND_AI_API_KEY: 'test-key' }, settingSources: [], mcpServers: {
      local: { command: 'node', args: ['server.mjs'], env: { LOCAL: '1' } },
      remote: { type: 'http', url: 'https://example.com/mcp', headers: { Authorization: 'test' } },
      stream: { type: 'sse', url: 'https://example.com/events' },
    }, agents: { reviewer: { description: 'Review code', prompt: 'Find bugs', tools: ['Read', 'Grep'], model: 'inherit' } } });
    try {
      const mcp = JSON.parse(await readFile(prepared.config.mcpConfig ?? '', 'utf8'));
      expect(mcp.servers.map((server: { transport: string }) => server.transport)).toEqual(['stdio', 'http', 'sse']);
      const agents = JSON.parse(prepared.config.agents ?? '');
      expect(agents.reviewer.tools).toContain('read_file');
      expect(agents.reviewer.tools).toContain('search');
      expect(agents.reviewer.model).toBeUndefined();
    } finally { await prepared.cleanup(); }
  });

  it('warns once per unsupported non-policy option and refuses unsafe no-op constraints', async () => {
    const warnings: string[] = [];
    const prepared = await prepareOptions({ env: { AUTOHAND_AI_API_KEY: 'test-key' }, settingSources: [], debugFile: '/tmp/debug', stderr: line => warnings.push(line) });
    await prepared.cleanup();
    expect(warnings.filter(line => line.includes('debugFile'))).toHaveLength(1);
    await expect(prepareOptions({ maxBudgetUsd: 1, env: { AUTOHAND_AI_API_KEY: 'test-key' } })).rejects.toThrow(/budget.*enforc|enforc.*budget/i);
    await expect(prepareOptions({ agents: { reviewer: { description: 'x', prompt: 'x', disallowedTools: ['Bash'] } }, env: { AUTOHAND_AI_API_KEY: 'test-key' } })).rejects.toThrow(/disallowedTools/);
    await expect(prepareOptions({ canUseTool: async () => ({ behavior: 'deny', message: 'No' }) })).rejects.toThrow(/before authorization/);
    await expect(prepareOptions({ isolation: 'worktree' })).rejects.toThrow(/isolation/);
    await expect(prepareOptions({ outputFormat: { type: 'json_schema', schema: { type: 'object' } } })).rejects.toThrow(/outputFormat/);
    await expect(prepareOptions({ permissionMode: 'acceptEdits' })).rejects.toThrow(/requested-tool/);
    await expect(prepareOptions({ allowedTools: ['Edit'] })).rejects.toThrow(/requested-tool/);
    await expect(prepareOptions({ allowedTools: ['Write'] })).rejects.toThrow(/requested-tool/);
  });

  it('rejects malformed input and conflicting resume settings before starting the CLI', async () => {
    await expect(prepareOptions({ maxTurns: -1 })).rejects.toThrow(/maxTurns/);
    await expect(prepareOptions({ resume: 'session', continue: true })).rejects.toThrow(/resume.*continue|continue.*resume/);
    await expect(prepareOptions({ forkSession: true })).rejects.toThrow(/forkSession.*resume/);
  });
});
