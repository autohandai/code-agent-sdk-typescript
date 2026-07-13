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
export type BuiltInProviderName =
  | 'autohandai'
  | 'openrouter'
  | 'ollama'
  | 'llamacpp'
  | 'openai'
  | 'mlx'
  | 'llmgateway'
  | 'azure'
  | 'zai'
  | 'sakana'
  | 'xai'
  | 'cerebras'
  | 'deepseek'
  | 'vertexai'
  | 'nvidia'
  | 'bedrock';

export type CustomProviderId = `custom:${string}`;
export type ProviderName = BuiltInProviderName | CustomProviderId;

/**
 * AUTOHAND_ prefixed environment variables supported by CLI-3.
 * These are forwarded to the CLI subprocess when spawning.
 */
export interface AutohandEnvVars {
  /** Base directory for all Autohand user data and configuration (default: ~/.autohand) */
  AUTOHAND_HOME?: string;
  /** API base URL for authentication and sync services */
  AUTOHAND_API_URL?: string;
  /** Config file path override */
  AUTOHAND_CONFIG?: string;
  /** Autohand AI API key for SDK Cloud usage */
  AUTOHAND_AI_API_KEY?: string;
  /** Autohand AI base URL override */
  AUTOHAND_AI_BASE_URL?: string;
  /** Autohand AI plan style (cloud or local) */
  AUTOHAND_AI_PLAN?: string;
  /** Enable debug logging mode ('1' to enable) */
  AUTOHAND_DEBUG?: string;
  /** Enable the minimal explicit runtime used by --bare */
  AUTOHAND_CODE_SIMPLE?: string;
  /** Client identifier for ACP extensions (e.g., 'zed', 'terminal') */
  AUTOHAND_CLIENT_NAME?: string;
  /** Client version string */
  AUTOHAND_CLIENT_VERSION?: string;
  /** Auth code for headless setup */
  AUTOHAND_CODE?: string;
  /** Display language locale override */
  AUTOHAND_LOCALE?: string;
  /** Suppress startup banner ('1' to suppress) */
  AUTOHAND_NO_BANNER?: string;
  /** Disable authenticated idle logout for long-running sessions */
  AUTOHAND_NO_IDLE_LOGOUT?: string;
  /** Force non-interactive mode ('1' to enable) */
  AUTOHAND_NON_INTERACTIVE?: string;
  /** Permission callback timeout in milliseconds */
  AUTOHAND_PERMISSION_CALLBACK_TIMEOUT?: string;
  /** Permission callback URL for external approval */
  AUTOHAND_PERMISSION_CALLBACK_URL?: string;
  /** Company/enterprise secret for team features */
  AUTOHAND_SECRET?: string;
  /** Share API URL override */
  AUTOHAND_SHARE_URL?: string;
  /** Skip telemetry ping on startup ('1' to skip) */
  AUTOHAND_SKIP_PING?: string;
  /** Skip version check on startup ('1' to skip) */
  AUTOHAND_SKIP_UPDATE_CHECK?: string;
  /** Stream tool output in real-time ('1' to enable) */
  AUTOHAND_STREAM_TOOL_OUTPUT?: string;
  /** Disable terminal regions for box drawing ('0' to disable) */
  AUTOHAND_TERMINAL_REGIONS?: string;
  /** Default thinking level (low, medium, high) */
  AUTOHAND_THINKING_LEVEL?: string;
  /** TMUX session indicator ('1' when launched from tmux) */
  AUTOHAND_TMUX_LAUNCHED?: string;
  /** Auto-confirm prompts without user interaction ('1' to enable) */
  AUTOHAND_YES?: string;
}

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
    case 'sakana':
    case 'openrouter':
    case 'llmgateway':
    case 'xai':
    case 'cerebras':
    case 'deepseek':
    case 'vertexai':
    case 'nvidia':
      validateCloudProviderConfig(provider, config);
      break;
    case 'bedrock':
      break;
    case 'autohandai':
      if (config.autohandAIPlan !== 'local') {
        validateCloudProviderConfig(provider, config);
      }
      break;
    case 'ollama':
    case 'llamacpp':
    case 'mlx':
      validateLocalProviderConfig(provider, config);
      break;
    default:
      if (provider.startsWith('custom:')) {
        return;
      }
  }
}

