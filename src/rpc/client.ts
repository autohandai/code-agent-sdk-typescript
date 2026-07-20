/**
 * JSON-RPC client for communicating with the CLI
 * 
 * Provides a high-level API for sending JSON-RPC requests to the Autohand CLI
 * and receiving responses and notifications. This class handles the low-level
 * protocol details including request/response matching, event streaming,
 * and notification routing.
 * 
 * @example
 * ```typescript
 * const client = new RPCClient({
 *   cwd: '/path/to/project',
 *   debug: true,
 * });
 * 
 * await client.start();
 * const result = await client.prompt({ message: 'Hello' });
 * await client.stop();
 * ```
 * 
 * @internal
 */

import { Transport, type TransportOptions } from '../transport/transport.js';
import type {
  SDKConfig,
  PromptParams,
  PromptResult,
  AbortParams,
  AbortResult,
  ResetResult,
  PlanModeSetResult,
  GetStateParams,
  GetStateResult,
  GetMessagesParams,
  GetMessagesResult,
  BrowserHandoffCreateParams,
  BrowserHandoffCreateResult,
  BrowserHandoffAttachParams,
  BrowserHandoffAttachResult,
  AutomodeStartParams,
  AutomodeStartResult,
  AutomodeStatusResult,
  AutomodeOperationResult,
  AutomodeCancelParams,
  AutomodeGetLogParams,
  AutomodeGetLogResult,
  PermissionDecision,
  PermissionAcknowledgedParams,
  PermissionAcknowledgedResult,
  DirectoryAccessResponseParams,
  DirectoryAccessResponseResult,
  DirectoryAccessAcknowledgedParams,
  DirectoryAccessAcknowledgedResult,
  ChangesDecisionParams,
  ChangesDecisionResult,
  GetHistoryParams,
  GetHistoryResult,
  GetSessionParams,
  GetSessionResult,
  PermissionResponseParams,
  SDKEvent,
  JsonRpcParams,
  SkillReference,
  AddHookParams,
  AddHookResult,
  RemoveHookParams,
  RemoveHookResult,
  ToggleHookParams,
  ToggleHookResult,
  TestHookParams,
  TestHookResult,
  GetHooksResult,
  PermissionMode,
  LegacyPermissionMode,
  CreateGoalParams,
  UpdateGoalParams,
  QueueGoalParams,
  GoalSnapshotResult,
  GoalMutationRpcResult,
  GoalTemplatesResult,
  AutoresearchStartParams,
  AutoresearchStartResult,
  AutoresearchStatusResult,
  AutoresearchStopResult,
  AutoresearchHistoryResult,
  AutoresearchReplayParams,
  AutoresearchReplayResult,
  AutoresearchRescoreParams,
  AutoresearchRescoreResult,
  AutoresearchCompareParams,
  AutoresearchCompareResult,
  AutoresearchParetoResult,
  AutoresearchPinParams,
  AutoresearchPinResult,
  AutoresearchPruneParams,
  AutoresearchPruneResult,
  AutoresearchLifecycleEvent,
  AutoresearchOperationEvent,
  GetSkillsRegistryParams,
  GetSkillsRegistryResult,
  InstallSkillParams,
  InstallSkillResult,
  McpListServersResult,
  McpListToolsParams,
  McpListToolsResult,
  McpGetServerConfigsResult,
} from '../types/index.js';
import { detectProviderFromModel, validateProviderConfig, getSkillName, getSkillPath } from '../types/index.js';
import { validateSessionControlRpcResult } from '../validation/session-control-rpc-results.js';
import { validateExtensionRpcResult } from '../validation/extension-rpc-results.js';

function scopedDecision(
  allowed: boolean,
  remember: boolean | undefined
): PermissionDecision {
  if (allowed) {
    return remember === true ? 'allow_session' : 'allow_once';
  }
  return remember === true ? 'deny_session' : 'deny_once';
}

function normalizePermissionResponse(params: PermissionResponseParams): PermissionResponseParams {
  if (params.decision === 'allow') {
    return {
      ...params,
      decision: scopedDecision(true, params.remember),
    };
  }

  if (params.decision === 'deny') {
    return {
      ...params,
      decision: scopedDecision(false, params.remember),
    };
  }

  if (params.decision === undefined && params.allowed !== undefined && params.remember === true) {
    return {
      ...params,
      decision: scopedDecision(params.allowed, params.remember),
    };
  }

  return params;
}

function toGoalRpcParams(
  params: CreateGoalParams | UpdateGoalParams
): Record<string, string | number | null> {
  const rpcParams: Record<string, string | number | null> = {};
  if (params.objective !== undefined) rpcParams.objective = params.objective;
  if ('status' in params && params.status !== undefined) rpcParams.status = params.status;
  if (params.tokenBudget !== undefined) rpcParams.token_budget = params.tokenBudget;
  if (params.timeBudgetSeconds !== undefined) rpcParams.time_budget_seconds = params.timeBudgetSeconds;
  if (params.minTokensBeforeWrapUp !== undefined) {
    rpcParams.min_tokens_before_wrap_up = params.minTokensBeforeWrapUp;
  }
  if (params.minTimeSecondsBeforeWrapUp !== undefined) {
    rpcParams.min_time_seconds_before_wrap_up = params.minTimeSecondsBeforeWrapUp;
  }
  return rpcParams;
}

