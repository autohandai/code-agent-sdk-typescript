/**
 * Type definitions for Autohand CLI Wrapper SDK
 * Based on CLI RPC protocol at cli-3/src/modes/rpc/types.ts
 */

// ============================================================================
// JSON-RPC 2.0 Base Types
// ============================================================================

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: JsonRpcParams;
  id?: JsonRpcId;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: JsonRpcError;
  id: JsonRpcId;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type JsonRpcId = string | number | null;
export type JsonRpcParams = Record<string, unknown> | unknown[];

// ============================================================================
// Provider Detection
// ============================================================================

/**
 * Available providers in CLI-3
 */
export type ProviderName = 'openrouter' | 'ollama' | 'llamacpp' | 'openai' | 'mlx' | 'llmgateway' | 'azure' | 'zai';

/**
 * Validation error for provider-specific options
 */
export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderConfigError';
  }
}

/**
 * Validate provider-specific configuration options
 * 
 * @throws {ProviderConfigError} If configuration is invalid for the specified provider
 */
export function validateProviderConfig(provider: ProviderName, config: SDKConfig): void {
  switch (provider) {
    case 'openai':
      validateOpenAIConfig(config);
      break;
    case 'azure':
      validateAzureConfig(config);
      break;
    case 'zai':
    case 'openrouter':
    case 'llmgateway':
      validateCloudProviderConfig(provider, config);
      break;
    case 'ollama':
    case 'llamacpp':
    case 'mlx':
      validateLocalProviderConfig(provider, config);
      break;
  }
}

function validateOpenAIConfig(config: SDKConfig): void {
  if (config.openaiAuthMode && !['api-key', 'chatgpt'].includes(config.openaiAuthMode)) {
    throw new ProviderConfigError(
      `Invalid openaiAuthMode: ${config.openaiAuthMode}. Must be 'api-key' or 'chatgpt'`
    );
  }

  if (config.reasoningEffort && !['low', 'medium', 'high'].includes(config.reasoningEffort)) {
    throw new ProviderConfigError(
      `Invalid reasoningEffort: ${config.reasoningEffort}. Must be 'low', 'medium', or 'high'`
    );
  }

  if (config.openaiAuthMode === 'chatgpt') {
    if (!config.chatgptAccessToken) {
      throw new ProviderConfigError('chatgptAccessToken is required when openaiAuthMode is chatgpt');
    }
    if (!config.chatgptAccountId) {
      throw new ProviderConfigError('chatgptAccountId is required when openaiAuthMode is chatgpt');
    }
  }
}

function validateAzureConfig(config: SDKConfig): void {
  if (config.azureAuthMethod && !['api-key', 'entra-id', 'managed-identity'].includes(config.azureAuthMethod)) {
    throw new ProviderConfigError(
      `Invalid azureAuthMethod: ${config.azureAuthMethod}. Must be 'api-key', 'entra-id', or 'managed-identity'`
    );
  }

  const authMethod = config.azureAuthMethod ?? 'api-key';

  if (authMethod === 'entra-id') {
    if (!config.azureTenantId) {
      throw new ProviderConfigError('azureTenantId is required when azureAuthMethod is entra-id');
    }
    if (!config.azureClientId) {
      throw new ProviderConfigError('azureClientId is required when azureAuthMethod is entra-id');
    }
    if (!config.azureClientSecret) {
      throw new ProviderConfigError('azureClientSecret is required when azureAuthMethod is entra-id');
    }
  }

  if (authMethod === 'api-key' && !config.apiKey) {
    throw new ProviderConfigError('apiKey is required when azureAuthMethod is api-key');
  }
}

function validateCloudProviderConfig(provider: ProviderName, config: SDKConfig): void {
  if (!config.apiKey) {
    console.warn(`Warning: apiKey not provided for ${provider}. The CLI may fail to authenticate.`);
  }
}

function validateLocalProviderConfig(provider: ProviderName, config: SDKConfig): void {
  if (config.port && (config.port < 1 || config.port > 65535)) {
    throw new ProviderConfigError(
      `Invalid port: ${config.port}. Must be between 1 and 65535`
    );
  }

  if (!config.baseUrl && provider === 'llamacpp') {
    console.warn(`Warning: baseUrl not provided for ${provider}. Using default http://localhost:${config.port ?? 80}`);
  }
}