function validateOpenAIConfig(config: SDKConfig): void {
  if (config.openaiAuthMode && !['api-key', 'chatgpt'].includes(config.openaiAuthMode)) {
    throw new ProviderConfigError(
      `Invalid openaiAuthMode: ${config.openaiAuthMode}. Must be 'api-key' or 'chatgpt'`
    );
  }

  if (config.reasoningEffort !== undefined && !['low', 'medium', 'high'].includes(config.reasoningEffort)) {
    throw new ProviderConfigError(
      `Invalid reasoningEffort: ${config.reasoningEffort}. Must be 'low', 'medium', or 'high'`
    );
  }

  if (config.openaiAuthMode === 'chatgpt') {
    if (config.chatgptAccessToken === undefined || config.chatgptAccessToken === '') {
      throw new ProviderConfigError('chatgptAccessToken is required when openaiAuthMode is chatgpt');
    }
    if (config.chatgptAccountId === undefined || config.chatgptAccountId === '') {
      throw new ProviderConfigError('chatgptAccountId is required when openaiAuthMode is chatgpt');
    }
  } else {
    // api-key mode (default) requires an apiKey
    if (config.apiKey === undefined || config.apiKey === '') {
      throw new ProviderConfigError("apiKey is required for provider 'openai'");
    }
  }
}

function validateAzureConfig(config: SDKConfig): void {
  if (config.azureAuthMethod !== undefined && !['api-key', 'entra-id', 'managed-identity'].includes(config.azureAuthMethod)) {
    throw new ProviderConfigError(
      `Invalid azureAuthMethod: ${config.azureAuthMethod}. Must be 'api-key', 'entra-id', or 'managed-identity'`
    );
  }

  const authMethod = config.azureAuthMethod ?? 'api-key';

  if (authMethod === 'entra-id') {
    if (config.azureTenantId === undefined || config.azureTenantId === '') {
      throw new ProviderConfigError('azureTenantId is required when azureAuthMethod is entra-id');
    }
    if (config.azureClientId === undefined || config.azureClientId === '') {
      throw new ProviderConfigError('azureClientId is required when azureAuthMethod is entra-id');
    }
    if (config.azureClientSecret === undefined || config.azureClientSecret === '') {
      throw new ProviderConfigError('azureClientSecret is required when azureAuthMethod is entra-id');
    }
  }

  if (authMethod === 'api-key' && (config.apiKey === undefined || config.apiKey === '')) {
    throw new ProviderConfigError('apiKey is required when azureAuthMethod is api-key');
  }
}

function validateCloudProviderConfig(provider: ProviderName, config: SDKConfig): void {
  if (config.apiKey === undefined || config.apiKey === '') {
    throw new ProviderConfigError(`apiKey is required for provider '${provider}'`);
  }
}

function validateLocalProviderConfig(provider: ProviderName, config: SDKConfig): void {
  if (config.port !== undefined && (config.port < 1 || config.port > 65535)) {
    throw new ProviderConfigError(
      `Invalid port: ${config.port}. Must be between 1 and 65535`
    );
  }

  void provider;
}

/**
 * Detect provider from model ID
 * Based on model ID patterns used by different providers
 */
