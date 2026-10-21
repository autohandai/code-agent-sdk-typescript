import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { z } from 'zod';
import { ClaudeCompatibilityError } from '../../errors/claude-compat.js';
import { validateToolArguments } from '../../validation/claude-compat.js';

export interface SdkMcpToolDefinition<Schema extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  inputSchema: Schema;
  annotations?: ToolAnnotations;
  _meta?: Record<string, unknown>;
  handler(args: z.output<z.ZodObject<Schema>>, extra: unknown): Promise<CallToolResult>;
}

export interface McpSdkServerConfigWithInstance {
  type: 'sdk';
  name: string;
  instance: McpServer;
}

export function tool<Schema extends z.ZodRawShape>(name: string, description: string,
  inputSchema: Schema, handler: SdkMcpToolDefinition<Schema>['handler'],
  extras: { annotations?: ToolAnnotations; _meta?: Record<string, unknown> } = {},
): SdkMcpToolDefinition<Schema> {
  return { name, description, inputSchema, ...extras,
    async handler(args, extra) { return handler(await validateToolArguments(inputSchema, args), extra); },
  };
}

export function createSdkMcpServer(options: { name: string; version?: string; instructions?: string;
  tools?: SdkMcpToolDefinition[] }): McpSdkServerConfigWithInstance {
  const instance = new McpServer({ name: options.name, version: options.version ?? '1.0.0' },
    { maxToolInputElements: 10_000, ...(options.instructions === undefined ? {} : { instructions: options.instructions }) });
  for (const definition of options.tools ?? []) {
    instance.registerTool(definition.name, { description: definition.description,
      inputSchema: definition.inputSchema,
      ...(definition.annotations === undefined ? {} : { annotations: definition.annotations }),
      ...(definition._meta === undefined ? {} : { _meta: definition._meta }) },
    (args, extra) => definition.handler(args, extra));
  }
  return { type: 'sdk', name: options.name, instance };
}

/** Keep the full MCP protocol, including images and structured results, on loopback. */
export async function serveSdkMcpServer(config: McpSdkServerConfigWithInstance): Promise<{
  config: { type: 'http'; url: string; headers: Record<string, string> };
  close(): Promise<void>;
}> {
  if (config.instance.isConnected()) throw new ClaudeCompatibilityError(`MCP server ${config.name} is already connected`);
  const authorization = `Bearer ${randomBytes(32).toString('hex')}`;
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID,
    enableJsonResponse: true, maxRequestBodySize: 1024 * 1024 });
  // The upstream Node transport accessors include undefined explicitly, while its
  // Transport interface uses optional properties. Their runtime contract agrees.
  await config.instance.connect(transport as Transport);
  const server = createServer((request, response) => {
    if (request.headers.authorization !== authorization) { response.writeHead(401).end(); return; }
    if (request.url !== '/mcp') { response.writeHead(404).end(); return; }
    void transport.handleRequest(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => closing ??= (async () => {
    await config.instance.close();
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)));
  })();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
    });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new ClaudeCompatibilityError('MCP loopback server did not bind a TCP port');
    return { config: { type: 'http', url: `http://127.0.0.1:${address.port}/mcp`, headers: { Authorization: authorization } }, close };
  } catch (error) { await close(); throw error; }
}
