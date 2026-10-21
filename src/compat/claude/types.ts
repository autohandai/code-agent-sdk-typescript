import type { ProviderName } from '../../types/index.js';
import type { McpSdkServerConfigWithInstance } from './mcp.js';

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto';
export type SettingSource = 'user' | 'project' | 'local';
export type JsonSchema = Record<string, unknown>;

export interface AgentDefinition {
  description: string;
  prompt: string;
  tools?: string[];
  disallowedTools?: string[];
  model?: string;
  [option: string]: unknown;
}

export type McpServerConfig =
  | { type?: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'http' | 'sse'; url: string; headers?: Record<string, string> }
  | McpSdkServerConfigWithInstance;

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface SDKUserMessage {
  type: 'user';
  message: { role: 'user'; content: string | ContentBlock[] };
  parent_tool_use_id?: string | null;
  uuid?: string;
  session_id?: string;
}

export type PermissionResult =
  | { behavior: 'allow'; updatedInput?: Record<string, unknown>; updatedPermissions?: unknown[] }
  | { behavior: 'deny'; message: string; interrupt?: boolean };
export type CanUseTool = (toolName: string, input: Record<string, unknown>, context: {
  signal: AbortSignal; toolUseID: string; requestId: string; suggestions: unknown[];
}) => Promise<PermissionResult | null>;

export interface Options {
  cwd?: string;
  env?: Record<string, string | undefined>;
  apiKey?: string;
  provider?: ProviderName;
  baseUrl?: string;
  model?: string;
  permissionMode?: PermissionMode;
  allowDangerouslySkipPermissions?: boolean;
  allowedTools?: string[];
  disallowedTools?: string[];
  tools?: string[] | { type: 'preset'; preset: 'claude_code' };
  systemPrompt?: string | string[] | { type: 'custom'; prompt: string; snapshot?: unknown }
    | { type: 'preset'; preset: 'claude_code'; append?: string; [option: string]: unknown };
  mcpServers?: Record<string, McpServerConfig>;
  agents?: Record<string, AgentDefinition>;
  additionalDirectories?: string[];
  abortController?: AbortController;
  includePartialMessages?: boolean;
  resume?: string;
  continue?: boolean;
  forkSession?: boolean;
  sessionId?: string;
  persistSession?: boolean;
  pathToClaudeCodeExecutable?: string;
  cliPath?: string;
  debug?: boolean;
  stderr?: (data: string) => void;
  maxTurns?: number;
  maxBudgetUsd?: number;
  maxThinkingTokens?: number;
  canUseTool?: CanUseTool;
  outputFormat?: { type: 'json_schema'; schema: JsonSchema };
  settingSources?: SettingSource[];
  isolation?: 'worktree';
  [option: string]: unknown;
}

export interface SDKSystemMessage {
  type: 'system'; subtype: 'init'; uuid: string; session_id: string;
  apiKeySource: string; claude_code_version: string; cwd: string;
  tools: string[]; mcp_servers: Array<{ name: string; status: string }>;
  model: string; permissionMode: PermissionMode; slash_commands: string[];
  output_style: string; skills: string[]; plugins: unknown[]; agents?: string[];
}

export interface SDKAssistantMessage {
  type: 'assistant'; uuid: string; session_id: string; parent_tool_use_id: string | null;
  message: { id: string; type: 'message'; role: 'assistant'; model: string;
    content: ContentBlock[]; stop_reason: string | null; stop_sequence: string | null;
    usage: null };
}

export interface SDKPartialAssistantMessage {
  type: 'stream_event'; uuid: string; session_id: string; parent_tool_use_id: string | null;
  event: { type: 'content_block_delta'; index: number; delta:
    { type: 'text_delta'; text: string } | { type: 'thinking_delta'; thinking: string } };
}

export interface SDKResultBase {
  type: 'result'; uuid: string; session_id: string;
  duration_ms: number; duration_api_ms: number | null;
  is_error: boolean; num_turns: number | null; stop_reason: string | null;
  total_cost_usd: number | null; usage: null; modelUsage: null;
  permission_denials: Array<{ tool_name: string; tool_use_id: string; tool_input: Record<string, unknown> }>;
  autohand: { provider: string; usageStatus: 'unavailable'; observedTurns: number;
    creditsUsed: number | null; planFile?: string; worktreeBranch?: string };
}
export type SDKResultSuccess = SDKResultBase & { subtype: 'success'; result: string; structured_output?: unknown };
export type SDKResultError = SDKResultBase & { subtype: 'error_during_execution' | 'error_max_turns' | 'error_max_budget_usd' | 'error_max_structured_output_retries'; errors: string[] };
export type SDKResultMessage = SDKResultSuccess | SDKResultError;
export interface SDKCompactBoundaryMessage {
  type: 'system'; subtype: 'compact_boundary'; uuid: string; session_id: string;
  compact_metadata: { trigger: 'manual' | 'auto'; pre_tokens: number | null };
}
export type SDKMessage = SDKSystemMessage | SDKAssistantMessage | SDKUserMessage |
  SDKResultMessage | SDKPartialAssistantMessage | SDKCompactBoundaryMessage;

export interface Query extends AsyncGenerator<SDKMessage, void, unknown> {
  interrupt(): Promise<void>;
  setModel(model?: string): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  initializationResult(): Promise<SDKSystemMessage>;
  supportedCommands(): Promise<Array<{ name: string; description: string; argumentHint: string }>>;
  mcpServerStatus(): Promise<Array<{ name: string; status: string }>>;
  close(): Promise<void>;
}