type EventWaiter = (result: IteratorResult<SDKEvent>) => void;

interface EventSubscriber {
  queue: SDKEvent[];
  waiters: EventWaiter[];
  closed: boolean;
}

const MAX_EVENT_BACKLOG = 1_024;

export class RPCClient {
  private transport: Transport;
  private eventBacklog: SDKEvent[] = [];
  private eventSubscribers = new Set<EventSubscriber>();
  private eventStreamsClosed = false;

  /**
   * Create a new RPCClient instance
   * 
   * @param config - Configuration options for the client
   * @param config.cwd - Working directory for the CLI
   * @param config.cliPath - Path to CLI binary (auto-detected if not provided)
   * @param config.debug - Enable debug logging
   * @param config.timeout - Request timeout in milliseconds
   * @param config.autoMode - Enable auto-mode for autonomous execution
   * @param config.unrestricted - Run in unrestricted mode
   * @param config.autoSkill - Enable auto-skill for automatic skill selection
   * @param config.autoCommit - Enable auto-commit with LLM-generated message
   * @param config.contextCompact - Enable context compaction
   * @param config.maxIterations - Max auto-mode iterations
   * @param config.maxRuntime - Max runtime in minutes
   * @param config.maxCost - Max API cost in dollars
   * @param config.sysPrompt - System prompt (inline string or file path)
   * @param config.appendSysPrompt - Append to system prompt
   * @param config.model - Model to use
   * @param config.temperature - Sampling temperature
   * @param config.yolo - Auto-approve tool calls matching pattern
   * @param config.yoloTimeout - Timeout in seconds for auto-approve mode
   * @param config.addDir - Additional directories to add to workspace
   * @param config.extraArgs - Additional CLI arguments
   */
  constructor(config: SDKConfig = {}) {
    // Detect provider from model ID if not explicitly set
    const detectedProvider = config.model !== undefined ? detectProviderFromModel(config.model) : undefined;
    const provider = config.provider ?? detectedProvider;

    // Validate provider-specific configuration if provider is set
    if (provider !== undefined) {
      validateProviderConfig(provider, config);
    }

    // Process skills - extract names from file paths and resolve references
    const skillSettings = Array.isArray(config.skills) ? undefined : config.skills;
    const skillRefs: SkillReference[] = config.skillRefs ?? (Array.isArray(config.skills) ? config.skills : skillSettings?.skills) ?? [];
    const processedSkills: string[] = [];
    const skillFilesToCopy: string[] = [];

    for (const ref of skillRefs) {
      const name = getSkillName(ref);
      const path = getSkillPath(ref);
      if (path !== undefined) {
        // File path detected - queue for copying
        skillFilesToCopy.push(path);
      }
      processedSkills.push(name);
    }

    const transportOptions: TransportOptions = {};

    if (config.cwd !== undefined) transportOptions.cwd = config.cwd;
    if (config.cliPath !== undefined) transportOptions.cliPath = config.cliPath;
    if (config.debug !== undefined) transportOptions.debug = config.debug;
    if (config.timeout !== undefined) transportOptions.timeout = config.timeout;
    if (config.autoMode !== undefined) transportOptions.autoMode = config.autoMode;
    if (config.unrestricted !== undefined) transportOptions.unrestricted = config.unrestricted;
    if (config.autoSkill !== undefined) transportOptions.autoSkill = config.autoSkill;
    if (skillSettings?.autoSkill !== undefined) transportOptions.autoSkill = skillSettings.autoSkill;
    if (config.autoCommit !== undefined) transportOptions.autoCommit = config.autoCommit;
    if (config.contextCompact !== undefined) transportOptions.contextCompact = config.contextCompact;
    if (config.context?.contextCompact !== undefined) transportOptions.contextCompact = config.context.contextCompact;
    if (config.maxIterations !== undefined) transportOptions.maxIterations = config.maxIterations;
    if (config.maxRuntime !== undefined) transportOptions.maxRuntime = config.maxRuntime;
    if (config.maxCost !== undefined) transportOptions.maxCost = config.maxCost;
    if (config.bare !== undefined) transportOptions.bare = config.bare;
    if (config.idleLogout !== undefined) transportOptions.idleLogout = config.idleLogout;
    if (config.fork !== undefined) transportOptions.fork = config.fork;
    if (config.displayLanguage !== undefined) transportOptions.displayLanguage = config.displayLanguage;
    if (config.sysPrompt !== undefined) transportOptions.sysPrompt = config.sysPrompt;
    if (config.systemPrompt !== undefined) transportOptions.sysPrompt = config.systemPrompt;
    if (config.systemPromptFile !== undefined) transportOptions.systemPromptFile = config.systemPromptFile;
    if (config.appendSysPrompt !== undefined) transportOptions.appendSysPrompt = config.appendSysPrompt;
    if (config.appendSystemPrompt !== undefined) transportOptions.appendSysPrompt = config.appendSystemPrompt;
    if (config.appendSystemPromptFile !== undefined) transportOptions.appendSystemPromptFile = config.appendSystemPromptFile;
    if (config.mcpConfig !== undefined) transportOptions.mcpConfig = config.mcpConfig;
    if (config.agents !== undefined) transportOptions.agents = config.agents;
    if (config.pluginDir !== undefined) transportOptions.pluginDir = config.pluginDir;
    if (config.model !== undefined) transportOptions.model = config.model;
    if (config.temperature !== undefined) transportOptions.temperature = config.temperature;
    if (config.yolo !== undefined) transportOptions.yolo = config.yolo;
    if (config.yoloTimeout !== undefined) transportOptions.yoloTimeout = config.yoloTimeout;
    if (config.additionalDirectories !== undefined) transportOptions.addDir = config.additionalDirectories;
    if (config.addDir !== undefined) transportOptions.addDir = config.addDir;
    if (config.extraArgs !== undefined) transportOptions.extraArgs = config.extraArgs;
    if (config.persistSession !== undefined) transportOptions.persistSession = config.persistSession;
    if (config.session?.persist !== undefined) transportOptions.persistSession = config.session.persist;
    if (config.session?.persistSession !== undefined) transportOptions.persistSession = config.session.persistSession;
    if (config.sessionId !== undefined) transportOptions.sessionId = config.sessionId;
    if (config.session?.sessionId !== undefined) transportOptions.sessionId = config.session.sessionId;
    if (config.resume !== undefined) transportOptions.resume = config.resume;
    if (config.session?.resume !== undefined) transportOptions.resume = config.session.resume;
    if (config.continue !== undefined) transportOptions.continue = config.continue;
    if (config.session?.continue !== undefined) transportOptions.continue = config.session.continue;
    if (config.session?.sessionPath !== undefined) transportOptions.sessionPath = config.session.sessionPath;
    if (config.session?.autoSaveInterval !== undefined) transportOptions.autoSaveInterval = config.session.autoSaveInterval;
    if (config.agentsMd?.enabled !== undefined) transportOptions.agentsMdEnable = config.agentsMd.enabled;
    if (config.agentsMd?.enable !== undefined) transportOptions.agentsMdEnable = config.agentsMd.enable;
    if (config.agentsMd?.createDefault !== undefined) transportOptions.agentsMdCreate = config.agentsMd.createDefault;
    if (config.agentsMd?.create !== undefined) transportOptions.agentsMdCreate = config.agentsMd.create;
    if (config.agentsMd?.path !== undefined) transportOptions.agentsMdPath = config.agentsMd.path;
    if (config.agentsMd?.autoUpdate !== undefined) transportOptions.agentsMdAutoUpdate = config.agentsMd.autoUpdate;
    if (config.context?.maxTokens !== undefined) transportOptions.maxTokens = config.context.maxTokens;
    if (config.context?.compactThreshold !== undefined) transportOptions.compressionThreshold = config.context.compactThreshold;
    if (config.context?.compressionThreshold !== undefined) transportOptions.compressionThreshold = config.context.compressionThreshold;
    if (config.context?.summarizationThreshold !== undefined) transportOptions.summarizationThreshold = config.context.summarizationThreshold;
    if (processedSkills.length > 0) transportOptions.skills = processedSkills;
    if (skillFilesToCopy.length > 0) transportOptions.skillFiles = skillFilesToCopy;
    if (skillSettings?.sources !== undefined) transportOptions.skillSources = skillSettings.sources;
    if (skillSettings?.installMissing !== undefined) transportOptions.installMissingSkills = skillSettings.installMissing;
    if (provider !== undefined) transportOptions.provider = provider;
    if (config.apiKey !== undefined) transportOptions.apiKey = config.apiKey;
    if (config.baseUrl !== undefined) transportOptions.baseUrl = config.baseUrl;
    if (config.autohandAIPlan !== undefined) transportOptions.autohandAIPlan = config.autohandAIPlan;
    if (config.port !== undefined) transportOptions.port = config.port;
    if (config.env !== undefined) transportOptions.env = config.env;
    if (config.envVars !== undefined) transportOptions.envVars = config.envVars;
    if (config.hooks?.enabled !== undefined) transportOptions.hooksEnabled = config.hooks.enabled;
    if (config.hooks?.hooks !== undefined) transportOptions.hooksDefinitions = config.hooks.hooks;

    this.transport = new Transport(transportOptions);
    this.transport.onTermination(() => this.closeEventStreams());

    // Register notification handlers
    this.setupNotificationHandlers();
  }