/**
 * Detect provider from model ID
 * Based on model ID patterns used by different providers
 */
export function detectProviderFromModel(model: string): ProviderName {
  if (!model) return 'openrouter';

  const modelLower = model.toLowerCase();

  // Zai models (glm-4.5, etc.)
  if (modelLower.includes('glm') || modelLower.includes('z-ai')) {
    return 'zai';
  }

  // OpenRouter models (most models with /)
  if (modelLower.includes('/') && !modelLower.includes('gpt') && !modelLower.includes('claude')) {
    return 'openrouter';
  }

  // OpenAI models
  if (modelLower.includes('gpt') || modelLower.includes('o1') || modelLower.includes('chatgpt')) {
    return 'openai';
  }

  // Anthropic models (Claude)
  if (modelLower.includes('claude')) {
    return 'openrouter'; // Claude typically uses OpenRouter
  }

  // Azure models
  if (modelLower.includes('azure') || modelLower.startsWith('gpt-4') || modelLower.startsWith('gpt-5')) {
    return 'azure';
  }

  // Local providers - default to ollama for common local model names
  if (modelLower.includes('llama') || modelLower.includes('mistral') || modelLower.includes('codellama')) {
    return 'ollama';
  }

  // Default to openrouter for unknown models
  return 'openrouter';
}

// ============================================================================
// Permission Types
// ============================================================================

/**
 * Permission modes matching CLI-3
 */
export type PermissionMode = 'interactive' | 'unrestricted' | 'restricted' | 'external';

/**
 * Permission rule for fine-grained control
 */
export interface PermissionRule {
  /** Tool name (e.g., 'run_command', 'delete_path') */
  tool: string;
  /** Pattern to match (glob-style, e.g., 'npm *', 'git status') */
  pattern?: string;
  /** Action to take when matched */
  action: 'allow' | 'deny' | 'prompt';
}

/**
 * Permission settings matching CLI-3
 */
export interface PermissionSettings {
  /** Permission mode */
  mode?: PermissionMode;
  /** Commands/tools that never require approval */
  allowList?: string[];
  /** Commands/tools that are always blocked */
  denyList?: string[];
  /** Custom rules for fine-grained control */
  rules?: PermissionRule[];
  /** Remember user decisions for this session */
  rememberSession?: boolean;
  /** Patterns that are always denied (checked before allowPatterns) */
  denyPatterns?: string[];
  /** Patterns that are always allowed (checked after denyPatterns) */
  allowPatterns?: string[];
  /** If non-empty, only tools matching these patterns are allowed */
  availableTools?: string[];
  /** Tools matching these patterns are always excluded/denied */
  excludedTools?: string[];
  /** If true, all file-path tools are allowed without prompting */
  allPathsAllowed?: boolean;
  /** If true, all URL-fetching tools are allowed without prompting */
  allUrlsAllowed?: boolean;
}

// ============================================================================
// Skill Types
// ============================================================================

/**
 * Source locations where skills can be found
 */
export type SkillSource =
  | 'codex-user'       // ~/.codex/skills/**/SKILL.md (recursive)
  | 'codex-project'    // <cwd>/.codex/skills/**/SKILL.md (recursive)
  | 'claude-user'      // ~/.claude/skills/*/SKILL.md (one level)
  | 'claude-project'   // <cwd>/.claude/skills/*/SKILL.md (one level)
  | 'autohand-user'    // ~/.autohand/skills/**/SKILL.md (recursive)
  | 'autohand-project' // <cwd>/.autohand/skills/**/SKILL.md (recursive)
  | 'community';       // Downloaded from community API

/**
 * Skill frontmatter parsed from SKILL.md YAML header
 */
export interface SkillFrontmatter {
  /** Required: Skill name */
  name: string;
  /** Required: Description of what the skill does */
  description: string;
  /** Optional: License identifier */
  license?: string;
  /** Optional: Compatibility notes */
  compatibility?: string;
  /** Optional: Additional metadata */
  metadata?: Record<string, string>;
  /** Optional: Space-delimited list of allowed tools */
  'allowed-tools'?: string;
}

/**
 * Full skill definition
 */
