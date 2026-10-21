import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { tool, createSdkMcpServer, serveSdkMcpServer } from '../../compat/claude/mcp.js';

describe('SDK-hosted MCP tools', () => {
  it('preserves typed content, validates arguments and protects the loopback server', async () => {
    const calls: string[] = [];
    const server = createSdkMcpServer({ name: 'greetings', tools: [
      tool('hello', 'Greet someone', { name: z.string().min(1) }, async ({ name }) => {
        calls.push(name);
        return { content: [{ type: 'text', text: `Hello ${name}` }], structuredContent: { name } };
      }),
      tool('bulk', 'Handle a bounded list', { items: z.array(z.string()) }, async () => {
        calls.push('bulk'); return { content: [{ type: 'text', text: 'Processed' }] };
      }),
    ] });
    const served = await serveSdkMcpServer(server);
    const client = new Client({ name: 'compat-test', version: '1' });
    try {
      expect(served.config.url.startsWith('http://127.0.0.1:')).toBe(true);
      expect((await fetch(served.config.url)).status).toBe(401);
      await client.connect(new StreamableHTTPClientTransport(new URL(served.config.url), {
        requestInit: { headers: served.config.headers },
      }) as Transport);
      expect((await client.listTools()).tools[0]?.name).toBe('hello');
      const result = await client.callTool({ name: 'hello', arguments: { name: 'Igor' } });
      expect(result).toMatchObject({ content: [{ type: 'text', text: 'Hello Igor' }], structuredContent: { name: 'Igor' } });
      expect((await client.callTool({ name: 'hello', arguments: { name: 3 } })).isError).toBe(true);
      expect((await client.callTool({ name: 'bulk', arguments: { items: Array(10_001).fill('item') } })).isError).toBe(true);
      expect(calls).toEqual(['Igor']);
      await expect(serveSdkMcpServer(server)).rejects.toThrow(/connected|in use/);
    } finally { await client.close(); await served.close(); }
    await expect(fetch(served.config.url)).rejects.toThrow();
    await served.close();
  });
});