  /**
   * Start the client and initialize the transport
   * 
   * @throws {Error} If the transport fails to start
   */
  async start(): Promise<void> {
    await this.transport.start();
    this.eventStreamsClosed = false;
  }

  /**
   * Stop the client and close the transport
   */
  async stop(): Promise<void> {
    try {
      await this.transport.stop();
    } finally {
      this.closeEventStreams();
    }
  }

  /**
   * Send a prompt to the agent
   * 
   * @param params - Prompt parameters including message and context
   * @returns Result indicating success
   */
  async prompt(params: PromptParams): Promise<PromptResult> {
    return this.transport.request('autohand.prompt', params) as Promise<PromptResult>;
  }

  /**
   * Abort the current operation
   * 
   * @param params - Optional abort parameters
   * @returns Result indicating success
   */
  async abort(params: AbortParams = {}): Promise<AbortResult> {
    return this.transport.request('autohand.abort', params) as Promise<AbortResult>;
  }

  /**
   * Reset the current conversation and begin a new CLI session.
   */
  async reset(): Promise<ResetResult> {
    const result = await this.transport.request('autohand.reset', {});
    return validateSessionControlRpcResult('autohand.reset', result);
  }

  /**
   * Get the current state
   * 
   * @param params - Optional state query parameters
   * @returns Current agent state
   */
  async getState(params: GetStateParams = {}): Promise<GetStateResult> {
    return this.transport.request('autohand.getState', params) as Promise<GetStateResult>;
  }

