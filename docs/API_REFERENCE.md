# API Reference

Complete API reference for @autohandai/agent-sdk TypeScript SDK.

## Table of Contents

- [High-Level API](#high-level-api)
  - [Agent](#agent)
  - [Run](#run)
- [Low-Level API](#low-level-api)
  - [AutohandSDK](#autohandsdk)
- [RPC Client](#rpc-client)
  - [RPCClient](#rpcclient)
- [Transport Layer](#transport-layer)
  - [Transport](#transport)
- [Types](#types)
- [Enums](#enums)
- [Helper Functions](#helper-functions)

---

## High-Level API

The high-level API provides a simple, ergonomic interface for most use cases. Use `Agent` for application code.

### Agent

High-level agent session manager with explicit lifecycle control.

#### `Agent.create(options: AgentOptions): Promise<Agent>`

Create and start an agent session.

```typescript
const agent = await Agent.create({
  cwd: '.',
  instructions: 'Prefer Bun commands and typed SDK APIs.',
  permissionMode: 'interactive',
});
```

**Parameters:**
- `options` - Configuration options (extends `SDKConfig`)
  - `instructions?: string` - Instructions appended to the default system prompt

**Returns:** `Promise<Agent>` - A new Agent instance

---

#### `Agent.fromSDK(sdk: AutohandSDK): Agent`

Wrap an existing low-level SDK instance.

```typescript
const sdk = new AutohandSDK({ cwd: '.' });
await sdk.start();
const agent = Agent.fromSDK(sdk);
```

**Parameters:**
- `sdk` - An existing AutohandSDK instance

**Returns:** `Agent` - An Agent wrapping the SDK

---

#### `agent.send(input: AgentInput, options?: AgentSendOptions): Promise<Run>`

Create a run without waiting for it to finish.

```typescript
const run = await agent.send('Add tests for permission decisions');

for await (const event of run.stream()) {
  console.log(event.type);
}

const result = await run.wait();
```

**Parameters:**
- `input` - String message or full `PromptParams` object
- `options` - Optional prompt parameters (excludes `message`)

**Returns:** `Promise<Run>` - A new Run instance

---

#### `agent.run(input: AgentInput, options?: AgentSendOptions): Promise<RunResult>`

Run a prompt to completion and return the final result.

```typescript
const result = await agent.run('Summarize release risk');
console.log(result.text);
```

**Parameters:**
- `input` - String message or full `PromptParams` object
- `options` - Optional prompt parameters

**Returns:** `Promise<RunResult>` - The completed run result

---

#### `agent.runJson<T>(input: AgentInput, options?: JsonRunOptions<T>): Promise<T>`

Run a prompt to completion and parse the response as JSON.

```typescript
type ReleaseRisk = {
  summary: string;
  risks: Array<{ title: string; severity: 'low' | 'medium' | 'high' }>;
};

const risk = await agent.runJson<ReleaseRisk>('Assess publish readiness', {
  schemaName: 'ReleaseRisk',
  schema: {
    summary: 'string',
    risks: [{ title: 'string', severity: 'low | medium | high' }],
  },
  validate: (value) => value as ReleaseRisk,
});
```

**Parameters:**
- `input` - String message or full `PromptParams` object
- `options` - JSON parsing options
  - `schemaName?: string` - Human-readable schema name
  - `schema?: unknown` - JSON-serializable schema or example shape
  - `outputInstructions?: string` - Additional output instructions
  - `validate?: (value: unknown) => T` - Validation function (e.g., Zod schema.parse)

**Returns:** `Promise<T>` - Parsed and validated JSON result

---

#### `agent.stream(input: AgentInput, options?: AgentSendOptions): AsyncGenerator<SDKEvent>`

Stream a prompt directly without manually creating a run.

```typescript
for await (const event of agent.stream('Analyze the codebase')) {
  if (event.type === 'message_update') {
    process.stdout.write(event.delta);
  }
}
```

**Parameters:**
- `input` - String message or full `PromptParams` object
- `options` - Optional prompt parameters

**Returns:** `AsyncGenerator<SDKEvent>` - Async generator of SDK events

---

#### `agent.close(): Promise<void>`

Close the agent and clean up resources.

```typescript
await agent.close();
```

**Returns:** `Promise<void>`

---

#### `agent.setPlanMode(enabled: boolean): Promise<void>`

Enable or disable CLI-3 plan mode.

```typescript
await agent.setPlanMode(true);
```

**Parameters:**
- `enabled` - Whether plan mode should be active

**Returns:** `Promise<void>`

---

#### `agent.enablePlanMode(): Promise<void>`

Enable CLI-3 plan mode.

```typescript
await agent.enablePlanMode();
```

**Returns:** `Promise<void>`

---

#### `agent.disablePlanMode(): Promise<void>`

Disable CLI-3 plan mode.

```typescript
await agent.disablePlanMode();
```

**Returns:** `Promise<void>`

---

#### `agent.allowPermission(requestId: string, scope?: PermissionDecisionScope): Promise<void>`

Allow a permission request.

```typescript
await agent.allowPermission('req-123', 'session');
```

**Parameters:**
- `requestId` - The permission request ID
- `scope` - Persistence scope: `'once' | 'session' | 'project' | 'user'`

**Returns:** `Promise<void>`

---

#### `agent.denyPermission(requestId: string, scope?: PermissionDecisionScope): Promise<void>`

Deny a permission request.

```typescript
await agent.denyPermission('req-456', 'once');
```

**Parameters:**
- `requestId` - The permission request ID
- `scope` - Persistence scope: `'once' | 'session' | 'project' | 'user'`

**Returns:** `Promise<void>`

---

#### `agent.suggestPermissionAlternative(requestId: string, alternative: string): Promise<void>`

Suggest an alternative for a permission request.

```typescript
await agent.suggestPermissionAlternative('req-789', 'Run bun run typecheck first');
```

**Parameters:**
- `requestId` - The permission request ID
- `alternative` - The alternative suggestion

**Returns:** `Promise<void>`

---

#### `agent.permissionResponse(params: PermissionResponseParams): Promise<void>`

Send a full permission response.

```typescript
await agent.permissionResponse({
  requestId: 'req-123',
  decision: 'allow_session',
});
```

**Parameters:**
- `params` - Full permission response parameters

**Returns:** `Promise<void>`

---

### Run

Represents a single agent execution with streaming support.

#### `run.stream(): AsyncGenerator<SDKEvent>`

Stream run events. Multiple consumers can subscribe; each receives the full buffered event history followed by live events.

```typescript
for await (const event of run.stream()) {
  if (event.type === 'message_update') {
    process.stdout.write(event.delta);
  }
}
```

**Returns:** `AsyncGenerator<SDKEvent>` - Async generator of SDK events

---

#### `run.wait(): Promise<RunResult>`

Wait for the run to finish and return its final text and event trace.

```typescript
const result = await run.wait();
console.log(result.text);
```

**Returns:** `Promise<RunResult>` - The completed run result

---

#### `run.json<T>(options?: JsonParseOptions<T>): Promise<T>`

Wait for the run and parse the final text as JSON.

```typescript
const data = await run.json<{ ok: boolean }>();
```

**Parameters:**
- `options` - JSON parsing options
  - `validate?: (value: unknown) => T` - Validation function

**Returns:** `Promise<T>` - Parsed and validated JSON result

---

#### `run.abort(): Promise<void>`

Abort the active run.

```typescript
await run.abort();
```

**Returns:** `Promise<void>`

---

#### `run.id: string` (readonly)

The unique identifier for this run.

---

## Low-Level API

The low-level API provides direct control over the CLI subprocess and JSON-RPC communication.

### AutohandSDK

Main SDK class for interacting with the Autohand CLI through JSON-RPC.

#### `constructor(config: SDKConfig)`

Create a new AutohandSDK instance.

```typescript
const sdk = new AutohandSDK({
  cwd: '/path/to/project',
  model: 'openrouter/auto',
  permissionMode: 'interactive',
  debug: true,
});
```

**Parameters:**
- `config` - Configuration options (see [SDKConfig](#sdkconfig))

---

#### `sdk.start(): Promise<void>`

Start the SDK and initialize the CLI subprocess.

```typescript
await sdk.start();
```

**Returns:** `Promise<void>`

---

#### `sdk.stop(): Promise<void>`

Stop the SDK and terminate the CLI subprocess.

```typescript
await sdk.stop();
```

**Returns:** `Promise<void>`

---

#### `sdk.close(): Promise<void>`

Close the SDK and clean up all resources (alias for `stop()`).

```typescript
await sdk.close();
```

**Returns:** `Promise<void>`

---

#### `sdk.prompt(params: PromptParams): Promise<void>`

Send a prompt to the agent (non-streaming).

```typescript
await sdk.prompt({
  message: 'Refactor this function to be more efficient',
  context: {
    files: ['src/utils.ts'],
    selection: {
      file: 'src/utils.ts',
      startLine: 10,
      endLine: 20,
      text: 'selected code here'
    }
  }
});
```

**Parameters:**
- `params` - Prompt parameters (see [PromptParams](#promptparams))

**Returns:** `Promise<void>`

---

#### `sdk.streamPrompt(params: PromptParams): AsyncGenerator<SDKEvent>`

Stream a prompt with real-time events.

```typescript
for await (const event of sdk.streamPrompt({ message: 'Hello' })) {
  if (event.type === 'message_update') {
    process.stdout.write(event.delta);
  } else if (event.type === 'tool_start') {
    console.log(`Running tool: ${event.toolName}`);
  }
}
```

**Parameters:**
- `params` - Prompt parameters

**Returns:** `AsyncGenerator<SDKEvent>` - Async generator of SDK events

---

#### `sdk.streamInput(stream: AsyncIterable<PromptParams>): AsyncGenerator<SDKEvent>`

Stream input messages for multi-turn conversations.

```typescript
const prompts = [
  { message: 'First question' },
  { message: 'Follow-up question' },
];

for await (const event of sdk.streamInput(prompts)) {
  console.log(event);
}
```

**Parameters:**
- `stream` - Async iterable of prompt parameters

**Returns:** `AsyncGenerator<SDKEvent>` - Async generator of SDK events

---

#### `sdk.interrupt(): Promise<void>`

Interrupt the current query execution.

```typescript
process.on('SIGINT', async () => {
  await sdk.interrupt();
  await sdk.close();
  process.exit(0);
});
```

**Returns:** `Promise<void>`

---

#### `sdk.setPermissionMode(mode: PermissionMode | LegacyPermissionMode): Promise<void>`

Change the permission mode for the current session.

```typescript
await sdk.setPermissionMode('interactive');
```

**Parameters:**
- `mode` - Permission mode to set

**Returns:** `Promise<void>`

---

#### `sdk.setPlanMode(enabled: boolean): Promise<void>`

Enable or disable CLI-3 plan mode.

```typescript
await sdk.setPlanMode(true);
```

**Parameters:**
- `enabled` - Whether plan mode should be active

**Returns:** `Promise<void>`

---

#### `sdk.enablePlanMode(): Promise<void>`

Enable CLI-3 plan mode.

**Returns:** `Promise<void>`

---

#### `sdk.disablePlanMode(): Promise<void>`

Disable CLI-3 plan mode.

**Returns:** `Promise<void>`

---

#### `sdk.setModel(model?: string): Promise<void>`

Change the model used for subsequent responses.

```typescript
await sdk.setModel('openrouter/auto');
```

**Parameters:**
- `model` - The model identifier

**Returns:** `Promise<void>`

---

#### `sdk.setMaxThinkingTokens(maxThinkingTokens: number | null): Promise<void>`

Set the maximum number of thinking tokens.

```typescript
await sdk.setMaxThinkingTokens(200000); // 200K tokens
await sdk.setMaxThinkingTokens(null); // Disable thinking
```

**Parameters:**
- `maxThinkingTokens` - Maximum tokens for thinking, or null to disable

**Returns:** `Promise<void>`

---

#### `sdk.applyFlagSettings(settings: Partial<SDKConfig>): Promise<void>`

Merge settings into the flag settings layer.

```typescript
await sdk.applyFlagSettings({
  maxBudgetUsd: 10.0,
  maxTurns: 50,
});
```

**Parameters:**
- `settings` - Partial configuration to apply

**Returns:** `Promise<void>`

---

#### `sdk.initializationResult(): Promise<{ sessionId: string | null; model: string; workspace: string }>`

Get the full initialization result.

```typescript
const init = await sdk.initializationResult();
console.log(`Session: ${init.sessionId}`);
console.log(`Model: ${init.model}`);
console.log(`Workspace: ${init.workspace}`);
```

**Returns:** Session initialization data

---

#### `sdk.supportedCommands(): Promise<string[]>`

Get the list of available CLI commands.

```typescript
const commands = await sdk.supportedCommands();
console.log('Available commands:', commands);
```

**Returns:** `Promise<string[]>` - Array of command names

---

#### `sdk.supportedModels(): Promise<ModelInfo[]>`

Get the list of available models.

```typescript
const models = await sdk.supportedModels();
for (const model of models) {
  console.log(`${model.id}: ${model.displayName}`);
}
```

**Returns:** `Promise<ModelInfo[]>` - Array of model information objects

---

#### `sdk.supportedAgents(): Promise<AgentInfo[]>`

Get the list of available subagents.

```typescript
const agents = await sdk.supportedAgents();
for (const agent of agents) {
  console.log(`${agent.name}: ${agent.description}`);
}
```

**Returns:** `Promise<AgentInfo[]>` - Array of agent information objects

---

#### `sdk.mcpServerStatus(): Promise<unknown[]>`

Get the current status of all configured MCP servers.

```typescript
const status = await sdk.mcpServerStatus();
console.log('MCP servers:', status);
```

**Returns:** `Promise<unknown[]>` - Array of MCP server status objects

---

#### `sdk.getContextUsage(): Promise<ContextUsage>`

Get a breakdown of current context window usage.

```typescript
const usage = await sdk.getContextUsage();
console.log(`Total context: ${usage.tokens} / ${usage.limit} tokens`);
console.log(`Usage: ${(usage.percentage * 100).toFixed(1)}%`);
```

**Returns:** `Promise<ContextUsage>` - Context usage breakdown

---

#### `sdk.reloadPlugins(): Promise<unknown>`

Reload plugins from disk.

```typescript
await sdk.reloadPlugins();
```

**Returns:** Reload result

---

#### `sdk.accountInfo(): Promise<AccountInfo>`

Get information about the authenticated account.

```typescript
const account = await sdk.accountInfo();
console.log(`Email: ${account.email}`);
console.log(`Organization: ${account.organization}`);
```

**Returns:** `Promise<AccountInfo>` - Account information

---

#### `sdk.reconnectMcpServer(serverName: string): Promise<void>`

Reconnect an MCP server by name.

```typescript
await sdk.reconnectMcpServer('filesystem');
```

**Parameters:**
- `serverName` - The name of the MCP server to reconnect

**Returns:** `Promise<void>`

---

#### `sdk.toggleMcpServer(serverName: string, enabled: boolean): Promise<void>`

Enable or disable an MCP server by name.

```typescript
await sdk.toggleMcpServer('filesystem', false); // Disable
await sdk.toggleMcpServer('filesystem', true);  // Enable
```

**Parameters:**
- `serverName` - The name of the MCP server
- `enabled` - Whether to enable (true) or disable (false) the server

**Returns:** `Promise<void>`

---

#### `sdk.setMcpServers(servers: Record<string, McpServerConfig>): Promise<unknown>`

Dynamically set the MCP servers for this session.

```typescript
await sdk.setMcpServers({
  filesystem: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/files']
  }
});
```

**Parameters:**
- `servers` - Object mapping server names to their configurations

**Returns:** Configuration result

---

#### `sdk.rewindFiles(userMessageId: string, options?: { dryRun?: boolean }): Promise<{ canRewind: boolean; error?: string }>`

Rewind tracked files to their state at a specific user message.

```typescript
const result = await sdk.rewindFiles('msg-123', { dryRun: true });
if (result.canRewind) {
  await sdk.rewindFiles('msg-123'); // Perform the rewind
}
```

**Parameters:**
- `userMessageId` - The ID of the user message to rewind to
- `options` - Optional configuration
  - `dryRun?: boolean` - If true, only check if rewind is possible

**Returns:** Rewind result indicating success or failure

---

#### `sdk.tools: Tool[]` (property)

Set or get the tools available to the agent.

```typescript
sdk.tools = [Tool.READ, Tool.WRITE, Tool.EDIT];
const currentTools = sdk.tools;
```

---

#### `sdk.skills: SkillReference[]` (property)

Set or get the skills for the agent.

```typescript
sdk.skills = ['typescript', 'react'];
sdk.skills = ['typescript', './skills/my-custom/SKILL.md'];
sdk.skills = [
  'typescript',
  { name: 'my-skill', path: './skills/SKILL.md', scope: 'project' }
];
```

---

#### `sdk.setSystemPrompt(promptOrPath: string): this`

Replace the CLI system prompt for this session.

```typescript
sdk.setSystemPrompt('./SYSTEM_PROMPT.md');
```

**Parameters:**
- `promptOrPath` - Inline system prompt text or a prompt file path

**Returns:** The SDK instance for chaining

---

#### `sdk.appendSystemPrompt(promptOrPath: string): this`

Append instructions to the default CLI system prompt.

```typescript
sdk.appendSystemPrompt('Always run Bun checks before summarizing release readiness.');
```

**Parameters:**
- `promptOrPath` - Inline text or a prompt file path to append

**Returns:** The SDK instance for chaining

---

## RPC Client

### RPCClient

JSON-RPC client for communicating with the CLI (internal use).

#### `constructor(config: SDKConfig)`

Create a new RPCClient instance.

**Parameters:**
- `config` - Configuration options

---

#### `client.start(): Promise<void>`

Start the client and initialize the transport.

**Returns:** `Promise<void>`

---

#### `client.stop(): Promise<void>`

Stop the client and close the transport.

**Returns:** `Promise<void>`

---

#### `client.prompt(params: PromptParams): Promise<PromptResult>`

Send a prompt to the agent.

**Parameters:**
- `params` - Prompt parameters

**Returns:** `Promise<PromptResult>` - Result indicating success

---

#### `client.abort(params: AbortParams): Promise<AbortResult>`

Abort the current operation.

**Parameters:**
- `params` - Optional abort parameters

**Returns:** `Promise<AbortResult>` - Result indicating success

---

#### `client.getState(params: GetStateParams): Promise<GetStateResult>`

Get the current state.

**Parameters:**
- `params` - Optional state query parameters

**Returns:** `Promise<GetStateResult>` - Current agent state

---

#### `client.getMessages(params: GetMessagesParams): Promise<GetMessagesResult>`

Get conversation messages.

**Parameters:**
- `params` - Optional query parameters including limit

**Returns:** `Promise<GetMessagesResult>` - Message history

---

#### `client.permissionResponse(params: PermissionResponseParams): Promise<unknown>`

Respond to a permission request.

**Parameters:**
- `params` - Permission response parameters

**Returns:** Response result

---

#### `client.setPermissionMode(mode: PermissionMode | LegacyPermissionMode): Promise<unknown>`

Set permission mode.

**Parameters:**
- `mode` - Permission mode to set

**Returns:** Result of the operation

---

#### `client.setPlanMode(enabled: boolean): Promise<PlanModeSetResult>`

Enable or disable CLI plan mode.

**Parameters:**
- `enabled` - Whether plan mode should be active

**Returns:** `Promise<PlanModeSetResult>` - Result of the operation

---

#### `client.setModel(model?: string): Promise<unknown>`

Set model.

**Parameters:**
- `model` - Model identifier to set

**Returns:** Result of the operation

---

#### `client.setMaxThinkingTokens(maxThinkingTokens: number | null): Promise<unknown>`

Set max thinking tokens.

**Parameters:**
- `maxThinkingTokens` - Maximum thinking tokens, or null to disable

**Returns:** Result of the operation

---

#### `client.applyFlagSettings(settings: Record<string, unknown>): Promise<unknown>`

Apply flag settings.

**Parameters:**
- `settings` - Settings to apply

**Returns:** Result of the operation

---

#### `client.getSupportedModels(): Promise<unknown>`

Get supported models.

**Returns:** List of supported models

---

#### `client.getSupportedCommands(): Promise<unknown>`

Get supported commands.

**Returns:** List of supported commands

---

#### `client.getContextUsage(): Promise<unknown>`

Get context usage.

**Returns:** Context usage breakdown

---

#### `client.reloadPlugins(): Promise<unknown>`

Reload plugins.

**Returns:** Reload result

---

#### `client.getAccountInfo(): Promise<unknown>`

Get account info.

**Returns:** Account information

---

#### `client.toggleMcpServer(serverName: string, enabled: boolean): Promise<unknown>`

Toggle MCP server.

**Parameters:**
- `serverName` - Name of the MCP server
- `enabled` - Whether to enable or disable

**Returns:** Result of the operation

---

#### `client.reconnectMcpServer(serverName: string): Promise<unknown>`

Reconnect MCP server.

**Parameters:**
- `serverName` - Name of the MCP server

**Returns:** Result of the operation

---

#### `client.setMcpServers(servers: Record<string, unknown>): Promise<unknown>`

Set MCP servers.

**Parameters:**
- `servers` - Server configurations

**Returns:** Result of the operation

---

#### `client.getHooks(): Promise<GetHooksResult>`

Get all hooks and settings.

**Returns:** Hooks settings including all hook definitions

---

#### `client.addHook(params: AddHookParams): Promise<AddHookResult>`

Add a new hook.

**Parameters:**
- `params` - Hook definition to add

**Returns:** Result with success status and hook ID

---

#### `client.removeHook(params: RemoveHookParams): Promise<RemoveHookResult>`

Remove a hook by event and index.

**Parameters:**
- `params` - Event type and hook index

**Returns:** Result indicating success

---

#### `client.toggleHook(params: ToggleHookParams): Promise<ToggleHookResult>`

Toggle a hook's enabled status.

**Parameters:**
- `params` - Event type and hook index

**Returns:** Result with new enabled status

---

#### `client.testHook(params: TestHookParams): Promise<TestHookResult>`

Test a hook with a sample context.

**Parameters:**
- `params` - Hook definition to test

**Returns:** Execution result including stdout, stderr, and response

---

#### `client.request(method: string, params?: JsonRpcParams): Promise<unknown>`

Send a custom RPC request.

**Parameters:**
- `method` - RPC method name
- `params` - Method parameters

**Returns:** RPC response

---

#### `client.events(): AsyncGenerator<SDKEvent>`

Subscribe to events.

**Returns:** `AsyncGenerator<SDKEvent>` - Async generator yielding SDK events

---

#### `client.isConnected(): boolean`

Check if the client is connected.

**Returns:** `true` if the transport is running

---

## Transport Layer

### Transport

Transport layer for CLI subprocess communication (internal use).

#### `constructor(config: TransportConfig)`

Create a new Transport instance.

**Parameters:**
- `config` - Transport configuration options

---

#### `transport.start(): Promise<void>`

Start the transport and spawn the CLI subprocess.

**Returns:** `Promise<void>`

---

#### `transport.stop(): Promise<void>`

Stop the transport and terminate the CLI subprocess.

**Returns:** `Promise<void>`

---

#### `transport.request(method: string, params?: JsonRpcParams): Promise<unknown>`

Send a JSON-RPC request.

**Parameters:**
- `method` - RPC method name
- `params` - Method parameters

**Returns:** RPC response

---

#### `transport.onNotification(method: string, handler: (params: unknown) => void): void`

Register a notification handler.

**Parameters:**
- `method` - Notification method name
- `handler` - Handler function

---

#### `transport.isRunning(): boolean`

Check if the transport is running.

**Returns:** `true` if the transport is active

---

## Types

### SDKConfig

Main configuration interface for the SDK.

```typescript
interface SDKConfig {
  // Basic Configuration
  cwd?: string;
  cliPath?: string;
  debug?: boolean;
  timeout?: number;

  // Provider Configuration
  config?: CLIConfig;
  model?: string;
  fallbackModel?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  temperature?: number;
  provider?: ProviderName;
  apiKey?: string;
  baseUrl?: string;

  // OpenAI-specific options
  openaiAuthMode?: 'api-key' | 'chatgpt';
  reasoningEffort?: 'low' | 'medium' | 'high';
  chatgptAccessToken?: string;
  chatgptAccountId?: string;

  // Azure-specific options
  azureAuthMethod?: 'api-key' | 'entra-id' | 'managed-identity';
  azureTenantId?: string;
  azureClientId?: string;
  azureClientSecret?: string;
  azureResourceName?: string;
  azureDeploymentName?: string;
  azureApiVersion?: string;

  // Local provider options
  port?: number;

  // Tool Configuration
  canUseTool?: (toolName: string) => boolean | Promise<boolean>;

  // Permission Configuration
  permissionMode?: PermissionMode | LegacyPermissionMode;
  permissions?: PermissionSettings;
  yoloPattern?: string;
  yolo?: string;
  yoloTimeout?: number;
  planMode?: boolean;

  // Execution Mode Configuration
  autoMode?: boolean;
  unrestricted?: boolean;
  autoCommit?: boolean;
  maxIterations?: number;
  maxRuntime?: number;
  maxCost?: number;

  // Skills Configuration
  skills?: SkillSettings | SkillReference[];
  skillRefs?: SkillReference[];
  autoSkill?: boolean;

  // Context Configuration
  context?: ContextSettings;
  contextCompact?: boolean;

  // System Prompt Configuration
  sysPrompt?: string;
  systemPrompt?: string;
  appendSysPrompt?: string;
  appendSystemPrompt?: string;

  // Session Configuration
  session?: SessionSettings;
  persistSession?: boolean;
  sessionId?: string;
  resume?: boolean;
  continue?: boolean;

  // Workspace Configuration
  additionalDirectories?: string[];

  // Environment Configuration
  env?: Record<string, string>;
  envVars?: AutohandEnvVars;

  // Thinking Configuration
  thinking?: 'none' | 'normal' | 'extended' | { type: 'enabled', budgetTokens?: number } | { type: 'adaptive' };
  effort?: 'low' | 'medium' | 'high' | 'max';

  // Sandbox Configuration
  sandbox?: {
    enabled?: boolean;
    failIfUnavailable?: boolean;
    filesystem?: { /* ... */ };
    network?: { /* ... */ };
    ignoreViolations?: Record<string, string[]>;
  };

  // Additional Configuration
  addDir?: string[];
  enableFileCheckpointing?: boolean;
  mcpServers?: Record<string, McpServerConfig>;
  hooks?: HooksSettings;
  onElicitation?: (params: unknown) => unknown;
  plugins?: string[];
  outputFormat?: 'text' | 'json';
  agentsMd?: AgentsMdSettings;
  pathToClaudeCodeExecutable?: string;
  spawnClaudeCodeProcess?: boolean;
  extraArgs?: string[];
  debugFile?: string;
  strictMcpConfig?: boolean;
  betas?: string[];
  taskBudget?: number;
}
```

---

### PromptParams

Parameters for sending a prompt to the agent.

```typescript
interface PromptParams {
  message: string;
  context?: {
    files?: string[];
    selection?: {
      file: string;
      startLine: number;
      endLine: number;
      text: string;
    };
    agentsMd?: {
      content?: string;
      path?: string;
      auto?: true;
    };
  };
  images?: ImageAttachment[];
  thinkingLevel?: 'none' | 'normal' | 'extended';
  agentsMd?: string | { path?: string; content?: string; auto?: boolean };
}
```

---

### RunResult

Result of a completed run.

```typescript
interface RunResult {
  id: string;
  status: 'completed' | 'aborted';
  text: string;
  events: SDKEvent[];
}
```

---

### SDKEvent

Union type of all possible SDK events.

```typescript
type SDKEvent =
  | AgentStartEvent
  | AgentEndEvent
  | TurnStartEvent
  | TurnEndEvent
  | MessageStartEvent
  | MessageUpdateEvent
  | MessageEndEvent
  | ToolStartEvent
  | ToolUpdateEvent
  | ToolEndEvent
  | FileModifiedEvent
  | PermissionRequestEvent
  | ErrorEvent;
```

#### AgentStartEvent

```typescript
interface AgentStartEvent {
  type: 'agent_start';
  sessionId: string;
  model: string;
  workspace: string;
  timestamp: string;
}
```

#### AgentEndEvent

```typescript
interface AgentEndEvent {
  type: 'agent_end';
  sessionId: string;
  reason: 'completed' | 'aborted' | 'error';
  timestamp: string;
}
```

#### MessageUpdateEvent

```typescript
interface MessageUpdateEvent {
  type: 'message_update';
  delta: string;
  timestamp: string;
  messageId?: string;
  thought?: string;
}
```

#### ToolStartEvent

```typescript
interface ToolStartEvent {
  type: 'tool_start';
  toolId: string;
  toolName: string;
  args: Record<string, unknown>;
  timestamp: string;
}
```

#### ToolEndEvent

```typescript
interface ToolEndEvent {
  type: 'tool_end';
  toolId: string;
  toolName: string;
  success: boolean;
  timestamp: string;
  output?: string;
  error?: string;
}
```

#### PermissionRequestEvent

```typescript
interface PermissionRequestEvent {
  type: 'permission_request';
  requestId: string;
  tool: string;
  description: string;
  context: {
    command?: string;
    path?: string;
    args?: string[];
  };
  timestamp: string;
  options?: string[];
}
```

#### ErrorEvent

```typescript
interface ErrorEvent {
  type: 'error';
  code: number;
  message: string;
  recoverable: boolean;
  timestamp: string;
}
```

---

### PermissionMode

Permission modes matching CLI-3.

```typescript
type PermissionMode = 'interactive' | 'unrestricted' | 'restricted' | 'external';
```

---

### LegacyPermissionMode

Legacy permission mode aliases.

```typescript
type LegacyPermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'plan'
  | 'dontAsk'
  | 'auto'
  | 'ask'
  | 'yolo';
```

---

### PermissionDecision

CLI-3 permission prompt decisions.

```typescript
type PermissionDecision =
  | 'allow_once'
  | 'deny_once'
  | 'allow_session'
  | 'deny_session'
  | 'allow_always_project'
  | 'allow_always_user'
  | 'deny_always_project'
  | 'deny_always_user'
  | 'alternative';
```

---

### PermissionDecisionScope

Persistence scope for ergonomic permission helpers.

```typescript
type PermissionDecisionScope = 'once' | 'session' | 'project' | 'user';
```

---

### ProviderName

Available providers in CLI-3.

```typescript
type ProviderName = 'openrouter' | 'ollama' | 'llamacpp' | 'openai' | 'mlx' | 'llmgateway' | 'azure' | 'zai' | 'xai' | 'cerebras' | 'deepseek' | 'vertexai' | 'nvidia';
```

---

### SkillReference

Skill reference - either a skill name or a file path to a SKILL.md file.

```typescript
type SkillReference =
  | string // Skill name or file path (auto-detected)
  | { name: string; path: string; scope?: 'user' | 'project' }; // Explicit skill with name and path
```

---

### ContextUsage

Context usage information.

```typescript
interface ContextUsage {
  tokens: number;
  limit: number;
  percentage: number;
  warning: boolean;
}
```

---

### SessionStats

Session statistics.

```typescript
interface SessionStats {
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  duration: number;
  toolCallCount: number;
  startedAt: string;
  endedAt?: string;
}
```

---

### AutohandEnvVars

AUTOHAND_ prefixed environment variables supported by CLI-3.

```typescript
interface AutohandEnvVars {
  AUTOHAND_HOME?: string;
  AUTOHAND_API_URL?: string;
  AUTOHAND_CONFIG?: string;
  AUTOHAND_DEBUG?: string;
  AUTOHAND_CLIENT_NAME?: string;
  AUTOHAND_CLIENT_VERSION?: string;
  AUTOHAND_CODE?: string;
  AUTOHAND_LOCALE?: string;
  AUTOHAND_NO_BANNER?: string;
  AUTOHAND_NON_INTERACTIVE?: string;
  AUTOHAND_PERMISSION_CALLBACK_TIMEOUT?: string;
  AUTOHAND_PERMISSION_CALLBACK_URL?: string;
  AUTOHAND_SECRET?: string;
  AUTOHAND_SHARE_URL?: string;
  AUTOHAND_SKIP_PING?: string;
  AUTOHAND_SKIP_UPDATE_CHECK?: string;
  AUTOHAND_STREAM_TOOL_OUTPUT?: string;
  AUTOHAND_TERMINAL_REGIONS?: string;
  AUTOHAND_THINKING_LEVEL?: string;
  AUTOHAND_TMUX_LAUNCHED?: string;
  AUTOHAND_YES?: string;
}
```

---

## Enums

### Tool

Available tools for the agent.

```typescript
enum Tool {
  // Filesystem tools
  READ_FILE = 'read_file',
  WRITE_FILE = 'write_file',
  APPEND_FILE = 'append_file',
  APPLY_PATCH = 'apply_patch',
  FIND = 'find',
  SEARCH = 'search',
  SEARCH_REPLACE = 'search_replace',
  SEARCH_WITH_CONTEXT = 'search_with_context',
  SEMANTIC_SEARCH = 'semantic_search',
  LIST_TREE = 'list_tree',
  FILE_STATS = 'file_stats',
  CREATE_DIRECTORY = 'create_directory',
  DELETE_PATH = 'delete_path',
  RENAME_PATH = 'rename_path',
  COPY_PATH = 'copy_path',
  MULTI_FILE_EDIT = 'multi_file_edit',

  // Shell tools
  RUN_COMMAND = 'run_command',
  CUSTOM_COMMAND = 'custom_command',

  // Git tools
  GIT_STATUS = 'git_status',
  GIT_DIFF = 'git_diff',
  GIT_DIFF_RANGE = 'git_diff_range',
  GIT_LOG = 'git_log',
  GIT_ADD = 'git_add',
  GIT_COMMIT = 'git_commit',
  GIT_BRANCH = 'git_branch',
  GIT_SWITCH = 'git_switch',
  GIT_STASH = 'git_stash',
  GIT_STASH_LIST = 'git_stash_list',
  GIT_STASH_POP = 'git_stash_pop',
  GIT_STASH_APPLY = 'git_stash_apply',
  GIT_STASH_DROP = 'git_stash_drop',
  GIT_MERGE = 'git_merge',
  GIT_REBASE = 'git_rebase',
  GIT_CHERRY_PICK = 'git_cherry_pick',
  GIT_FETCH = 'git_fetch',
  GIT_PULL = 'git_pull',
  GIT_PUSH = 'git_push',
  AUTO_COMMIT = 'auto_commit',
  GIT_APPLY_PATCH = 'git_apply_patch',
  GIT_WORKTREE_LIST = 'git_worktree_list',
  GIT_WORKTREE_ADD = 'git_worktree_add',
  GIT_WORKTREE_REMOVE = 'git_worktree_remove',

  // Web tools
  WEB_SEARCH = 'web_search',

  // Notebook tools
  NOTEBOOK_READ = 'notebook_read',
  NOTEBOOK_EDIT = 'notebook_edit',

  // Dependency tools
  ADD_DEPENDENCY = 'add_dependency',
  REMOVE_DEPENDENCY = 'remove_dependency',

  // Memory tools
  SAVE_MEMORY = 'save_memory',
  RECALL_MEMORY = 'recall_memory',

  // Planning tools
  PLAN = 'plan',
  TODO_WRITE = 'todo_write',

  // Formatter tools
  FORMAT_FILE = 'format_file',
  FORMAT_DIRECTORY = 'format_directory',
  LIST_FORMATTERS = 'list_formatters',
  CHECK_FORMATTING = 'check_formatting',

  // Linter tools
  LINT_FILE = 'lint_file',
  LINT_DIRECTORY = 'lint_directory',
  LIST_LINTERS = 'list_linters',
}
```

---

## Helper Functions

### loadConfigFrom

Load SDK configuration from a file.

```typescript
async function loadConfigFrom(configPath: string): Promise<SDKConfig>
```

Supports JSON, TOML, and YAML configuration files.

**Parameters:**
- `configPath` - Path to the configuration file

**Returns:** `Promise<SDKConfig>` - Parsed configuration object

---

### loadWorkspaceConfig

Load config from workspace directory (merges with global config if available).

```typescript
async function loadWorkspaceConfig(workspaceRoot?: string): Promise<SDKConfig>
```

**Parameters:**
- `workspaceRoot` - Optional workspace root path (defaults to process.cwd())

**Returns:** `Promise<SDKConfig>` - Merged configuration

---

### loadAgentsMd

Load AGENTS.md content from various sources.

```typescript
async function loadAgentsMd(source: string): Promise<string>
```

Supports relative paths, absolute paths, file:// URLs, and https:// URLs.

**Parameters:**
- `source` - The source path or URL

**Returns:** `Promise<string>` - The content of AGENTS.md

---

### createDefaultAgentsMd

Create a default AGENTS.md template.

```typescript
function createDefaultAgentsMd(projectName?: string): string
```

**Parameters:**
- `projectName` - Optional project name

**Returns:** `string` - The default AGENTS.md content

---

### detectProviderFromModel

Detect provider from model ID.

```typescript
function detectProviderFromModel(model: string): ProviderName
```

**Parameters:**
- `model` - Model identifier

**Returns:** `ProviderName` - Detected provider name

---

### validateProviderConfig

Validate provider-specific configuration options.

```typescript
function validateProviderConfig(provider: ProviderName, config: SDKConfig): void
```

**Parameters:**
- `provider` - Provider name
- `config` - Configuration to validate

**Throws:** `ProviderConfigError` If configuration is invalid

---

### isSkillFilePath

Detect if a skill reference is a file path.

```typescript
function isSkillFilePath(ref: SkillReference): ref is string
```

**Parameters:**
- `ref` - Skill reference

**Returns:** Type guard indicating if the reference is a file path

---

### getSkillName

Extract skill name from a reference.

```typescript
function getSkillName(ref: SkillReference): string
```

**Parameters:**
- `ref` - Skill reference

**Returns:** `string` - Skill name

---

### getSkillPath

Extract file path from a reference (if applicable).

```typescript
function getSkillPath(ref: SkillReference): string | undefined
```

**Parameters:**
- `ref` - Skill reference

**Returns:** `string | undefined` - File path or undefined

---

### parseJsonText

Parse JSON from agent response text.

```typescript
function parseJsonText(text: string): unknown
```

Handles direct JSON, fenced code blocks, and embedded JSON.

**Parameters:**
- `text` - Response text to parse

**Returns:** `unknown` - Parsed JSON value

**Throws:** `StructuredOutputError` If valid JSON cannot be found

---

## Error Classes

### StructuredOutputError

Error thrown when JSON parsing fails.

```typescript
class StructuredOutputError extends Error {
  readonly rawResponse: string;
  constructor(message: string, rawResponse: string);
}
```

---

### ProviderConfigError

Error thrown when provider configuration is invalid.

```typescript
class ProviderConfigError extends Error {
  constructor(message: string);
}
```