export interface SkillDefinition extends SkillFrontmatter {
  /** Full markdown body content */
  body: string;
  /** Absolute path to the source SKILL.md file */
  path: string;
  /** Where this skill was loaded from */
  source: SkillSource;
  /** Whether this skill is currently active */
  isActive: boolean;
}

/**
 * Skill settings for SDK
 */
export interface SkillSettings {
  /** Enable automatic skill selection */
  autoSkill?: boolean;
  /** Specific skills to load (by name) */
  skills?: string[];
  /** Skill sources to search */
  sources?: SkillSource[];
  /** Whether to install missing skills from community */
  installMissing?: boolean;
}

// ============================================================================
// Context Management Types
// ============================================================================

/**
 * Context usage information
 */
export interface ContextUsage {
  /** Current token count */
  tokens: number;
  /** Maximum token limit */
  limit: number;
  /** Usage percentage (0-1) */
  percentage: number;
  /** Whether context is approaching limit */
  warning: boolean;
}

/**
 * Context settings for SDK
 */
export interface ContextSettings {
  /** Enable context compaction */
  contextCompact?: boolean;
  /** Maximum context window in tokens */
  maxTokens?: number;
  /** Threshold for starting compression (0-1) */
  compressionThreshold?: number;
  /** Threshold for starting summarization (0-1) */
  summarizationThreshold?: number;
  /** Callback when context is cropped */
  onCrop?: (croppedCount: number, reason: string) => void;
  /** Callback when approaching warning threshold */
  onWarning?: (usage: ContextUsage) => void;
}

// ============================================================================
// Stats Tracking Types
// ============================================================================

/**
 * Session statistics
 */
export interface SessionStats {
  /** Total cost in USD */
  totalCost: number;
  /** Total tokens used */
  totalTokens: number;
  /** Input tokens used */
  inputTokens: number;
  /** Output tokens used */
  outhutTokens: number;
  /** Number of requests made */
  requestCount: number;
  /** Session duration in seconds */
  duration: number;
  /** Number of tool calls */
  toolCallCount: number;
  /** Start timestamp */
  startedAt: string;
  /** End timestamp */
  endedAt?: string;
}

// ============================================================================
// Session Management Types
// ============================================================================

/**
 * Session type
 */
export type SessionType = 'interactive' | 'automode';

/**
 * Session metadata
 */
export interface SessionMetadata {
  sessionId: string;
  createdAt: string;
  lastActiveAt: string;
  closedAt?: string;
  projectPath: string;
  projectName: string;
  model: string;
  messageCount: number;
  summary?: string;
  status: 'active' | 'completed' | 'crashed';
  exitCode?: number;
  type?: SessionType;
  automodePrompt?: string;
  automodeIterations?: number;
  client?: string;
  clientVersion?: string;
}

/**
 * Session settings for SDK
 */
export interface SessionSettings {
  /** Persist session to disk */
  persistSession?: boolean;
  /** Session ID to resume */
  sessionId?: string;
  /** Resume from last session */
  resume?: boolean;
  /** Continue from last session */
  continue?: boolean;
  /** Session storage path */
  sessionPath?: string;
  /** Auto-save interval in seconds */
  autoSaveInterval?: number;
}

// ============================================================================
// AGENTS.md Types
// ============================================================================

/**
 * AGENTS.md settings for SDK
 */
export interface AgentsMdSettings {
  /** Enable AGENTS.md usage */
  enable?: boolean;
  /** Create AGENTS.md if it doesn't exist */
  create?: boolean;
  /** Path to AGENTS.md (supports relative path, file:///, https://) */
  path?: string;
  /** Auto-update AGENTS.md with discovered patterns */
  autoUpdate?: boolean;
  /** Include tech stack in AGENTS.md */
  includeTechStack?: boolean;
  /** Include commands in AGENTS.md */
  includeCommands?: boolean;
  /** Include skills in AGENTS.md */
  includeSkills?: boolean;
  /** Include conventions in AGENTS.md */
  includeConventions?: boolean;
}

// ============================================================================
// Tool and Permission Enums
// ============================================================================

/**
 * Available tools for the agent
 * These match the actual tool names used in the CLI-3/library SDK
 */
export enum Tool {
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

// ============================================================================
// JSON-RPC 2.0 Standard Error Codes
// ============================================================================

export const JSON_RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  EXECUTION_ERROR: -32000,
  PERMISSION_DENIED: -32001,
  TIMEOUT: -32002,
  AGENT_BUSY: -32003,
  ABORTED: -32004,
} as const;