  /**
   * Get conversation messages
   * 
   * @param params - Optional query parameters including limit
   * @returns Message history
   */
  async getMessages(params: GetMessagesParams = {}): Promise<GetMessagesResult> {
    return this.transport.request('autohand.getMessages', params) as Promise<GetMessagesResult>;
  }

  /**
   * Create a one-time browser handoff for the active session.
   */
  async createBrowserHandoff(
    params: BrowserHandoffCreateParams = {}
  ): Promise<BrowserHandoffCreateResult> {
    const result = await this.transport.request(
      'autohand.browserHandoff.create',
      params
    );
    return validateSessionControlRpcResult('autohand.browserHandoff.create', result);
  }

  /**
   * Consume a browser handoff token and attach its session.
   */
  async attachBrowserHandoff(
    params: BrowserHandoffAttachParams
  ): Promise<BrowserHandoffAttachResult> {
    const result = await this.transport.request(
      'autohand.browserHandoff.attach',
      params
    );
    return validateSessionControlRpcResult('autohand.browserHandoff.attach', result);
  }

  /**
   * Attach the newest unexpired browser handoff.
   */
  async attachLatestBrowserHandoff(): Promise<BrowserHandoffAttachResult> {
    const result = await this.transport.request(
      'autohand.browserHandoff.attachLatest',
      {}
    );
    return validateSessionControlRpcResult('autohand.browserHandoff.attachLatest', result);
  }

  /**
   * Start an autonomous auto-mode session.
   */
  async startAutomode(params: AutomodeStartParams): Promise<AutomodeStartResult> {
    const result = await this.transport.request(
      'autohand.automode.start',
      params
    );
    return validateSessionControlRpcResult('autohand.automode.start', result);
  }

  /**
   * Get the current auto-mode runtime and persisted state.
   */
  async getAutomodeStatus(): Promise<AutomodeStatusResult> {
    const result = await this.transport.request(
      'autohand.automode.status',
      {}
    );
    return validateSessionControlRpcResult('autohand.automode.status', result);
  }

  /**
   * Pause the active auto-mode session.
   */
  async pauseAutomode(): Promise<AutomodeOperationResult> {
    const result = await this.transport.request(
      'autohand.automode.pause',
      {}
    );
    return validateSessionControlRpcResult('autohand.automode.pause', result);
  }

  /**
   * Resume a paused auto-mode session.
   */
  async resumeAutomode(): Promise<AutomodeOperationResult> {
    const result = await this.transport.request(
      'autohand.automode.resume',
      {}
    );
    return validateSessionControlRpcResult('autohand.automode.resume', result);
  }

  /**
   * Cancel the active auto-mode session.
   */
  async cancelAutomode(
    params: AutomodeCancelParams = {}
  ): Promise<AutomodeOperationResult> {
    const result = await this.transport.request(
      'autohand.automode.cancel',
      params
    );
    return validateSessionControlRpcResult('autohand.automode.cancel', result);
  }

  /**
   * Get typed auto-mode iteration log entries.
   */
  async getAutomodeLog(
    params: AutomodeGetLogParams = {}
  ): Promise<AutomodeGetLogResult> {
    const result = await this.transport.request(
      'autohand.automode.getLog',
      params
    );
    return validateSessionControlRpcResult('autohand.automode.getLog', result);
  }

  /**
   * Respond to a permission request
   * 
   * @param params - Permission response parameters
   * @returns Response result
   */
  async permissionResponse(params: PermissionResponseParams): Promise<unknown> {
    return this.transport.request('autohand.permissionResponse', normalizePermissionResponse(params));
  }

  /** Acknowledge receipt of a permission request before the user decides it. */
  async acknowledgePermission(
    params: PermissionAcknowledgedParams
  ): Promise<PermissionAcknowledgedResult> {
    const result = await this.transport.request('autohand.permissionAcknowledged', params);
    return validateExtensionRpcResult('autohand.permissionAcknowledged', result);
  }

  /** Resolve a pending workspace-directory access request. */
  async respondToDirectoryAccess(
    params: DirectoryAccessResponseParams
  ): Promise<DirectoryAccessResponseResult> {
    const result = await this.transport.request('autohand.directoryAccessResponse', params);
    return validateExtensionRpcResult('autohand.directoryAccessResponse', result);
  }

  /** Acknowledge receipt of a directory-access request before resolving it. */
  async acknowledgeDirectoryAccess(
    params: DirectoryAccessAcknowledgedParams
  ): Promise<DirectoryAccessAcknowledgedResult> {
    const result = await this.transport.request(
      'autohand.directoryAccessAcknowledged',
      params
    );
    return validateExtensionRpcResult('autohand.directoryAccessAcknowledged', result);
  }

  /** Apply or reject a batch of proposed file changes. */
  async decideChanges(params: ChangesDecisionParams): Promise<ChangesDecisionResult> {
    const result = await this.transport.request('autohand.changesDecision', params);
    return validateExtensionRpcResult('autohand.changesDecision', result);
  }