export function detectProviderFromModel(model: string): ProviderName {
  if (!model) return 'openrouter';

  const modelLower = model.toLowerCase();

  if (modelLower === 'fantail' || modelLower === 'moa' || modelLower.startsWith('autohandai/')) {
    return 'autohandai';
  }

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

  // xAI models (Grok)
  if (modelLower.includes('grok')) {
    return 'xai';
  }

  // DeepSeek models
  if (modelLower.includes('deepseek')) {
    return 'deepseek';
  }

  // Vertex AI models
  if (modelLower.includes('gemini') || modelLower.includes('vertex')) {
    return 'vertexai';
  }

  // NVIDIA models
  if (modelLower.includes('nvidia')) {
    return 'nvidia';
  }

  // Cerebras models
  if (modelLower.includes('cerebras')) {
    return 'cerebras';
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
 * Legacy permission mode aliases accepted by older SDK call sites.
 *
 * New code should prefer PermissionMode for session policy and planMode for
 * planning-only execution.
 */
export type LegacyPermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'plan'
  | 'dontAsk'
  | 'auto'
  | 'ask'
  | 'yolo';

/**
 * CLI-3 permission prompt decisions.
 */
export type PermissionDecision =
  | 'allow_once'
  | 'deny_once'
  | 'allow_session'
  | 'deny_session'
  | 'allow_always_project'
  | 'allow_always_user'
  | 'deny_always_project'
  | 'deny_always_user'
  | 'alternative';

/**
 * Compatibility aliases accepted by the SDK and normalized before RPC.
 */
export type PermissionDecisionAlias = 'allow' | 'deny';

/**
 * Persistence scope for ergonomic permission helpers.
 */
export type PermissionDecisionScope = 'once' | 'session' | 'project' | 'user';

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
  /** Specific skills to load (by name or file path) */
  skills?: SkillReference[];
  /** Skill sources to search */
  sources?: SkillSource[];
  /** Whether to install missing skills from community */
  installMissing?: boolean;
}

/**
 * Skill reference - either a skill name or a file path to a SKILL.md file.
 *
 * When a file path is detected (contains '/' or ends with '.md'), the SDK
 * copies the skill file to ~/.autohand/skills/ before starting the CLI.
 */
export type SkillReference =
  | string // Skill name or file path (auto-detected)
  | { name: string; path: string; scope?: 'user' | 'project' }; // Explicit skill with name and path

/**
 * Helper to detect if a skill reference is a file path
 */
export function isSkillFilePath(ref: SkillReference): ref is string {
  if (typeof ref === 'string') {
    return ref.includes('/') || ref.endsWith('.md');
  }
  return false;
}

/**
 * Extract skill name from a reference
 */
export function getSkillName(ref: SkillReference): string {
  if (typeof ref === 'string') {
    // For file paths, use directory name or basename without extension
    if (isSkillFilePath(ref)) {
      const parts = ref.split(/[\\/]/).filter(Boolean);
      const lastPart = parts[parts.length - 1];
      if (lastPart?.toLowerCase() === 'skill.md' && parts.length > 1) {
        return parts[parts.length - 2] ?? 'custom-skill';
      }
      return lastPart?.replace(/\.md$/i, '') ?? 'custom-skill';
    }
    return ref;
  }
  return ref.name;
}

/**
 * Extract file path from a reference (if applicable)
 */
export function getSkillPath(ref: SkillReference): string | undefined {
  if (typeof ref === 'string' && isSkillFilePath(ref)) {
    return ref;
  }
  if (typeof ref === 'object') {
    return ref.path;
  }
  return undefined;
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
  /** Alias for compressionThreshold retained for config ergonomics */
  compactThreshold?: number;
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
  outputTokens: number;
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
  /** Alias for persistSession */
  persist?: boolean;
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
  /** Alias for enable */
  enabled?: boolean;
  /** Create AGENTS.md if it doesn't exist */
  create?: boolean;
  /** Alias for create */
  createDefault?: boolean;
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
          const toml = await import('toml');
          config = toml.parse(content) as SDKConfig;
        } catch (e) {
          throw new Error('TOML parser not installed. Install with: npm install toml');
        }
        break;
      case 'yaml':
      case 'yml':
        try {
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
    } catch {
      globalConfig = {};
    }
  }
  
  // Load workspace config if it exists
  if (fs.existsSync(workspaceConfigPath)) {
    try {
      workspaceConfig = await loadConfigFrom(workspaceConfigPath);
    } catch {
      workspaceConfig = {};
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
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  const autohandAIApiKey = process.env.AUTOHAND_AI_API_KEY;
  const autohandAIBaseUrl = process.env.AUTOHAND_AI_BASE_URL;
  const autohandAIPlan = process.env.AUTOHAND_AI_PLAN;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const azureApiKey = process.env.AZURE_API_KEY;
  const zaiApiKey = process.env.ZAI_API_KEY;
  const azureTenantId = process.env.AZURE_TENANT_ID;
  const azureClientId = process.env.AZURE_CLIENT_ID;
  const azureClientSecret = process.env.AZURE_CLIENT_SECRET;
  const autohandModel = process.env.AUTOHAND_MODEL;
  
  // Provider-specific environment variables
  if (autohandAIApiKey !== undefined && autohandAIApiKey !== '' && merged.apiKey === undefined) {
    merged.apiKey = autohandAIApiKey;
    merged.provider ??= 'autohandai';
  }
  if (autohandAIBaseUrl !== undefined && autohandAIBaseUrl !== '' && merged.baseUrl === undefined) {
    merged.baseUrl = autohandAIBaseUrl;
  }
  if ((autohandAIPlan === 'cloud' || autohandAIPlan === 'local') && merged.autohandAIPlan === undefined) {
    merged.autohandAIPlan = autohandAIPlan;
  }
  if (openrouterApiKey !== undefined && openrouterApiKey !== '' && merged.apiKey === undefined) {
    merged.apiKey = openrouterApiKey;
  }
  if (openaiApiKey !== undefined && openaiApiKey !== '' && merged.apiKey === undefined) {
    merged.apiKey = openaiApiKey;
  }
  if (azureApiKey !== undefined && azureApiKey !== '' && merged.apiKey === undefined) {
    merged.apiKey = azureApiKey;
  }
  if (zaiApiKey !== undefined && zaiApiKey !== '' && merged.apiKey === undefined) {
    merged.apiKey = zaiApiKey;
  }
  
  // Azure-specific environment variables
  if (azureTenantId !== undefined && azureTenantId !== '' && merged.azureTenantId === undefined) {
    merged.azureTenantId = azureTenantId;
  }
  if (azureClientId !== undefined && azureClientId !== '' && merged.azureClientId === undefined) {
    merged.azureClientId = azureClientId;
  }
  if (azureClientSecret !== undefined && azureClientSecret !== '' && merged.azureClientSecret === undefined) {
    merged.azureClientSecret = azureClientSecret;
  }
  
  // Model from environment
  if (autohandModel !== undefined && autohandModel !== '' && merged.model === undefined) {
    merged.model = autohandModel;
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
  return `# Project Autopilot${projectName !== undefined && projectName !== '' ? ` - ${projectName}` : ''}

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
  /** Autohand AI plan. SDK Cloud requires apiKey; Local delegates to CLI/local server config. */
  autohandAIPlan?: 'cloud' | 'local';

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
  /** Permission mode for the session. Prefer CLI-3 modes for new code. */
  permissionMode?: PermissionMode | LegacyPermissionMode;
  /** Full permission settings (CLI-3 compatible) */
  permissions?: PermissionSettings;
  /** Auto-approve tools matching pattern (e.g., "allow:read,write" or "deny:delete") */
  yoloPattern?: string;
  /** Auto-approve tool calls matching pattern (CLI flag: --yolo) */
  yolo?: string;
  /** Timeout for auto-approve mode in seconds */
  yoloTimeout?: number;
  /** Enable CLI-3 plan mode after the RPC session starts */
  planMode?: boolean;

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
  /** Minimal explicit runtime with implicit integrations disabled */
  bare?: boolean;
  /** Keep authenticated idle logout enabled. Set false for long-running agents. */
  idleLogout?: boolean;

  // ============================================================================
  // Skills Configuration
  // ============================================================================
  /** Skill settings */
  skills?: SkillSettings | SkillReference[];
  /** Direct skill references (convenience - can use instead of skills.skills) */
  skillRefs?: SkillReference[];
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
  /** Alias for sysPrompt */
  systemPrompt?: string;
  /** File path that replaces the entire system prompt */
  systemPromptFile?: string;
  /** Append to system prompt (inline string or file path) */
  appendSysPrompt?: string;
  /** Alias for appendSysPrompt */
  appendSystemPrompt?: string;
  /** File path appended to the system prompt */
  appendSystemPromptFile?: string;

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
  /** Fork an existing session before the RPC runtime starts */
  fork?: string;

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
  /** AUTOHAND_ prefixed environment variables forwarded to the CLI subprocess */
  envVars?: AutohandEnvVars;

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
  /** Explicit MCP config file passed to the CLI */
  mcpConfig?: string;

  // ============================================================================
  // Hooks Configuration
  // ============================================================================
  /** Hooks settings matching CLI-3 HookManager */
  hooks?: HooksSettings;
  /** Elicitation callback for user input from MCP servers */
  onElicitation?: (params: unknown) => unknown;

  // ============================================================================
  // Plugin Configuration
  // ============================================================================
  /** Plugins to load */
  plugins?: string[];
  /** Explicit plugin/meta-tool directory passed to the CLI */
  pluginDir?: string;

  // ============================================================================
  // Agent and Feature Configuration
  // ============================================================================
  /** Inline agents JSON or an external agents directory */
  agents?: string;
  /** CLI display language locale */
  displayLanguage?: string;
  /** Current CLI feature and experiment settings */
  features?: FeatureFlagSettings;

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

export interface FeatureFlagSettings {
  environment?: string;
  remoteOverrides?: Record<string, 'off'>;
  usageV2?: boolean;
  awsBedrockProvider?: boolean;
  slashGoal?: boolean;
  tokenUsageStatus?: boolean;
  experimentalFork?: boolean;
  experimentalClone?: boolean;
  experimentalHandoff?: boolean;
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

export type SlashCommand = `/${string}`;
export type SlashCommandArguments = string | readonly string[];

export type GoalStatus = 'active' | 'paused' | 'budgetLimited' | 'complete';

export interface GoalState {
  goalId: string;
  objective: string;
  status: GoalStatus;
  tokenBudget?: number;
  timeBudgetSeconds?: number;
  minTokensBeforeWrapUp?: number;
  minTimeSecondsBeforeWrapUp?: number;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
}

export interface QueuedGoal {
  queueId: string;
  objective: string;
  tokenBudget?: number;
  timeBudgetSeconds?: number;
  minTokensBeforeWrapUp?: number;
  minTimeSecondsBeforeWrapUp?: number;
  source: 'command' | 'tool' | 'rpc' | 'cli';
  template?: string;
  templateFlags?: Record<string, string>;
  templateArgs?: string;
  createdAt: number;
}

export interface CompletedGoal {
  goalId: string;
  objective: string;
  status: Extract<GoalStatus, 'complete' | 'budgetLimited'>;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  completedAt: number;
}

export interface GoalSnapshot {
  version: 1;
  goal: GoalState | null;
  queue: QueuedGoal[];
  completed: CompletedGoal[];
  updatedAt: number;
}

export interface GoalTemplateMetadata {
  name: string;
  path: string;
  description?: string;
  aliases: string[];
  allowCommands: boolean;
  requiredPlaceholders: string[];
  requiredFlags: string[];
  requiresArgs: boolean;
}

export interface GoalMutationResult {
  ok: boolean;
  goal: GoalState | null;
  queue: QueuedGoal[];
  telemetry?: {
    timeRemainingSeconds?: number;
    tokensRemaining?: number;
    completionFloorMet?: boolean;
  };
  message?: string;
  queued?: QueuedGoal[];
  started?: QueuedGoal;
  completed?: CompletedGoal;
  completedRun?: CompletedGoal[];
  dequeued?: QueuedGoal;
  removed?: QueuedGoal;
}

export interface GoalFeatureDisabledResult {
  ok: false;
  message: string;
}

export interface GoalBudgetParams {
  tokenBudget?: number;
  timeBudgetSeconds?: number;
  minTokensBeforeWrapUp?: number;
  minTimeSecondsBeforeWrapUp?: number;
}

export interface CreateGoalParams extends GoalBudgetParams {
  objective: string;
}

export interface UpdateGoalParams {
  objective?: string;
  status?: GoalStatus;
  tokenBudget?: number | null;
  timeBudgetSeconds?: number | null;
  minTokensBeforeWrapUp?: number | null;
  minTimeSecondsBeforeWrapUp?: number | null;
}

export type QueueGoalParams = CreateGoalParams;
export type GoalSnapshotResult = GoalSnapshot | GoalFeatureDisabledResult;
export type GoalMutationRpcResult = GoalMutationResult | GoalFeatureDisabledResult;
export type GoalTemplatesResult = GoalTemplateMetadata[] | GoalFeatureDisabledResult;

export type AutoresearchOptimizationDirection = 'lower' | 'higher';

export interface AutoresearchSubagentOptions {
  ideaGeneration?: boolean;
  measurementAnalysis?: boolean;
  finalization?: boolean;
}

export interface AutoresearchStartParams {
  objective: string;
  maxIterations?: number;
  timeoutMs?: number;
  metricName?: string;
  metricUnit?: string;
  direction?: AutoresearchOptimizationDirection;
  measureCommand?: string;
  measureScript?: string;
  checksCommand?: string;
  checksScript?: string;
  filesInScope?: string[];
  subagents?: AutoresearchSubagentOptions;
}

export interface AutoresearchState {
  active: boolean;
  goal: string;
  iteration: number;
  maxIterations: number;
}

export interface AutoresearchStartResult {
  success: boolean;
  message?: string;
  instruction?: string;
  active?: boolean;
  state?: AutoresearchState;
  statusText?: string;
  runsLogged?: number;
  error?: string;
}

export interface AutoresearchStatusResult {
  success: boolean;
  active: boolean;
  state?: AutoresearchState;
  statusText: string;
  runsLogged: number;
  error?: string;
}

export interface AutoresearchStopResult {
  success: boolean;
  message?: string;
  active?: boolean;
  state?: AutoresearchState;
  statusText?: string;
  runsLogged?: number;
  error?: string;
}

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
    agentsMd?: {
      content?: string;
      path?: string;
      auto?: true;
    };
  };
  images?: ImageAttachment[];
  thinkingLevel?: 'none' | 'normal' | 'extended';
  /**
   * AGENTS.md content or path to inject into the prompt context.
   * Can be:
   * - Raw content string to use as AGENTS.md
   * - File path (absolute or relative) to load AGENTS.md from
   * - URL (https://) to fetch AGENTS.md from
   * - "auto" to automatically detect from workspace
   */
  agentsMd?: string | { path?: string; content?: string; auto?: boolean };
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
  decision?: PermissionDecision | PermissionDecisionAlias;
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

export interface PlanModeSetResult {
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
  tokensUsageStatus?: 'actual' | 'unavailable';
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
  | FileModifiedEvent
  | PermissionRequestEvent
  | AutoresearchEvent
  | ErrorEvent;

export interface AutoresearchEvent {
  type: 'autoresearch';
  phase: 'start' | 'status' | 'pause';
  active: boolean;
  goal?: string;
  iteration?: number;
  maxIterations?: number;
  runsLogged: number;
  statusText: string;
  subcommand: 'start' | 'resume' | 'status' | 'stop';
  message?: string;
  timestamp: string;
}

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
  tokensUsageStatus?: 'actual' | 'unavailable';
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

export interface FileModifiedEvent {
  type: 'file_modified';
  filePath: string;
  changeType: 'create' | 'modify' | 'delete';
  toolId: string;
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

// ============================================================================
// Hooks Types (matching CLI-3 HookManager)
// ============================================================================

/** All available hook events in the CLI */
export type HookEvent =
  | 'session-start'
  | 'session-end'
  | 'pre-clear'
  | 'pre-prompt'
  | 'pre-tool'
  | 'post-tool'
  | 'file-modified'
  | 'stop'
  | 'post-response'
  | 'subagent-stop'
  | 'permission-request'
  | 'notification'
  | 'session-error'
  // Auto-mode events
  | 'automode:start'
  | 'automode:iteration'
  | 'automode:checkpoint'
  | 'automode:pause'
  | 'automode:resume'
  | 'automode:cancel'
  | 'automode:complete'
  | 'automode:error'
  // Auto-research events
  | 'autoresearch:start'
  | 'autoresearch:pause'
  | 'autoresearch:init'
  | 'autoresearch:before'
  | 'autoresearch:run'
  | 'autoresearch:after'
  | 'autoresearch:log'
  | 'autoresearch:complete'
  | 'autoresearch:error'
  // Learn events
  | 'pre-learn'
  | 'post-learn'
  // Goal authoring events
  | 'goal-written:completed'
  // Team events
  | 'team-created'
  | 'teammate-spawned'
  | 'teammate-idle'
  | 'task-assigned'
  | 'task-completed'
  | 'team-shutdown'
  // Review events
  | 'review:start'
  | 'review:end'
  | 'review:paused'
  | 'review:failed'
  | 'review:completed'
  // Mode events
  | 'mode-change'
  // Context lifecycle events
  | 'context:compact'
  | 'context:overflow'
  | 'context:warning'
  | 'context:critical';

/** Canonical hook event names accepted by the CLI */
export const HOOK_EVENTS = [
  'session-start',
  'session-end',
  'pre-clear',
  'pre-prompt',
  'pre-tool',
  'post-tool',
  'file-modified',
  'stop',
  'post-response',
  'subagent-stop',
  'permission-request',
  'notification',
  'session-error',
  'automode:start',
  'automode:iteration',
  'automode:checkpoint',
  'automode:pause',
  'automode:resume',
  'automode:cancel',
  'automode:complete',
  'automode:error',
  'autoresearch:start',
  'autoresearch:pause',
  'autoresearch:init',
  'autoresearch:before',
  'autoresearch:run',
  'autoresearch:after',
  'autoresearch:log',
  'autoresearch:complete',
  'autoresearch:error',
  'pre-learn',
  'post-learn',
  'goal-written:completed',
  'team-created',
  'teammate-spawned',
  'teammate-idle',
  'task-assigned',
  'task-completed',
  'team-shutdown',
  'review:start',
  'review:end',
  'review:paused',
  'review:failed',
  'review:completed',
  'mode-change',
  'context:compact',
  'context:overflow',
  'context:warning',
  'context:critical',
] as const satisfies readonly HookEvent[];

/** Filter to limit when a hook fires */
export interface HookFilter {
  /** Only fire for specific tools (e.g., ["run_command", "write_file"]) */
  tool?: string[];
  /** Only fire for specific file paths (glob patterns like "src/*.ts") */
  path?: string[];
}

/** Hook definition for config-based hooks */
export interface HookDefinition {
  /** Event to hook into */
  event: HookEvent;
  /** Shell command to execute (receives context via env vars and JSON via stdin) */
  command: string;
  /** Description for hooks display */
  description?: string;
  /** Whether hook is enabled (default: true) */
  enabled?: boolean;
  /** Timeout in ms (default: 5000) */
  timeout?: number;
  /** Run async without blocking (default: false) */
  async?: boolean;
  /** Regex pattern to match tool names, notification types, session types, etc. */
  matcher?: string;
  /** Filter to specific tools or paths */
  filter?: HookFilter;
}

/** Hooks configuration settings */
export interface HooksSettings {
  /** Enable/disable hooks globally (default: true) */
  enabled?: boolean;
  /** Registered hook definitions */
  hooks?: HookDefinition[];
}

/** Hook response for control flow decisions (parsed from stdout JSON) */
export interface HookResponse {
  /** Decision for tool/permission hooks: allow, deny, ask, or block */
  decision?: 'allow' | 'deny' | 'ask' | 'block';
  /** Reason for decision (shown to agent or user) */
  reason?: string;
  /** Whether to continue execution (false stops the agent) */
  continue?: boolean;
  /** Message shown when continue is false */
  stopReason?: string;
  /** Modified tool input (for pre-tool/permission-request hooks) */
  updatedInput?: Record<string, unknown>;
  /** Additional context to add to conversation */
  additionalContext?: string;
}

/** Context passed to hooks via environment variables and JSON stdin */
export interface HookContext {
  /** Event that triggered the hook */
  event: HookEvent;
  /** Workspace root path */
  workspace: string;
  /** Session ID */
  sessionId?: string;
  /** Tool name (for tool events) */
  tool?: string;
  /** Tool call ID */
  toolCallId?: string;
  /** JSON-encoded tool args */
  args?: Record<string, unknown>;
  /** Tool success status (for post-tool) */
  success?: boolean;
  /** Tool output (for post-tool) */
  output?: string;
  /** Duration in ms (for post-tool, stop, session-end) */
  duration?: number;
  /** File path (for file-modified) */
  path?: string;
  /** Change type (for file-modified) */
  changeType?: 'create' | 'modify' | 'delete';
  /** User instruction (for pre-prompt) */
  instruction?: string;
  /** Mentioned files (for pre-prompt) */
  mentionedFiles?: string[];
  /** Tokens used (for stop) */
  tokensUsed?: number;
  /** Whether tokensUsed is actual provider-reported usage or unavailable */
  tokensUsageStatus?: 'actual' | 'unavailable';
  /** Goal identifier for goal authoring hooks */
  goalId?: string;
  /** Goal objective for goal authoring hooks */
  goalObjective?: string;
  /** Surface that created the goal */
  goalSource?: string;
  /** Tool calls count (for stop) */
  toolCallsCount?: number;
  /** Tool calls in this turn (for stop) */
  toolCallsInTurn?: number;
  /** Turn duration ms (for stop) */
  turnDuration?: number;
  /** Error message (for session-error) */
  error?: string;
  /** Error code (for session-error) */
  errorCode?: string;
  /** Session type for session-start (startup, resume, clear) */
  sessionType?: 'startup' | 'resume' | 'clear';
  /** Session end reason */
  sessionEndReason?: 'quit' | 'clear' | 'exit' | 'error';
  /** Subagent task ID (for subagent-stop) */
  subagentId?: string;
  /** Subagent name (for subagent-stop) */
  subagentName?: string;
  /** Subagent type (for subagent-stop) */
  subagentType?: string;
  /** Subagent success status (for subagent-stop) */
  subagentSuccess?: boolean;
  /** Subagent error message (for subagent-stop) */
  subagentError?: string;
  /** Subagent duration ms (for subagent-stop) */
  subagentDuration?: number;
  /** Permission type (for permission-request) */
  permissionType?: string;
  /** Notification type (for notification) */
  notificationType?: string;
  /** Notification message (for notification) */
  notificationMessage?: string;
  /** Auto-mode session ID */
  automodeSessionId?: string;
  /** Auto-mode prompt/task */
  automodePrompt?: string;
  /** Auto-mode current iteration */
  automodeIteration?: number;
  /** Auto-mode max iterations */
  automodeMaxIterations?: number;
  /** Auto-mode actions in current iteration */
  automodeActions?: string[];
  /** Auto-mode files created */
  automodeFilesCreated?: number;
  /** Auto-mode files modified */
  automodeFilesModified?: number;
  /** Auto-mode cancel reason */
  automodeCancelReason?: string;
  /** Auto-mode checkpoint commit hash */
  automodeCheckpointCommit?: string;
  /** Auto-mode total cost */
  automodeTotalCost?: number;
  /** Auto-research goal or objective text */
  autoresearchGoal?: string;
  /** Whether auto-research is active after the event */
  autoresearchActive?: boolean;
  /** Auto-research completed iteration count */
  autoresearchIteration?: number;
  /** Auto-research maximum iteration count */
  autoresearchMaxIterations?: number;
  /** Auto-research command that triggered the event */
  autoresearchSubcommand?: string;
  /** Review target path */
  reviewPath?: string;
  /** Review scope */
  reviewScope?: string;
  /** Review instructions/focus */
  reviewInstructions?: string;
  /** Review error message */
  reviewError?: string;
  /** Team name */
  teamName?: string;
  /** Teammate name */
  teammateName?: string;
  /** Teammate agent definition name */
  teammateAgentName?: string;
  /** Teammate process ID */
  teammatePid?: number;
  /** Team task ID */
  teamTaskId?: string;
  /** Team task owner */
  teamTaskOwner?: string;
  /** Team task result */
  teamTaskResult?: string;
  /** Total team members */
  teamMemberCount?: number;
  /** Completed tasks count */
  teamTasksCompleted?: number;
  /** Total tasks count */
  teamTasksTotal?: number;
  /** Additional workspace directories */
  additionalWorkspaces?: string[];
}

/** Result of hook execution */
export interface HookExecutionResult {
  hook: HookDefinition;
  success: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
  duration: number;
  /** Exit code from the process */
  exitCode?: number;
  /** Whether this was a blocking error (exit code 2) */
  blockingError?: boolean;
  /** Parsed JSON response from stdout (for control flow) */
  response?: HookResponse;
}

/** Parameters for adding a hook */
export interface AddHookParams {
  hook: HookDefinition;
}

/** Parameters for removing a hook */
export interface RemoveHookParams {
  event: HookEvent;
  index: number;
}

/** Parameters for toggling a hook */
export interface ToggleHookParams {
  event: HookEvent;
  index: number;
}

/** Parameters for testing a hook */
export interface TestHookParams {
  hook: HookDefinition;
}

/** Result of getting hooks */
export interface GetHooksResult {
  settings: HooksSettings;
}

/** Result of adding a hook */
export interface AddHookResult {
  success: boolean;
  hookId?: string;
}

/** Result of removing a hook */
export interface RemoveHookResult {
  success: boolean;
}

/** Result of toggling a hook */
export interface ToggleHookResult {
  success: boolean;
  enabled: boolean;
}

/** Result of testing a hook */
export interface TestHookResult extends HookExecutionResult {
  testMode: boolean;
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