export type JsonRpcErrorCode = (typeof JSON_RPC_ERROR_CODES)[keyof typeof JSON_RPC_ERROR_CODES];

// ============================================================================
// SDK Configuration
// ============================================================================

/**
 * Load SDK configuration from a file
 * 
 * Supports JSON, TOML, and YAML configuration files.
 * 
 * @param configPath - Path to the configuration file (e.g., ~/.autohand/config.json, ~/.autohand/config.toml, ~/.autohand/config.yaml)
 * @returns Parsed configuration object
 * @throws {Error} If the file cannot be read or parsed
 * 
 * @example
 * ```typescript
 * const config = loadConfigFrom('~/.autohand/config.json');
 * const sdk = new AutohandSDK(config);
 * ```
 * @example
 * ```typescript
 * const config = loadConfigFrom('~/.autohand/config.toml');
 * const sdk = new AutohandSDK(config);
 * ```
 */
export async function loadConfigFrom(configPath: string): Promise<SDKConfig> {
  const fs = await import('fs');
  const os = await import('os');
  
  // Expand ~ to home directory
  const expandedPath = configPath.replace(/^~/, os.homedir());
  
  try {
    const content = fs.readFileSync(expandedPath, 'utf-8');
    const ext = configPath.split('.').pop()?.toLowerCase();
    
    let config: SDKConfig;
    switch (ext) {
      case 'json':
        config = JSON.parse(content) as SDKConfig;
        break;
      case 'toml':
        try {
          // @ts-expect-error - toml package is optional
          const toml = await import('toml');
          config = toml.parse(content) as SDKConfig;
        } catch (e) {
          throw new Error('TOML parser not installed. Install with: npm install toml');
        }
        break;
      case 'yaml':
      case 'yml':
        try {
          // @ts-expect-error - yaml package is optional
          const yaml = await import('yaml');
          config = yaml.parse(content) as SDKConfig;
        } catch (e) {
          throw new Error('YAML parser not installed. Install with: npm install yaml');
        }
        break;
      default:
        // Try JSON as fallback
        try {
          config = JSON.parse(content) as SDKConfig;
        } catch {
          throw new Error(`Unsupported config format: ${ext}. Supported formats: json, toml, yaml, yml`);
        }
    }
    
    // Merge with environment variables
    return mergeEnvVariables(config);
  } catch (error) {
    throw new Error(`Failed to load config from ${expandedPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Load config from workspace directory (merges with global config if available)
 */
export async function loadWorkspaceConfig(workspaceRoot?: string): Promise<SDKConfig> {
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  
  const workspace = workspaceRoot ?? process.cwd();
  const workspaceConfigPath = path.join(workspace, '.autohand', 'config.json');
  const globalConfigPath = path.join(os.homedir(), '.autohand', 'config.json');
  
  let globalConfig: SDKConfig = {};
  let workspaceConfig: SDKConfig = {};
  
  // Load global config if it exists
  if (fs.existsSync(globalConfigPath)) {
    try {
      globalConfig = await loadConfigFrom(globalConfigPath);
    } catch (error) {
      console.warn(`Failed to load global config from ${globalConfigPath}:`, error);
    }
  }
  
  // Load workspace config if it exists
  if (fs.existsSync(workspaceConfigPath)) {
    try {
      workspaceConfig = await loadConfigFrom(workspaceConfigPath);
    } catch (error) {
      console.warn(`Failed to load workspace config from ${workspaceConfigPath}:`, error);
    }
  }
  
  // Merge workspace config over global config (workspace takes precedence)
  const mergedConfig = { ...globalConfig, ...workspaceConfig };
  
  // Merge with environment variables
  return mergeEnvVariables(mergedConfig);
}

/**
 * Merge environment variables into config
 */
function mergeEnvVariables(config: SDKConfig): SDKConfig {
  const merged = { ...config };
  
  // Provider-specific environment variables
  if (process.env.OPENROUTER_API_KEY && !merged.apiKey) {
    merged.apiKey = process.env.OPENROUTER_API_KEY;
  }
  if (process.env.OPENAI_API_KEY && !merged.apiKey) {
    merged.apiKey = process.env.OPENAI_API_KEY;
  }
  if (process.env.AZURE_API_KEY && !merged.apiKey) {
    merged.apiKey = process.env.AZURE_API_KEY;
  }
  if (process.env.ZAI_API_KEY && !merged.apiKey) {
    merged.apiKey = process.env.ZAI_API_KEY;
  }
  
  // Azure-specific environment variables
  if (process.env.AZURE_TENANT_ID && !merged.azureTenantId) {
    merged.azureTenantId = process.env.AZURE_TENANT_ID;
  }
  if (process.env.AZURE_CLIENT_ID && !merged.azureClientId) {
    merged.azureClientId = process.env.AZURE_CLIENT_ID;
  }
  if (process.env.AZURE_CLIENT_SECRET && !merged.azureClientSecret) {
    merged.azureClientSecret = process.env.AZURE_CLIENT_SECRET;
  }
  
  // Model from environment
  if (process.env.AUTOHAND_MODEL && !merged.model) {
    merged.model = process.env.AUTOHAND_MODEL;
  }
  
  return merged;
}

/**
 * Load AGENTS.md content from various sources
 * 
 * Supports:
 * - Relative paths (e.g., './AGENTS.md', 'AGENTS.md')
 * - Absolute paths (e.g., '/path/to/AGENTS.md')
 * - file:/// URLs (e.g., 'file:///path/to/AGENTS.md')
 * - https:// URLs (e.g., 'https://example.com/AGENTS.md')
 * 
 * @param source - The source path or URL
 * @returns The content of AGENTS.md
 * @throws {Error} If the source cannot be loaded
 */
export async function loadAgentsMd(source: string): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  
  // Handle file:/// URLs
  if (source.startsWith('file:///')) {
    const filePath = source.replace('file://', '');
    if (!fs.existsSync(filePath)) {
      throw new Error(`AGENTS.md not found at ${filePath}`);
    }
    return fs.readFileSync(filePath, 'utf-8');
  }
  
  // Handle https:// URLs
  if (source.startsWith('https://')) {
    try {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Failed to fetch AGENTS.md from ${source}: ${response.statusText}`);
      }
      return await response.text();
    } catch (error) {
      throw new Error(`Failed to fetch AGENTS.md from ${source}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Handle relative and absolute paths
  let filePath: string;
  if (path.isAbsolute(source)) {
    filePath = source;
  } else {
    // Expand ~ to home directory
    filePath = source.replace(/^~/, os.homedir());
    // Resolve relative to current working directory
    filePath = path.resolve(process.cwd(), filePath);
  }
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`AGENTS.md not found at ${filePath}`);
  }
  
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Create a default AGENTS.md template
 * 
 * @param projectName - Optional project name
 * @returns The default AGENTS.md content
 */
export function createDefaultAgentsMd(projectName?: string): string {
  return `# Project Autopilot${projectName ? ` - ${projectName}` : ''}

This file helps AI assistants understand your project structure, conventions, and workflows.

## Tech Stack

<!-- Add your project's tech stack here -->

## Commands

<!-- Add commonly used commands here -->

## Conventions

<!-- Add project-specific conventions here -->

## Skills

<!-- Add skills that are useful for this project -->

`;
}

export interface SDKConfig {
  // ============================================================================
  // Basic Configuration
  // ============================================================================
  /** Working directory for the CLI */
  cwd?: string;
  /** Path to CLI binary (auto-detected if not provided) */
  cliPath?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Timeout for requests in milliseconds */
  timeout?: number;

  // ============================================================================
  // Provider Configuration
  // ============================================================================
  /** CLI configuration */
  config?: CLIConfig;
  /** Model to use (provider is auto-detected from model ID) */
  model?: string;
  /** Fallback model if primary fails */
  fallbackModel?: string;
  /** Maximum number of turns */
  maxTurns?: number;
  /** Maximum budget in USD */
  maxBudgetUsd?: number;
  /** Sampling temperature (0.0 to 2.0) */
  temperature?: number;

  // Provider-specific settings (these override auto-detection)
  /** Provider name (if not provided, auto-detected from model ID) */
  provider?: ProviderName;
  /** API key for the provider */
  apiKey?: string;
  /** Base URL for the provider API */
  baseUrl?: string;

  // OpenAI-specific options
  /** OpenAI authentication mode */
  openaiAuthMode?: 'api-key' | 'chatgpt';
  /** OpenAI reasoning effort level (for o1 models) */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** OpenAI ChatGPT access token */
  chatgptAccessToken?: string;
  /** OpenAI ChatGPT account ID */
  chatgptAccountId?: string;

  // Azure-specific options
  /** Azure authentication method */
  azureAuthMethod?: 'api-key' | 'entra-id' | 'managed-identity';
  /** Azure tenant ID (for entra-id auth) */
  azureTenantId?: string;
  /** Azure client ID (for entra-id auth) */
  azureClientId?: string;
  /** Azure client secret (for entra-id auth) */
  azureClientSecret?: string;
  /** Azure resource name */
  azureResourceName?: string;
  /** Azure deployment name */
  azureDeploymentName?: string;
  /** Azure API version */
  azureApiVersion?: string;

  // Local provider options (ollama, llamacpp, mlx)
  /** Port for local provider */
  port?: number;

  // ============================================================================
  // Tool Configuration
  // ============================================================================
  /** Callback to determine if a tool can be used */
  canUseTool?: (toolName: string) => boolean | Promise<boolean>;

  // ============================================================================
  // Permission Configuration
  // ============================================================================
  /** Legacy permission mode (for backward compatibility) */
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto';
  /** Full permission settings (CLI-3 compatible) */
  permissions?: PermissionSettings;
  /** Auto-approve tools matching pattern (e.g., "allow:read,write" or "deny:delete") */
  yoloPattern?: string;
  /** Auto-approve tool calls matching pattern (CLI flag: --yolo) */
  yolo?: string;
  /** Timeout for auto-approve mode in seconds */
  yoloTimeout?: number;

  // ============================================================================
  // Execution Mode Configuration
  // ============================================================================
  /** Enable auto-mode for autonomous execution */
  autoMode?: boolean;
  /** Run in unrestricted mode (bypasses certain safety checks) */
  unrestricted?: boolean;
  /** Enable auto-commit with LLM-generated message */
  autoCommit?: boolean;
  /** Max auto-mode iterations */
  maxIterations?: number;
  /** Max runtime in minutes */
  maxRuntime?: number;
  /** Max API cost in dollars */
  maxCost?: number;

  // ============================================================================
  // Skills Configuration
  // ============================================================================
  /** Skill settings */
  skills?: SkillSettings;
  /** Enable auto-skill for automatic skill selection (legacy, use skills.autoSkill) */
  autoSkill?: boolean;

  // ============================================================================
  // Context Configuration
  // ============================================================================
  /** Context settings */
  context?: ContextSettings;
  /** Enable context compaction (legacy, use context.contextCompact) */
  contextCompact?: boolean;

  // ============================================================================
  // System Prompt Configuration
  // ============================================================================
  /** System prompt (inline string or file path) */
  sysPrompt?: string;
  /** Append to system prompt (inline string or file path) */
  appendSysPrompt?: string;

  // ============================================================================
  // Session Configuration
  // ============================================================================
  /** Session settings */
  session?: SessionSettings;
  /** Persist session to disk (legacy, use session.persistSession) */
  persistSession?: boolean;
  /** Session ID to resume (legacy, use session.sessionId) */
  sessionId?: string;
  /** Resume from last session (legacy, use session.resume) */
  resume?: boolean;
  /** Continue from last session (legacy, use session.continue) */
  continue?: boolean;

  // ============================================================================
  // Workspace Configuration
  // ============================================================================
  /** Additional directories to include in workspace */
  additionalDirectories?: string[];

  // ============================================================================
  // Environment Configuration
  // ============================================================================
  /** Environment variables to pass to CLI */
  env?: Record<string, string>;

  // ============================================================================
  // Thinking Configuration
  // ============================================================================
  /** Thinking/reasoning depth */
  thinking?: 'none' | 'normal' | 'extended' | { type: 'enabled', budgetTokens?: number } | { type: 'adaptive' };
  /** Effort level (for models that support it) */
  effort?: 'low' | 'medium' | 'high' | 'max';

  // ============================================================================
  // Sandbox Configuration
  // ============================================================================
  /** Sandbox settings */
  sandbox?: {
    enabled?: boolean;
    failIfUnavailable?: boolean;
    filesystem?: {
      allowWrite?: string[];
      denyWrite?: string[];
      denyRead?: string[];
      allowRead?: string[];
      allowManagedReadPathsOnly?: boolean;
    };
    network?: {
      allowedDomains?: string[];
      allowManagedDomainsOnly?: boolean;
      allowUnixSockets?: string[];
      allowAllUnixSockets?: boolean;
      allowLocalBinding?: boolean;
      allowMachLookup?: string[];
      httpProxyPort?: number;
      socksProxyPort?: number;
    };
    ignoreViolations?: Record<string, string[]>;
  };

  // ============================================================================
  // Additional Configuration
  // ============================================================================
  /** Additional directories to add to workspace */
  addDir?: string[];

  // ============================================================================
  // File Checkpointing
  // ============================================================================
  /** Enable file checkpointing for rewind */
  enableFileCheckpointing?: boolean;

  // ============================================================================
  // MCP Configuration
  // ============================================================================
  /** MCP server configurations */
  mcpServers?: Record<string, McpServerConfig>;

  // ============================================================================
  // Hooks Configuration
  // ============================================================================
  /** Hook functions */
  hooks?: Record<string, HookFunction>;
  /** Elicitation callback for user input from MCP servers */
  onElicitation?: (params: unknown) => unknown;

  // ============================================================================
  // Plugin Configuration
  // ============================================================================
  /** Plugins to load */
  plugins?: string[];

  // ============================================================================
  // Output Configuration
  // ============================================================================
  /** Output format */
  outputFormat?: 'text' | 'json';

  // ============================================================================
  // AGENTS.md Configuration
  // ============================================================================
  /** AGENTS.md settings */
  agentsMd?: AgentsMdSettings;

  // ============================================================================
  // Advanced Configuration
  // ============================================================================
  /** CLI executable path override */
  pathToClaudeCodeExecutable?: string;
  /** Spawn CLI as subprocess (default: true) */
  spawnClaudeCodeProcess?: boolean;
  /** Additional CLI arguments */
  extraArgs?: string[];
  /** Debug file path */
  debugFile?: string;
  /** Strict MCP config validation */
  strictMcpConfig?: boolean;
  /** Beta features to enable */
  betas?: string[];
  /** Task budget */
  taskBudget?: number;
}

export interface CLIConfig {
  provider?: string;
  openrouter?: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
  openai?: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
  ollama?: {
    baseUrl?: string;
    model?: string;
  };
  azure?: {
    apiKey?: string;
    resourceName?: string;
    deploymentName?: string;
  };
  zai?: {
    apiKey?: string;
  };
  llmgateway?: {
    apiKey?: string;
  };
  llamacpp?: {
    model?: string;
  };
  mlx?: {
    model?: string;
  };
}

// ============================================================================
// RPC Method Parameters
// ============================================================================

export interface PromptParams {
  message: string;
  context?: {
    files?: string[];
    selection?: {
      file: string;
      startLine: number;
      endLine: number;
      text: string;
    };
  };
  images?: ImageAttachment[];
  thinkingLevel?: 'none' | 'normal' | 'extended';
}

export interface ImageAttachment {
  data: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  filename?: string;
}

export interface AbortParams {
  // No params needed
}

export interface GetStateParams {
  // No params needed
}

export interface GetMessagesParams {
  limit?: number;
}

export interface PermissionResponseParams {
  requestId: string;
  decision?: 'allow' | 'deny' | 'alternative';
  allowed?: boolean;
  alternative?: string;
  remember?: boolean;
}

// ============================================================================
// RPC Response Results
// ============================================================================

export interface PromptResult {
  success: boolean;
}

export interface AbortResult {
  success: boolean;
}

export interface ResetResult {
  sessionId: string;
}

export interface GetStateResult {
  status: 'idle' | 'processing' | 'waiting_permission';
  sessionId: string | null;
  model: string;
  workspace: string;
  contextPercent: number;
  messageCount: number;
}

export interface GetMessagesResult {
  messages: RpcMessage[];
}

export interface RpcMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
}

// ============================================================================
// RPC Notification Parameters (Server -> Client)
// ============================================================================

export interface AgentStartParams {
  sessionId: string;
  model: string;
  workspace: string;
  timestamp: string;
}

export interface AgentEndParams {
  sessionId: string;
  reason: 'completed' | 'aborted' | 'error';
  timestamp: string;
}

export interface TurnStartParams {
  turnId: string;
  timestamp: string;
}

export interface TurnEndParams {
  turnId: string;
  timestamp: string;
  tokensUsed?: number;
  durationMs?: number;
  contextPercent?: number;
}

export interface MessageStartParams {
  messageId: string;
  role: 'assistant';
  timestamp: string;
}

export interface MessageUpdateParams {
  messageId?: string;
  delta: string;
  thought?: string;
  timestamp: string;
}

export interface MessageEndParams {
  messageId: string;
  content: string;
  timestamp: string;
}

export interface ToolStartParams {
  toolId: string;
  toolName: string;
  args: Record<string, unknown>;
  timestamp: string;
}

export interface ToolUpdateParams {
  toolId: string;
  output: string;
  stream: 'stdout' | 'stderr';
  timestamp: string;
}

export interface ToolEndParams {
  toolId: string;
  toolName: string;
  success: boolean;
  output?: string;
  error?: string;
  timestamp: string;
}

export interface PermissionRequestParams {
  requestId: string;
  tool: string;
  description: string;
  context: {
    command?: string;
    path?: string;
    args?: string[];
  };
  options?: string[];
  timestamp: string;
}

export interface ErrorNotificationParams {
  code: number;
  message: string;
  recoverable: boolean;
  timestamp: string;
}

// ============================================================================
// SDK Event Types
// ============================================================================

export type SDKEvent =
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
  | PermissionRequestEvent
  | ErrorEvent;

export interface AgentStartEvent {
  type: 'agent_start';
  sessionId: string;
  model: string;
  workspace: string;
  timestamp: string;
}

export interface AgentEndEvent {
  type: 'agent_end';
  sessionId: string;
  reason: 'completed' | 'aborted' | 'error';
  timestamp: string;
}

export interface TurnStartEvent {
  type: 'turn_start';
  turnId: string;
  timestamp: string;
}

export interface TurnEndEvent {
  type: 'turn_end';
  turnId: string;
  timestamp: string;
  tokensUsed?: number;
  durationMs?: number;
  contextPercent?: number;
}

export interface MessageStartEvent {
  type: 'message_start';
  messageId: string;
  role: 'assistant';
  timestamp: string;
}

export interface MessageUpdateEvent {
  type: 'message_update';
  messageId?: string;
  delta: string;
  thought?: string;
  timestamp: string;
}

export interface MessageEndEvent {
  type: 'message_end';
  messageId: string;
  content: string;
  timestamp: string;
}

export interface ToolStartEvent {
  type: 'tool_start';
  toolId: string;
  toolName: string;
  args: Record<string, unknown>;
  timestamp: string;
}

export interface ToolUpdateEvent {
  type: 'tool_update';
  toolId: string;
  output: string;
  stream: 'stdout' | 'stderr';
  timestamp: string;
}

export interface ToolEndEvent {
  type: 'tool_end';
  toolId: string;
  toolName: string;
  success: boolean;
  output?: string;
  error?: string;
  timestamp: string;
}

export interface PermissionRequestEvent {
  type: 'permission_request';
  requestId: string;
  tool: string;
  description: string;
  context: {
    command?: string;
    path?: string;
    args?: string[];
  };
  options?: string[];
  timestamp: string;
}

export interface ErrorEvent {
  type: 'error';
  code: number;
  message: string;
  recoverable: boolean;
  timestamp: string;
}

// ============================================================================
// Additional Types for Advanced Features
// ============================================================================

export interface McpServerConfig {
  transport: 'stdio' | 'sse' | 'http' | 'sdk';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  autoConnect?: boolean;
}

export type HookFunction = (params: unknown) => HookResult | Promise<HookResult>;

export interface HookResult {
  continue: boolean;
  additionalContext?: string;
  sessionTitle?: string;
}

export interface ModelInfo {
  id: string;
  displayName: string;
  description?: string;
}

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  tools?: string[];
}

export interface ContextUsage {
  systemPrompt: number;
  tools: number;
  messages: number;
  mcpTools: number;
  memoryFiles: number;
  total: number;
}

export interface AccountInfo {
  email: string;
  organization?: string;
  subscriptionType?: string;
}