  /** Return paginated saved-session metadata. */
  async getHistory(params: GetHistoryParams = {}): Promise<GetHistoryResult> {
    const result = await this.transport.request('autohand.getHistory', params);
    return validateExtensionRpcResult('autohand.getHistory', result);
  }

  /** Return one saved session with its messages and workspace metadata. */
  async getSession(params: GetSessionParams): Promise<GetSessionResult> {
    const result = await this.transport.request('autohand.getSession', params);
    return validateExtensionRpcResult('autohand.getSession', result);
  }

  /**
   * Set permission mode
   * 
   * @param mode - Permission mode to set
   * @returns Result of the operation
   */
  async setPermissionMode(mode: PermissionMode | LegacyPermissionMode): Promise<unknown> {
    return this.transport.request('autohand.permissionModeSet', { mode });
  }

  /**
   * Enable or disable CLI plan mode.
   *
   * Plan mode is separate from permission mode. When enabled, CLI-3 restricts
   * the agent to read-only planning tools until the plan is accepted.
   *
   * @param enabled - Whether plan mode should be active
   * @returns Result of the operation
   */
  async setPlanMode(enabled: boolean): Promise<PlanModeSetResult> {
    return this.transport.request('autohand.planModeSet', { enabled }) as Promise<PlanModeSetResult>;
  }

  /**
   * Set model
   * 
   * @param model - Model identifier to set
   * @returns Result of the operation
   */
  async setModel(model?: string): Promise<unknown> {
    return this.transport.request('autohand.modelSet', { model });
  }

  /**
   * Set max thinking tokens
   * 
   * @param maxThinkingTokens - Maximum thinking tokens, or null to disable
   * @returns Result of the operation
   */
  async setMaxThinkingTokens(maxThinkingTokens: number | null): Promise<unknown> {
    return this.transport.request('autohand.maxThinkingTokensSet', { maxThinkingTokens });
  }

  /**
   * Apply flag settings
   * 
   * @param settings - Settings to apply
   * @returns Result of the operation
   */
  async applyFlagSettings(settings: Record<string, unknown>): Promise<unknown> {
    return this.transport.request('autohand.applyFlagSettings', { settings });
  }

  /**
   * Get supported models
   * 
   * @returns List of supported models
   */
  async getSupportedModels(): Promise<unknown> {
    return this.transport.request('autohand.getSupportedModels', {});
  }

  /**
   * Get supported commands
   * 
   * @returns List of supported commands
   */
  async getSupportedCommands(): Promise<unknown> {
    return this.transport.request('autohand.getSupportedCommands', {});
  }

  async getGoal(): Promise<GoalSnapshotResult> {
    return this.transport.request('autohand.goal.get', {}) as Promise<GoalSnapshotResult>;
  }

  async createGoal(params: CreateGoalParams): Promise<GoalMutationRpcResult> {
    return this.transport.request('autohand.goal.create', toGoalRpcParams(params)) as Promise<GoalMutationRpcResult>;
  }

  async updateGoal(params: UpdateGoalParams): Promise<GoalMutationRpcResult> {
    return this.transport.request('autohand.goal.update', toGoalRpcParams(params)) as Promise<GoalMutationRpcResult>;
  }

  async clearGoal(): Promise<GoalMutationRpcResult> {
    return this.transport.request('autohand.goal.clear', {}) as Promise<GoalMutationRpcResult>;
  }

  async queueGoal(params: QueueGoalParams): Promise<GoalMutationRpcResult> {
    return this.transport.request('autohand.goal.queue', toGoalRpcParams(params)) as Promise<GoalMutationRpcResult>;
  }

  async startQueuedGoal(): Promise<GoalMutationRpcResult> {
    return this.transport.request('autohand.goal.startQueued', {}) as Promise<GoalMutationRpcResult>;
  }

  async listGoalTemplates(): Promise<GoalTemplatesResult> {
    return this.transport.request('autohand.goal.listTemplates', {}) as Promise<GoalTemplatesResult>;
  }

  async startAutoresearch(params: AutoresearchStartParams): Promise<AutoresearchStartResult> {
    return this.transport.request('autohand.autoresearch.start', params) as Promise<AutoresearchStartResult>;
  }

  async getAutoresearchStatus(): Promise<AutoresearchStatusResult> {
    return this.transport.request('autohand.autoresearch.status', {}) as Promise<AutoresearchStatusResult>;
  }

  async stopAutoresearch(): Promise<AutoresearchStopResult> {
    return this.transport.request('autohand.autoresearch.stop', {}) as Promise<AutoresearchStopResult>;
  }

  async getAutoresearchHistory(): Promise<AutoresearchHistoryResult> {
    return this.transport.request('autohand.autoresearch.history', {}) as Promise<AutoresearchHistoryResult>;
  }

  async replayAutoresearch(params: AutoresearchReplayParams): Promise<AutoresearchReplayResult> {
    return this.transport.request('autohand.autoresearch.replay', params) as Promise<AutoresearchReplayResult>;
  }

  async rescoreAutoresearch(params: AutoresearchRescoreParams): Promise<AutoresearchRescoreResult> {
    return this.transport.request('autohand.autoresearch.rescore', params) as Promise<AutoresearchRescoreResult>;
  }

  async compareAutoresearch(params: AutoresearchCompareParams): Promise<AutoresearchCompareResult> {
    return this.transport.request('autohand.autoresearch.compare', params) as Promise<AutoresearchCompareResult>;
  }

  async getAutoresearchPareto(): Promise<AutoresearchParetoResult> {
    return this.transport.request('autohand.autoresearch.pareto', {}) as Promise<AutoresearchParetoResult>;
  }

  async pinAutoresearch(params: AutoresearchPinParams): Promise<AutoresearchPinResult> {
    return this.transport.request('autohand.autoresearch.pin', params) as Promise<AutoresearchPinResult>;
  }

  async pruneAutoresearch(params: AutoresearchPruneParams = {}): Promise<AutoresearchPruneResult> {
    return this.transport.request('autohand.autoresearch.prune', params) as Promise<AutoresearchPruneResult>;
  }

  /**
   * Get context usage
   * 
   * @returns Context usage breakdown
   */
  async getContextUsage(): Promise<unknown> {
    return this.transport.request('autohand.getContextUsage', {});
  }

  /**
   * Reload plugins
   * 
   * @returns Reload result
   */
  async reloadPlugins(): Promise<unknown> {
    return this.transport.request('autohand.reloadPlugins', {});
  }

  /**
   * Get account info
   * 
   * @returns Account information
   */
  async getAccountInfo(): Promise<unknown> {
    return this.transport.request('autohand.getAccountInfo', {});
  }

  /** Return the community skills registry, optionally bypassing the cache. */
  async getSkillsRegistry(
    params: GetSkillsRegistryParams = {}
  ): Promise<GetSkillsRegistryResult> {
    return this.transport.request(
      'autohand.getSkillsRegistry',
      params
    ) as Promise<GetSkillsRegistryResult>;
  }

  /** Install a community skill into user or project scope. */
  async installSkill(params: InstallSkillParams): Promise<InstallSkillResult> {
    return this.transport.request(
      'autohand.installSkill',
      params
    ) as Promise<InstallSkillResult>;
  }

  /** List MCP servers and their live connection status. */
  async listMcpServers(): Promise<McpListServersResult> {
    return this.transport.request(
      'autohand.mcp.listServers',
      {}
    ) as Promise<McpListServersResult>;
  }

  /** List MCP tools, optionally restricted to one server. */
  async listMcpTools(params: McpListToolsParams = {}): Promise<McpListToolsResult> {
    return this.transport.request(
      'autohand.mcp.listTools',
      params
    ) as Promise<McpListToolsResult>;
  }

  /** Return the persisted MCP server configurations. */
  async getMcpServerConfigs(): Promise<McpGetServerConfigsResult> {
    return this.transport.request(
      'autohand.mcp.getServerConfigs',
      {}
    ) as Promise<McpGetServerConfigsResult>;
  }

  /**
   * Toggle MCP server
   * 
   * @param serverName - Name of the MCP server
   * @param enabled - Whether to enable or disable
   * @returns Result of the operation
   */
  async toggleMcpServer(serverName: string, enabled: boolean): Promise<unknown> {
    return this.transport.request('autohand.mcp.toggleServer', { serverName, enabled });
  }

  /**
   * Reconnect MCP server
   * 
   * @param serverName - Name of the MCP server
   * @returns Result of the operation
   */
  async reconnectMcpServer(serverName: string): Promise<unknown> {
    return this.transport.request('autohand.mcp.reconnectServer', { serverName });
  }

  /**
   * Set MCP servers
   * 
   * @param servers - Server configurations
   * @returns Result of the operation
   */
  async setMcpServers(servers: Record<string, unknown>): Promise<unknown> {
    return this.transport.request('autohand.mcp.setServers', { servers });
  }

  /**
   * Get all hooks and settings
   * 
   * @returns Hooks settings including all hook definitions
   */
  async getHooks(): Promise<GetHooksResult> {
    return this.transport.request('autohand.hooks.getHooks', {}) as Promise<GetHooksResult>;
  }

  /**
   * Add a new hook
   * 
   * @param params - Hook definition to add
   * @returns Result with success status and hook ID
   */
  async addHook(params: AddHookParams): Promise<AddHookResult> {
    return this.transport.request('autohand.hooks.addHook', params) as Promise<AddHookResult>;
  }

  /**
   * Remove a hook by event and index
   * 
   * @param params - Event type and hook index
   * @returns Result indicating success
   */
  async removeHook(params: RemoveHookParams): Promise<RemoveHookResult> {
    return this.transport.request('autohand.hooks.removeHook', params) as Promise<RemoveHookResult>;
  }

  /**
   * Toggle a hook's enabled status
   * 
   * @param params - Event type and hook index
   * @returns Result with new enabled status
   */
  async toggleHook(params: ToggleHookParams): Promise<ToggleHookResult> {
    return this.transport.request('autohand.hooks.toggleHook', params) as Promise<ToggleHookResult>;
  }

  /**
   * Test a hook with a sample context
   * 
   * @param params - Hook definition to test
   * @returns Execution result including stdout, stderr, and response
   */
  async testHook(params: TestHookParams): Promise<TestHookResult> {
    return this.transport.request('autohand.hooks.testHook', params) as Promise<TestHookResult>;
  }

  /**
   * Send a custom RPC request
   * 
   * @param method - RPC method name
   * @param params - Method parameters
   * @returns RPC response
   */
  async request(method: string, params?: JsonRpcParams): Promise<unknown> {
    return this.transport.request(method, params);
  }

  /**
   * Subscribe to events
   * 
   * Returns an async generator that yields SDK events as they are received
   * from the CLI. Events are queued and delivered in order.
   * 
   * @returns Async generator yielding SDK events
   */
  async *events(
    signal?: AbortSignal,
    includeBacklog: boolean = true
  ): AsyncGenerator<SDKEvent> {
    if (this.eventStreamsClosed || signal?.aborted === true) return;

    const subscriber: EventSubscriber = { queue: [], waiters: [], closed: false };
    if (includeBacklog && this.eventSubscribers.size === 0 && this.eventBacklog.length > 0) {
      subscriber.queue.push(...this.eventBacklog.splice(0));
    }
    this.eventSubscribers.add(subscriber);

    const abort = (): void => this.closeEventSubscriber(subscriber);
    signal?.addEventListener('abort', abort, { once: true });

    try {
      while (!subscriber.closed) {
        if (subscriber.queue.length > 0) {
          const event = subscriber.queue.shift();
          if (event !== undefined) yield event;
          continue;
        }

        const result = await new Promise<IteratorResult<SDKEvent>>((resolve) => {
          if (subscriber.closed) {
            resolve({ done: true, value: undefined });
            return;
          }
          subscriber.waiters.push(resolve);
        });

        if (result.done === true) return;
        yield result.value;
      }
    } finally {
      signal?.removeEventListener('abort', abort);
      this.closeEventSubscriber(subscriber);
    }
  }

  /**
   * Setup notification handlers
   * 
   * Registers handlers for all CLI notifications and converts them to SDK events.
   * 
   * @private
   */
  private setupNotificationHandlers(): void {
    // Agent lifecycle
    this.transport.onNotification('autohand.agentStart', (params) => {
      const p = params as { sessionId: string; model: string; workspace: string; timestamp: string };
      this.queueEvent({ type: 'agent_start', sessionId: p.sessionId, model: p.model, workspace: p.workspace, timestamp: p.timestamp });
    });

    this.transport.onNotification('autohand.agentEnd', (params) => {
      const p = params as { sessionId: string; reason: 'completed' | 'aborted' | 'error'; timestamp: string };
      this.queueEvent({ type: 'agent_end', sessionId: p.sessionId, reason: p.reason, timestamp: p.timestamp });
    });

    // Turn lifecycle
    this.transport.onNotification('autohand.turnStart', (params) => {
      const p = params as { turnId: string; timestamp: string };
      this.queueEvent({ type: 'turn_start', turnId: p.turnId, timestamp: p.timestamp });
    });

    this.transport.onNotification('autohand.turnEnd', (params) => {
      const p = params as {
        turnId: string;
        timestamp: string;
        tokensUsed?: number;
        tokensUsageStatus?: 'actual' | 'unavailable';
        durationMs?: number;
        contextPercent?: number;
      };
      // Map turn_end to agent_end for streamPrompt to detect completion
      this.queueEvent({ type: 'agent_end', reason: 'completed', sessionId: p.turnId, timestamp: new Date().toISOString() });
      const event: SDKEvent = {
        type: 'turn_end',
        turnId: p.turnId,
        timestamp: p.timestamp,
        ...(p.tokensUsed !== undefined ? { tokensUsed: p.tokensUsed } : {}),
        ...(p.tokensUsageStatus !== undefined ? { tokensUsageStatus: p.tokensUsageStatus } : {}),
        ...(p.durationMs !== undefined ? { durationMs: p.durationMs } : {}),
        ...(p.contextPercent !== undefined ? { contextPercent: p.contextPercent } : {}),
      };
      this.queueEvent(event);
    });

    // Message lifecycle
    this.transport.onNotification('autohand.messageStart', (params) => {
      const p = params as { messageId: string; role: 'assistant'; timestamp: string };
      this.queueEvent({ type: 'message_start', messageId: p.messageId, role: p.role, timestamp: p.timestamp });
    });

    this.transport.onNotification('autohand.messageUpdate', (params) => {
      const p = params as { messageId?: string; delta: string; thought?: string; timestamp: string };
      const event: { type: 'message_update'; delta: string; timestamp: string; messageId?: string; thought?: string } = { type: 'message_update', delta: p.delta, timestamp: p.timestamp };
      if (p.messageId !== undefined) event.messageId = p.messageId;
      if (p.thought !== undefined) event.thought = p.thought;
      this.queueEvent(event);
    });

    this.transport.onNotification('autohand.messageEnd', (params) => {
      const p = params as { messageId: string; content: string; timestamp: string };
      this.queueEvent({ type: 'message_end', messageId: p.messageId, content: p.content, timestamp: p.timestamp });
    });

    // Tool lifecycle
    this.transport.onNotification('autohand.toolStart', (params) => {
      const p = params as { toolId: string; toolName: string; args: Record<string, unknown>; timestamp: string };
      this.queueEvent({ type: 'tool_start', toolId: p.toolId, toolName: p.toolName, args: p.args, timestamp: p.timestamp });
    });

    this.transport.onNotification('autohand.toolUpdate', (params) => {
      const p = params as { toolId: string; output: string; stream: 'stdout' | 'stderr'; timestamp: string };
      this.queueEvent({ type: 'tool_update', toolId: p.toolId, output: p.output, stream: p.stream, timestamp: p.timestamp });
    });

    this.transport.onNotification('autohand.toolEnd', (params) => {
      const p = params as { toolId: string; toolName: string; success: boolean; output?: string; error?: string; timestamp: string };
      const event: { type: 'tool_end'; toolId: string; toolName: string; success: boolean; timestamp: string; output?: string; error?: string } = { type: 'tool_end', toolId: p.toolId, toolName: p.toolName, success: p.success, timestamp: p.timestamp };
      if (p.output !== undefined) event.output = p.output;
      if (p.error !== undefined) event.error = p.error;
      this.queueEvent(event);
    });

    // File modifications
    this.transport.onNotification('autohand.hook.fileModified', (params) => {
      const p = params as { filePath: string; changeType: 'create' | 'modify' | 'delete'; toolId: string; timestamp: string };
      this.queueEvent({ type: 'file_modified', filePath: p.filePath, changeType: p.changeType, toolId: p.toolId, timestamp: p.timestamp });
    });

    // Permission requests
    this.transport.onNotification('autohand.permissionRequest', (params) => {
      const p = params as { requestId: string; tool: string; description: string; context: { command?: string; path?: string; args?: string[] }; options?: string[]; timestamp: string };
      const event: { type: 'permission_request'; requestId: string; tool: string; description: string; context: { command?: string; path?: string; args?: string[] }; timestamp: string; options?: string[] } = { type: 'permission_request', requestId: p.requestId, tool: p.tool, description: p.description, context: p.context, timestamp: p.timestamp };
      if (p.options !== undefined) event.options = p.options;
      this.queueEvent(event);
    });

    const queueAutoresearchEvent = (phase: AutoresearchLifecycleEvent['phase'], params: unknown): void => {
      const p = params as Omit<AutoresearchLifecycleEvent, 'type' | 'phase'>;
      this.queueEvent({
        type: 'autoresearch',
        phase,
        active: p.active,
        runsLogged: p.runsLogged,
        statusText: p.statusText,
        subcommand: p.subcommand,
        timestamp: p.timestamp,
        ...(p.goal !== undefined ? { goal: p.goal } : {}),
        ...(p.iteration !== undefined ? { iteration: p.iteration } : {}),
        ...(p.maxIterations !== undefined ? { maxIterations: p.maxIterations } : {}),
        ...(p.message !== undefined ? { message: p.message } : {}),
      });
    };

    this.transport.onNotification('autohand.autoresearch.start', (params) => {
      queueAutoresearchEvent('start', params);
    });
    this.transport.onNotification('autohand.autoresearch.status', (params) => {
      queueAutoresearchEvent('status', params);
    });
    this.transport.onNotification('autohand.autoresearch.pause', (params) => {
      queueAutoresearchEvent('pause', params);
    });
    this.transport.onNotification('autohand.autoresearch.event', (params) => {
      const p = params as Omit<AutoresearchOperationEvent, 'type'>;
      this.queueEvent({
        type: 'autoresearch',
        operation: p.operation,
        phase: p.phase,
        success: p.success,
        timestamp: p.timestamp,
        ...(p.attemptId !== undefined ? { attemptId: p.attemptId } : {}),
        ...(p.applied !== undefined ? { applied: p.applied } : {}),
        ...(p.error !== undefined ? { error: p.error } : {}),
      });
    });

    // Errors
    this.transport.onNotification('autohand.error', (params) => {
      const p = params as { code: number; message: string; recoverable: boolean; timestamp: string };
      this.queueEvent({ type: 'error', code: p.code, message: p.message, recoverable: p.recoverable, timestamp: p.timestamp });
    });
  }

  /**
   * Queue an event for delivery
   * 
   * Either delivers the event immediately to a waiting resolver or queues it
   * for later delivery.
   * 
   * @param event - The event to queue
   * @private
   */
  private queueEvent(event: SDKEvent): void {
    if (this.eventStreamsClosed) return;

    if (this.eventSubscribers.size === 0) {
      this.eventBacklog.push(event);
      if (this.eventBacklog.length > MAX_EVENT_BACKLOG) {
        this.eventBacklog.shift();
      }
      return;
    }

    for (const subscriber of this.eventSubscribers) {
      const waiter = subscriber.waiters.shift();
      if (waiter !== undefined) {
        waiter({ done: false, value: event });
      } else {
        subscriber.queue.push(event);
        if (subscriber.queue.length > MAX_EVENT_BACKLOG) {
          subscriber.queue.shift();
        }
      }
    }
  }

  private closeEventSubscriber(subscriber: EventSubscriber): void {
    if (subscriber.closed) return;
    subscriber.closed = true;
    subscriber.queue.length = 0;
    this.eventSubscribers.delete(subscriber);
    for (const waiter of subscriber.waiters.splice(0)) {
      waiter({ done: true, value: undefined });
    }
  }

  private closeEventStreams(): void {
    this.eventStreamsClosed = true;
    this.eventBacklog.length = 0;
    for (const subscriber of [...this.eventSubscribers]) {
      this.closeEventSubscriber(subscriber);
    }
  }

  /**
   * Check if the client is connected
   * 
   * @returns true if the transport is running
   */
  isConnected(): boolean {
    return this.transport.isRunning();
  }
}
