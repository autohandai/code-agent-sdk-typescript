/**
 * Main SDK class for Autohand Agent SDK
 * 
 * Provides a high-level API for interacting with the Autohand CLI through JSON-RPC.
 * This class offers methods for prompt execution, event streaming, permission management,
 * model switching, and full lifecycle control of agent sessions.
 * 
 * The design follows Anthropic's Query interface pattern with rich control methods
 * for dynamic runtime configuration.
 * 
 * @example
 * ```typescript
 * const sdk = new AutohandSDK({
 *   cwd: '/path/to/project',
 *   model: 'openrouter/auto',
 *   permissionMode: 'default',
 * });
 * 
 * await sdk.start();
 * for await (const event of sdk.streamPrompt({ message: 'Help me refactor this code' })) {
 *   if (event.type === 'message_update') {
 *     console.log(event.delta);
 *   }
 * }
 * await sdk.close();
 * ```
 */

import { RPCClient } from '../rpc/client.js';
import type {
  SDKConfig,
  PromptParams,
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
  ResetResult,
  PermissionDecisionScope,
  PermissionResponseParams,
  SDKEvent,
  ModelInfo,
  AgentInfo,
  ContextUsage,
  AccountInfo,
  McpServerConfig,
  SessionStats,
  SessionMetadata,
  SkillReference,
  HooksSettings,
  HookDefinition,
  HookEvent,
  AddHookResult,
  RemoveHookResult,
  ToggleHookResult,
  TestHookResult,
  GetHooksResult,
  SlashCommand,
  SlashCommandArguments,
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
  GetSkillsRegistryParams,
  GetSkillsRegistryResult,
  InstallSkillParams,
  InstallSkillResult,
  McpListServersResult,
  McpListToolsParams,
  McpListToolsResult,
  McpGetServerConfigsResult,
} from '../types/index.js';
import { Tool, loadAgentsMd, createDefaultAgentsMd } from '../types/index.js';

export function formatSlashCommand(
  command: SlashCommand,
  args?: SlashCommandArguments
): string {
  const normalizedCommand = command.trim();
  if (!normalizedCommand.startsWith('/') || /\s/.test(normalizedCommand)) {
    throw new Error(`Invalid slash command: ${command}`);
  }

  const normalizedArgs = typeof args === 'string'
    ? args.trim()
    : args?.map((arg) => arg.trim()).filter((arg) => arg !== '').join(' ') ?? '';
  return normalizedArgs === '' ? normalizedCommand : `${normalizedCommand} ${normalizedArgs}`;
}

/**
 * Process AGENTS.md configuration from prompt params
 * Handles loading from paths, URLs, or inline content
 */
async function processAgentsMdConfig(
  agentsMd: PromptParams['agentsMd'],
  _cwd: string
): Promise<{ content?: string; path?: string; auto?: true } | undefined> {
  if (agentsMd === undefined) return undefined;

  // String form: path, URL, content, or 'auto'
  if (typeof agentsMd === 'string') {
    if (agentsMd === 'auto') {
      // Auto-detect from workspace
      return { auto: true };
    }
    // Check if it's a URL
    if (agentsMd.startsWith('http://') || agentsMd.startsWith('https://')) {
      const content = await loadAgentsMd(agentsMd);
      return { content };
    }
    // Check if it's a file path
    if (agentsMd.startsWith('file://') || agentsMd.endsWith('.md') || agentsMd.includes('/')) {
      const content = await loadAgentsMd(agentsMd);
      return { content, path: agentsMd };
    }
    // Treat as raw content
    return { content: agentsMd };
  }

  // Object form
  if (agentsMd.path !== undefined) {
    const content = await loadAgentsMd(agentsMd.path);
    return { content, path: agentsMd.path };
  }
  if (agentsMd.content !== undefined) {
    return { content: agentsMd.content };
  }
  if (agentsMd.auto === true) {
    return { auto: true };
  }

  return undefined;
}

function addAgentsMdToPrompt(
  params: PromptParams,
  agentsMd: { content?: string; path?: string; auto?: true }
): PromptParams {
  const prompt: PromptParams = {
    message: params.message,
    context: {
      ...(params.context ?? {}),
      agentsMd,
    },
  };
  if (params.images !== undefined) {
    prompt.images = params.images;
  }
  if (params.thinkingLevel !== undefined) {
    prompt.thinkingLevel = params.thinkingLevel;
  }
  return prompt;
}

function allowDecision(scope: PermissionDecisionScope) {
  switch (scope) {
    case 'once':
      return 'allow_once' as const;
    case 'session':
      return 'allow_session' as const;
    case 'project':
      return 'allow_always_project' as const;
    case 'user':
      return 'allow_always_user' as const;
  }
}

function denyDecision(scope: PermissionDecisionScope) {
  switch (scope) {
    case 'once':
      return 'deny_once' as const;
    case 'session':
      return 'deny_session' as const;
    case 'project':
      return 'deny_always_project' as const;
    case 'user':
      return 'deny_always_user' as const;
  }
}

function requiresStartupPermissionModeRpc(
  mode: SDKConfig['permissionMode']
): mode is Exclude<NonNullable<SDKConfig['permissionMode']>, 'plan' | 'default' | 'interactive' | 'ask' | 'yolo'> {
  return mode !== undefined
    && mode !== 'plan'
    && mode !== 'default'
    && mode !== 'interactive'
    && mode !== 'ask'
    && mode !== 'yolo';
}

export class AutohandSDK {
  private static readonly PROMPT_CLEANUP_TIMEOUT_MS = 2_000;
  private client: RPCClient;
  private started: boolean = false;
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;
  private promptTail: Promise<void> = Promise.resolve();
  private _tools: Tool[] = [];
  private _skills: SkillReference[] = [];

  /**
   * Create a new AutohandSDK instance
   * 
   * The CLI binary is automatically detected based on platform/architecture
   * from the bundled binaries. No manual configuration needed for production use.
   * 
   * @param config - Configuration options for the SDK (all optional)
   * @param config.cwd - Working directory for the CLI (defaults to process.cwd())
   * @param config.cliPath - Override path to CLI binary (auto-detected from bundled binaries if not provided)
   * @param config.debug - Enable debug logging (default: false)
   * @param config.timeout - Request timeout in milliseconds (default: 300000)
   * @param config.model - Model to use for agent execution
   * @param config.permissionMode - Permission mode for tool execution
   * @param config.systemPrompt - Replace the system prompt (inline string or file path)
   * @param config.appendSystemPrompt - Append to the default system prompt (inline string or file path)
   * @param config.mcpServers - MCP server configurations
   * @param config.env - Environment variables to pass to CLI
   * 
   * @example
   * ```typescript
   * // Simple usage - binary auto-detected
   * const sdk = new AutohandSDK({ model: 'claude-sonnet-4' });
   * 
   * // Override for local development
   * const sdk = new AutohandSDK({ cliPath: '/path/to/dev/autohand' });
   * ```
   */
  constructor(private config: SDKConfig = {}) {
    this.client = new RPCClient(config);
    // Initialize skills from config if provided
    const skillRefs = config.skillRefs ?? (Array.isArray(config.skills) ? config.skills : config.skills?.skills);
    if (skillRefs) {
      this._skills = skillRefs;
    }
  }

  private rebuildClient(): void {
    const clientConfig: SDKConfig = this._skills.length > 0
      ? { ...this.config, skillRefs: this._skills }
      : this.config;
    this.client = new RPCClient(clientConfig);
  }

  private ensureNotStarted(operation: string): void {
    if (this.started) {
      throw new Error(`${operation} must be called before start().`);
    }
  }

  // ============================================================================
  // Configuration Properties
  // ============================================================================

  /**
   * Set the tools available to the agent
   * 
   * This updates the configuration and will be used when the CLI is started.
   * 
   * @param tools - Array of tools to enable
   * 
   * @example
   * ```typescript
   * const sdk = new AutohandSDK();
   * sdk.tools = [Tool.READ, Tool.WRITE, Tool.EDIT];
   * ```
   */
  set tools(tools: Tool[]) {
    this._tools = tools;
    // Note: allowedTools is not currently supported in CLI flags
    // This is stored for future use or can be used with yolo pattern
  }

  /**
   * Get the current tools available to the agent
   */
  get tools(): Tool[] {
    return this._tools;
  }

  // ============================================================================
  // Skills Property
  // ============================================================================

  /**
   * Set the skills for the agent.
   *
   * Skills can be:
   * - Built-in skill names: 'typescript', 'react', 'testing'
   * - File paths to SKILL.md files: './skills/custom/SKILL.md'
   * - Objects with explicit name and path: { name: 'custom', path: './skills/SKILL.md' }
   *
   * File paths are auto-detected and the SDK copies them to ~/.autohand/skills/
   * before starting the CLI.
   *
   * @param skills - Array of skill references
   *
   * @example
   * ```typescript
   * // Simple skill names
   * sdk.skills = ['typescript', 'react'];
   *
   * // Mix of names and file paths
   * sdk.skills = ['typescript', './skills/my-custom/SKILL.md'];
   *
   * // Explicit objects for control
   * sdk.skills = [
   *   'typescript',
   *   { name: 'my-skill', path: './skills/SKILL.md', scope: 'project' }
   * ];
   * ```
   */
  set skills(skills: SkillReference[]) {
    this._skills = skills;
  }

  /**
   * Get the current skills configured for the agent
   */
  get skills(): SkillReference[] {
    return this._skills;
  }

  // ============================================================================
  // System Prompt Configuration
  // ============================================================================

  /**
   * Replace the CLI system prompt for this session.
   *
   * This maps to CLI-3's --sys-prompt option and must be configured before
   * start(). The value can be inline prompt text or a file path, matching CLI
   * behavior.
   *
   * Replacing the system prompt bypasses the default Autohand prompt, so most
   * integrations should prefer appendSystemPrompt unless they intentionally own
   * the full agent contract.
   *
   * @param promptOrPath - Inline system prompt text or a prompt file path
   * @returns The SDK instance for chaining
   */
  setSystemPrompt(promptOrPath: string): this {
    this.ensureNotStarted('setSystemPrompt');
    this.config.sysPrompt = promptOrPath;
    delete this.config.systemPrompt;
    this.rebuildClient();
    return this;
  }

  /**
   * Append instructions to the default CLI system prompt for this session.
   *
   * This maps to CLI-3's --append-sys-prompt option and must be configured
   * before start(). The value can be inline prompt text or a file path, matching
   * CLI behavior.
   *
   * @param promptOrPath - Inline text or a prompt file path to append
   * @returns The SDK instance for chaining
   */
  appendSystemPrompt(promptOrPath: string): this {
    this.ensureNotStarted('appendSystemPrompt');
    this.config.appendSysPrompt = promptOrPath;
    delete this.config.appendSystemPrompt;
    this.rebuildClient();
    return this;
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Start the SDK and initialize the CLI subprocess
   * 
   * This method spawns the Autohand CLI in RPC mode and prepares it for
   * receiving commands. It must be called before any other operations.
   * 
   * @throws {Error} If the CLI process fails to start
   * 
   * @example
   * ```typescript
   * const sdk = new AutohandSDK();
   * await sdk.start();
   * ```
   */
  async start(): Promise<void> {
    if (this.stopPromise !== null) await this.stopPromise;
    if (this.startPromise !== null) return this.startPromise;
    if (this.started && this.client.isConnected()) return;

    const operation = this.startSession();
    this.startPromise = operation;
    try {
      await operation;
    } finally {
      if (this.startPromise === operation) {
        this.startPromise = null;
      }
    }
  }

  private async startSession(): Promise<void> {
    this.started = false;

    // If skills were set after construction, update config and rebuild client
    if (this._skills.length > 0) {
      this.config.skillRefs = this._skills;
      this.client = new RPCClient(this.config);
    }

    try {
      await this.client.start();

      if (this.config.features !== undefined) {
        await this.client.applyFlagSettings({ features: this.config.features });
      }

      const startupPermissionMode = this.config.permissionMode;
      if (requiresStartupPermissionModeRpc(startupPermissionMode)) {
        await this.client.setPermissionMode(startupPermissionMode);
      }

      const shouldEnablePlanMode = this.config.planMode ?? this.config.permissionMode === 'plan';
      if (shouldEnablePlanMode) {
        await this.client.setPlanMode(true);
      }

      if (!this.client.isConnected()) {
        throw new Error('CLI process terminated during SDK startup');
      }
      this.started = true;
    } catch (error) {
      await this.client.stop().catch(() => undefined);
      this.started = false;
      throw error;
    }
  }

  /**
   * Stop the SDK and terminate the CLI subprocess
   * 
   * Gracefully shuts down the CLI process. The SDK can be restarted by calling
   * start() again after stop().
   * 
   * @example
   * ```typescript
   * await sdk.stop();
   * ```
   */
  async stop(): Promise<void> {
    if (this.stopPromise !== null) return this.stopPromise;

    const operation = this.stopSession();
    this.stopPromise = operation;
    try {
      await operation;
    } finally {
      if (this.stopPromise === operation) {
        this.stopPromise = null;
      }
    }
  }

  private async stopSession(): Promise<void> {
    if (this.startPromise !== null) {
      await this.startPromise.catch(() => undefined);
    }
    if (!this.started && !this.client.isConnected()) return;
    try {
      await this.client.stop();
    } finally {
      this.started = false;
    }
  }

  /**
   * Close the SDK and clean up all resources
   * 
   * This is an alias for stop() and should be called when you're done
   * using the SDK to ensure proper cleanup.
   * 
   * @example
   * ```typescript
   * await sdk.close();
   * ```
   */
  async close(): Promise<void> {
    await this.stop();
  }

  // ============================================================================
  // Prompt Methods
  // ============================================================================

  /**
   * Send a prompt to the agent
   * 
   * Sends a message to the agent for processing. This is a non-streaming
   * operation - use streamPrompt() for real-time event streaming.
   * 
   * @param params - Prompt parameters
   * @param params.message - The message to send to the agent
   * @param params.context - Optional context including files and selection
   * @param params.images - Optional image attachments
   * @param params.thinkingLevel - Optional thinking depth level
   * 
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * await sdk.prompt({
   *   message: 'Refactor this function to be more efficient',
   *   context: {
   *     files: ['src/utils.ts'],
   *     selection: {
   *       file: 'src/utils.ts',
   *       startLine: 10,
   *       endLine: 20,
   *       text: 'selected code here'
   *     }
   *   }
   * });
   * ```
   */
  async prompt(params: PromptParams): Promise<void> {
    const events = this.streamPrompt(params);
    let event = await events.next();
    while (event.done !== true) {
      // The non-streaming API deliberately discards events but waits for the
      // terminal turn marker. The prompt RPC response only acknowledges that
      // background work was accepted by the CLI.
      event = await events.next();
    }
  }

  /**
   * Stream a prompt with real-time events
   * 
   * Sends a message to the agent and yields events as they occur, including
   * message deltas, tool calls, and completion status. This is the preferred
   * method for interactive applications.
   * 
   * @param params - Prompt parameters (same as prompt())
   * @returns Async generator yielding SDK events
   * 
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * for await (const event of sdk.streamPrompt({ message: 'Hello' })) {
   *   if (event.type === 'message_update') {
   *     process.stdout.write(event.delta);
   *   } else if (event.type === 'tool_start') {
   *     console.log(`Running tool: ${event.toolName}`);
   *   }
   * }
   * ```
   */
  async *streamPrompt(params: PromptParams): AsyncGenerator<SDKEvent> {
    await this.ensureStarted();

    // Process AGENTS.md if provided in prompt params
    let processedParams = params;
    if (params.agentsMd !== undefined) {
      const cwd = this.config.cwd ?? process.cwd();
      const agentsMdData = await processAgentsMdConfig(params.agentsMd, cwd);
      if (agentsMdData !== undefined) {
        processedParams = addAgentsMdToPrompt(params, agentsMdData);
      }
    }

    const releasePrompt = await this.acquirePrompt();
    const eventCancellation = new AbortController();
    // Register before sending the prompt and ignore historical backlog. This
    // prevents a delayed terminal event from an earlier turn from completing
    // the new prompt while still preserving backlog behavior for public
    // `events()` subscribers.
    const events = this.client.events(eventCancellation.signal, false);
    let nextEvent = events.next();
    let promptSettled = false;
    let promptError: unknown;
    let terminalEventSeen = false;
    const promptCompletion = this.client.prompt(processedParams)
      .then(() => {
        promptSettled = true;
      })
      .catch((error: unknown) => {
        promptSettled = true;
        promptError = error;
      });

    try {
      // Stream events
      while (true) {
        if (promptError !== undefined) {
          throw promptError;
        }

        const result = promptSettled
          ? { type: 'event' as const, value: await nextEvent }
          : await Promise.race([
            nextEvent.then((value) => ({ type: 'event' as const, value })),
            promptCompletion.then(() => ({ type: 'prompt' as const })),
          ]);

        if (result.type === 'prompt') {
          if (promptError !== undefined) {
            throw promptError;
          }
          continue;
        }

        if (result.value.done === true) {
          break;
        }

        const event = result.value.value;
        if (event.type === 'agent_end') {
          terminalEventSeen = true;
        }
        yield event;

        // Stop streaming when agent ends
        if (event.type === 'agent_end') {
          break;
        }
        nextEvent = events.next();
      }
    } finally {
      const abandoned = !terminalEventSeen && promptError === undefined;
      if (abandoned) {
        await this.settleAbandonedPrompt(events);
      }
      await promptCompletion;
      eventCancellation.abort();
      void events.return(undefined).catch(() => undefined);
      releasePrompt();
    }
    if (promptError !== undefined) {
      throw promptError;
    }
  }

  private async settleAbandonedPrompt(events: AsyncGenerator<SDKEvent>): Promise<void> {
    const cleanup = (async (): Promise<boolean> => {
      try {
        await this.client.abort({});
      } catch {
        return false;
      }

      let terminalEventSeen = false;
      while (!terminalEventSeen) {
        const result = await events.next();
        if (result.done === true) return false;
        terminalEventSeen = result.value.type === 'agent_end';
      }
      return true;
    })();

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<null>((resolve) => {
      timeout = setTimeout(resolve, AutohandSDK.PROMPT_CLEANUP_TIMEOUT_MS, null);
    });
    const settled = await Promise.race([cleanup, deadline]);
    if (timeout !== undefined) clearTimeout(timeout);
    if (settled !== true) {
      await this.stop().catch(() => undefined);
      await cleanup.catch(() => false);
    }
  }

  private async acquirePrompt(): Promise<() => void> {
    const previous = this.promptTail;
    let release = (): void => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.promptTail = previous.then(() => current);
    await previous;
    return release;
  }

  async *streamCommand(
    command: SlashCommand,
    args?: SlashCommandArguments
  ): AsyncGenerator<SDKEvent> {
    yield* this.streamPrompt({ message: formatSlashCommand(command, args) });
  }

  /**
   * Stream input messages for multi-turn conversations
   * 
   * Processes a stream of prompts sequentially, yielding events for each.
   * Useful for chat interfaces or conversational workflows.
   * 
   * @param stream - Async iterable of prompt parameters
   * @returns Async generator yielding SDK events from all prompts
   * 
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * const prompts = [
   *   { message: 'First question' },
   *   { message: 'Follow-up question' },
   * ];
   * 
   * for await (const event of sdk.streamInput(prompts)) {
   *   console.log(event);
   * }
   * ```
   */
  async *streamInput(stream: AsyncIterable<PromptParams>): AsyncGenerator<SDKEvent> {
    await this.ensureStarted();

    for await (const params of stream) {
      for await (const event of this.streamPrompt(params)) {
        yield event;
      }
    }
  }

  // ============================================================================
  // Control Methods (like Anthropic's Query interface)
  // ============================================================================

  /**
   * Interrupt the current query execution
   * 
   * Stops the currently running agent operation. This is useful for implementing
   * cancellation in interactive applications.
   * 
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * // In a signal handler
   * process.on('SIGINT', async () => {
   *   await sdk.interrupt();
   *   await sdk.close();
   *   process.exit(0);
   * });
   * ```
   */
  async interrupt(): Promise<void> {
    await this.ensureStarted();
    await this.client.abort();
  }

  /**
   * Change the permission mode for the current session
   * 
   * Prefer CLI-3 permission modes for new code:
   * - 'interactive': ask before risky tool actions
   * - 'unrestricted': allow tool actions without prompts
   * - 'restricted': deny risky tool actions
   * - 'external': delegate decisions to the configured external callback
   *
   * Legacy aliases such as 'default' and 'bypassPermissions' are still accepted
   * for compatibility. Plan mode is separate; use setPlanMode instead.
   * 
   * @param mode - The permission mode to set
   * 
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * await sdk.setPermissionMode('interactive');
   * ```
   */
  async setPermissionMode(mode: SDKConfig['permissionMode']): Promise<void> {
    await this.ensureStarted();
    if (mode === 'plan') {
      await this.client.setPlanMode(true);
    } else {
      await this.client.setPermissionMode(mode ?? 'default');
    }
    if (mode !== undefined) {
      this.config.permissionMode = mode;
    }
  }

  /**
   * Enable or disable CLI-3 plan mode for the current session.
   *
   * Plan mode is a separate execution guard, not a permission mode. When enabled,
   * the CLI restricts the agent to read-only planning tools so it can inspect,
   * reason, and produce an implementation plan before any write operation.
   *
   * @param enabled - Whether plan mode should be active
   *
   * @throws {Error} If the SDK is not started
   *
   * @example
   * ```typescript
   * await sdk.setPlanMode(true);
   * for await (const event of sdk.streamPrompt({ message: 'Plan this refactor' })) {
   *   // Inspect the plan before disabling plan mode and executing.
   * }
   * ```
   */
  async setPlanMode(enabled: boolean): Promise<void> {
    await this.ensureStarted();
    await this.client.setPlanMode(enabled);
    this.config.planMode = enabled;
  }

  /**
   * Enable CLI-3 plan mode.
   *
   * @see setPlanMode
   */
  async enablePlanMode(): Promise<void> {
    await this.setPlanMode(true);
  }

  /**
   * Disable CLI-3 plan mode.
   *
   * @see setPlanMode
   */
  async disablePlanMode(): Promise<void> {
    await this.setPlanMode(false);
  }

  /**
   * Change the model used for subsequent responses
   * 
   * Dynamically switches the model for the current session. This allows you to
   * use different models for different tasks without restarting the SDK.
   * 
   * @param model - The model identifier (e.g., 'openrouter/auto')
   * 
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * await sdk.setModel('openrouter/auto');
   * ```
   */
  async setModel(model?: string): Promise<void> {
    await this.ensureStarted();
    await this.client.setModel(model);
    if (model !== undefined) {
      this.config.model = model;
    }
  }

  /**
   * Set the maximum number of thinking tokens
   * 
   * Controls the budget for the model's internal reasoning/thinking process.
   * Set to null to disable thinking.
   * 
   * @param maxThinkingTokens - Maximum tokens for thinking, or null to disable
   * 
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * await sdk.setMaxThinkingTokens(200000); // 200K tokens
   * await sdk.setMaxThinkingTokens(null); // Disable thinking
   * ```
   */
  async setMaxThinkingTokens(maxThinkingTokens: number | null): Promise<void> {
    await this.ensureStarted();
    await this.client.setMaxThinkingTokens(maxThinkingTokens);
    if (maxThinkingTokens === null) {
      this.config.thinking = 'none';
    } else {
      this.config.thinking = { type: 'enabled', budgetTokens: maxThinkingTokens };
    }
  }

  /**
   * Merge settings into the flag settings layer
   * 
   * Applies configuration changes at runtime by merging them into the
   * CLI's flag settings. This is useful for dynamic configuration updates.
   * 
   * @param settings - Partial configuration to apply
   * 
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * await sdk.applyFlagSettings({
   *   maxBudgetUsd: 10.0,
   *   maxTurns: 50,
   * });
   * ```
   */
  async applyFlagSettings(settings: Partial<SDKConfig>): Promise<void> {
    await this.ensureStarted();
    await this.client.applyFlagSettings(settings);
    Object.assign(this.config, settings);
  }

  // ============================================================================
  // Information Methods
  // ============================================================================

  /**
   * Get the full initialization result
   * 
   * Returns session information including session ID, model, and workspace.
   * 
   * @returns Object containing session initialization data
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * const init = await sdk.initializationResult();
   * console.log(`Session: ${init.sessionId}`);
   * console.log(`Model: ${init.model}`);
   * console.log(`Workspace: ${init.workspace}`);
   * ```
   */
  async initializationResult(): Promise<{
    sessionId: string | null;
    model: string;
    workspace: string;
  }> {
    await this.ensureStarted();
    const state = await this.client.getState();
    return {
      sessionId: state.sessionId,
      model: state.model,
      workspace: state.workspace,
    };
  }

  /**
   * Get the list of available CLI commands
   * 
   * Returns a list of supported Autohand CLI commands.
   * 
   * @returns Array of command names
   * 
   * @example
   * ```typescript
   * const commands = await sdk.supportedCommands();
   * console.log('Available commands:', commands);
   * ```
   */
  async supportedCommands(): Promise<string[]> {
    await this.ensureStarted();
    const result = await this.client.getSupportedCommands();
    const commands = (result as { commands?: unknown }).commands;
    if (!Array.isArray(commands)) return [];
    return commands
      .filter((command): command is string => typeof command === 'string')
      .map((command) => command.startsWith('/') ? command : `/${command}`);
  }

  async supportsCommand(command: SlashCommand): Promise<boolean> {
    return (await this.supportedCommands()).includes(command);
  }

  /** Start or resume a persisted auto-research experiment loop. */
  async startAutoresearch(params: AutoresearchStartParams): Promise<AutoresearchStartResult> {
    await this.ensureStarted();
    return this.client.startAutoresearch(params);
  }

  /** Read the current persisted auto-research state and run count. */
  async getAutoresearchStatus(): Promise<AutoresearchStatusResult> {
    await this.ensureStarted();
    return this.client.getAutoresearchStatus();
  }

  /** Pause the current auto-research loop without deleting `.auto/` state. */
  async stopAutoresearch(): Promise<AutoresearchStopResult> {
    await this.ensureStarted();
    return this.client.stopAutoresearch();
  }

  /** List persisted autoresearch attempts and their replayability and materialization state. */
  async getAutoresearchHistory(): Promise<AutoresearchHistoryResult> {
    await this.ensureStarted();
    return this.client.getAutoresearchHistory();
  }

  /** Replay a persisted candidate in an isolated worktree. */
  async replayAutoresearch(params: AutoresearchReplayParams): Promise<AutoresearchReplayResult> {
    await this.ensureStarted();
    return this.client.replayAutoresearch(params);
  }

  /** Reapply the current decision policy to persisted measurements without benchmarking. */
  async rescoreAutoresearch(params: AutoresearchRescoreParams): Promise<AutoresearchRescoreResult> {
    await this.ensureStarted();
    return this.client.rescoreAutoresearch(params);
  }

  /** Compare persisted measurements and decisions for two attempts. */
  async compareAutoresearch(params: AutoresearchCompareParams): Promise<AutoresearchCompareResult> {
    await this.ensureStarted();
    return this.client.compareAutoresearch(params);
  }

  /** List the current constraint-passing Pareto frontier. */
  async getAutoresearchPareto(): Promise<AutoresearchParetoResult> {
    await this.ensureStarted();
    return this.client.getAutoresearchPareto();
  }

  /** Pin or unpin a candidate's replay artifacts. */
  async pinAutoresearch(params: AutoresearchPinParams): Promise<AutoresearchPinResult> {
    await this.ensureStarted();
    return this.client.pinAutoresearch(params);
  }

  /** Preview artifact pruning unless explicit confirmation is provided. */
  async pruneAutoresearch(params: AutoresearchPruneParams = {}): Promise<AutoresearchPruneResult> {
    await this.ensureStarted();
    return this.client.pruneAutoresearch(params);
  }

  async getGoal(): Promise<GoalSnapshotResult> {
    await this.ensureStarted();
    return this.client.getGoal();
  }

  async createGoal(params: CreateGoalParams): Promise<GoalMutationRpcResult> {
    await this.ensureStarted();
    return this.client.createGoal(params);
  }

  async updateGoal(params: UpdateGoalParams): Promise<GoalMutationRpcResult> {
    await this.ensureStarted();
    return this.client.updateGoal(params);
  }

  async clearGoal(): Promise<GoalMutationRpcResult> {
    await this.ensureStarted();
    return this.client.clearGoal();
  }

  async queueGoal(params: QueueGoalParams): Promise<GoalMutationRpcResult> {
    await this.ensureStarted();
    return this.client.queueGoal(params);
  }

  async startQueuedGoal(): Promise<GoalMutationRpcResult> {
    await this.ensureStarted();
    return this.client.startQueuedGoal();
  }

  async listGoalTemplates(): Promise<GoalTemplatesResult> {
    await this.ensureStarted();
    return this.client.listGoalTemplates();
  }

  /**
   * Get the list of available models
   * 
   * Queries the CLI for the list of supported AI models.
   * 
   * @returns Array of model information objects
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * const models = await sdk.supportedModels();
   * for (const model of models) {
   *   console.log(`${model.id}: ${model.displayName}`);
   * }
   * ```
   */
  async supportedModels(): Promise<ModelInfo[]> {
    await this.ensureStarted();
    const result = await this.client.getSupportedModels();
    return (result as { models?: ModelInfo[] }).models ?? [];
  }

  /**
   * Get the list of available subagents
   * 
   * Returns information about available specialized subagents.
   * 
   * @returns Array of agent information objects
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * const agents = await sdk.supportedAgents();
   * for (const agent of agents) {
   *   console.log(`${agent.name}: ${agent.description}`);
   * }
   * ```
   */
  async supportedAgents(): Promise<AgentInfo[]> {
    // TODO: Implement RPC method to get supported agents
    return [];
  }

  /**
   * Get the current status of all configured MCP servers
   * 
   * Returns status information for Model Context Protocol servers.
   * 
   * @returns Array of MCP server status objects
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * const status = await sdk.mcpServerStatus();
   * console.log('MCP servers:', status);
   * ```
   */
  async mcpServerStatus(): Promise<McpListServersResult['servers']> {
    return (await this.listMcpServers()).servers;
  }

  /**
   * Get a breakdown of current context window usage
   * 
   * Returns detailed information about how the context window is being used,
   * including system prompt, tools, messages, and memory files.
   * 
   * @returns Context usage breakdown
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * const usage = await sdk.getContextUsage();
   * console.log(`Total context: ${usage.total} tokens`);
   * console.log(`System prompt: ${usage.systemPrompt} tokens`);
   * ```
   */
  async getContextUsage(): Promise<ContextUsage> {
    await this.ensureStarted();
    const result = await this.client.getContextUsage();
    return result as ContextUsage;
  }

  /**
   * Reload plugins from disk
   * 
   * Forces the CLI to reload all plugins from the filesystem.
   * 
   * @returns Reload result
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * await sdk.reloadPlugins();
   * ```
   */
  async reloadPlugins(): Promise<unknown> {
    await this.ensureStarted();
    return await this.client.reloadPlugins();
  }

  /**
   * Get information about the authenticated account
   * 
   * Returns account details including email, organization, and subscription type.
   * 
   * @returns Account information
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * const account = await sdk.accountInfo();
   * console.log(`Email: ${account.email}`);
   * console.log(`Organization: ${account.organization}`);
   * ```
   */
  async accountInfo(): Promise<AccountInfo> {
    await this.ensureStarted();
    const result = await this.client.getAccountInfo();
    return result as AccountInfo;
  }

  /** Query the CLI community-skill registry. */
  async getSkillsRegistry(
    params: GetSkillsRegistryParams = {}
  ): Promise<GetSkillsRegistryResult> {
    await this.ensureStarted();
    return this.client.getSkillsRegistry(params);
  }

  /** Install a registry skill into the requested scope. */
  async installSkill(params: InstallSkillParams): Promise<InstallSkillResult> {
    await this.ensureStarted();
    return this.client.installSkill(params);
  }

  // ============================================================================
  // MCP Server Management
  // ============================================================================

  /** List configured MCP servers and their current connection state. */
  async listMcpServers(): Promise<McpListServersResult> {
    await this.ensureStarted();
    return this.client.listMcpServers();
  }

  /** List available MCP tools, optionally filtering by server name. */
  async listMcpTools(params: McpListToolsParams = {}): Promise<McpListToolsResult> {
    await this.ensureStarted();
    return this.client.listMcpTools(params);
  }

  /** Read the persisted MCP configurations known to the CLI. */
  async getMcpServerConfigs(): Promise<McpGetServerConfigsResult> {
    await this.ensureStarted();
    return this.client.getMcpServerConfigs();
  }

  /**
   * Reconnect an MCP server by name
   * 
   * Forces a reconnection attempt for a specific Model Context Protocol server.
   * 
   * @param serverName - The name of the MCP server to reconnect
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * await sdk.reconnectMcpServer('filesystem');
   * ```
   */
  async reconnectMcpServer(serverName: string): Promise<void> {
    await this.ensureStarted();
    await this.client.reconnectMcpServer(serverName);
  }

  /**
   * Enable or disable an MCP server by name
   * 
   * Toggles the active state of a specific Model Context Protocol server.
   * 
   * @param serverName - The name of the MCP server
   * @param enabled - Whether to enable (true) or disable (false) the server
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * await sdk.toggleMcpServer('filesystem', false); // Disable
   * await sdk.toggleMcpServer('filesystem', true);  // Enable
   * ```
   */
  async toggleMcpServer(serverName: string, enabled: boolean): Promise<void> {
    await this.ensureStarted();
    await this.client.toggleMcpServer(serverName, enabled);
  }

  /**
   * Dynamically set the MCP servers for this session
   * 
   * Replaces the current MCP server configuration with a new set of servers.
   * 
   * @param servers - Object mapping server names to their configurations
   * @returns Configuration result
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * await sdk.setMcpServers({
   *   filesystem: {
   *     transport: 'stdio',
     *     command: 'npx',
   *     args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/files']
   *   }
   * });
   * ```
   */
  async setMcpServers(servers: Record<string, McpServerConfig>): Promise<unknown> {
    await this.ensureStarted();
    return await this.client.setMcpServers(servers);
  }

  // ============================================================================
  // File Checkpointing
  // ============================================================================

  /**
   * Rewind tracked files to their state at a specific user message
   * 
   * Reverts file modifications to a previous point in the conversation history.
   * 
   * @param userMessageId - The ID of the user message to rewind to
   * @param options - Optional configuration
   * @param options.dryRun - If true, only check if rewind is possible without performing it
   * @returns Rewind result indicating success or failure
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * const result = await sdk.rewindFiles('msg-123', { dryRun: true });
   * if (result.canRewind) {
   *   await sdk.rewindFiles('msg-123'); // Perform the rewind
   * }
   * ```
   */
  async rewindFiles(_userMessageId: string, _options?: { dryRun?: boolean }): Promise<{
    canRewind: boolean;
    error?: string;
  }> {
    // TODO: Implement RPC method to rewind files
    return {
      canRewind: false,
      error: 'Not implemented yet',
    };
  }

  /**
   * Seed the CLI's readFileState cache
   * 
   * Pre-populates the file read cache with a specific file's modification time.
   * 
   * @param _path - File path to seed
   * @param _mtime - Modification time in milliseconds
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * await sdk.seedReadState('/path/to/file.ts', Date.now());
   * ```
   */
  async seedReadState(_path: string, _mtime: number): Promise<void> {
    // TODO: Implement RPC method to seed read state
  }

  // ============================================================================
  // State and Messages
  // ============================================================================

  /**
   * Abort the current operation (alias for interrupt)
   * 
   * @see interrupt
   */
  async abort(): Promise<void> {
    return this.interrupt();
  }

  /**
   * Reset the current conversation and return the new session ID.
   */
  async reset(): Promise<ResetResult> {
    await this.ensureStarted();
    return this.client.reset();
  }

  /**
   * Get the current state
   * 
   * Returns the current state of the agent including status, session ID,
   * model, workspace, context usage, and message count.
   * 
   * @param params - Optional parameters for the state query
   * @returns Current agent state
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * const state = await sdk.getState();
   * console.log(`Status: ${state.status}`);
   * console.log(`Session: ${state.sessionId}`);
   * console.log(`Context: ${state.contextPercent}%`);
   * ```
   */
  async getState(params?: GetStateParams): Promise<GetStateResult> {
    await this.ensureStarted();
    return this.client.getState(params);
  }

  /**
   * Get conversation messages
   * 
   * Retrieves the message history for the current session.
   * 
   * @param params - Optional parameters including message limit
   * @returns Message history with role, content, and tool call information
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * const messages = await sdk.getMessages({ limit: 10 });
   * for (const msg of messages.messages) {
   *   console.log(`${msg.role}: ${msg.content}`);
   * }
   * ```
   */
  async getMessages(params?: GetMessagesParams): Promise<GetMessagesResult> {
    await this.ensureStarted();
    return this.client.getMessages(params);
  }

  /**
   * Create a browser handoff URL for the active session.
   */
  async createBrowserHandoff(
    params: BrowserHandoffCreateParams = {}
  ): Promise<BrowserHandoffCreateResult> {
    await this.ensureStarted();
    return this.client.createBrowserHandoff(params);
  }

  /**
   * Attach the session referenced by a one-time browser handoff token.
   */
  async attachBrowserHandoff(
    params: BrowserHandoffAttachParams
  ): Promise<BrowserHandoffAttachResult> {
    await this.ensureStarted();
    return this.client.attachBrowserHandoff(params);
  }

  /**
   * Attach the newest unexpired browser handoff.
   */
  async attachLatestBrowserHandoff(): Promise<BrowserHandoffAttachResult> {
    await this.ensureStarted();
    return this.client.attachLatestBrowserHandoff();
  }

  /**
   * Start an autonomous auto-mode session.
   */
  async startAutomode(params: AutomodeStartParams): Promise<AutomodeStartResult> {
    await this.ensureStarted();
    return this.client.startAutomode(params);
  }

  /**
   * Get the current auto-mode runtime and persisted state.
   */
  async getAutomodeStatus(): Promise<AutomodeStatusResult> {
    await this.ensureStarted();
    return this.client.getAutomodeStatus();
  }

  /**
   * Pause the active auto-mode session.
   */
  async pauseAutomode(): Promise<AutomodeOperationResult> {
    await this.ensureStarted();
    return this.client.pauseAutomode();
  }

  // ============================================================================
  // Permission Handling
  // ============================================================================

  /**
   * Respond to a permission request
   * 
   * When the agent requests permission to execute a tool, use this method
   * to approve or deny the request.
   * 
   * @param params - Permission response parameters
   * @param params.requestId - The ID of the permission request
   * @param params.decision - CLI-3 permission decision
   * @param params.allowed - Boolean approval (legacy alternative to decision)
   * @param params.alternative - Alternative tool or command to run
   * @param params.remember - Maps legacy allow/deny decisions to session scope
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * await sdk.permissionResponse({
   *   requestId: 'req-123',
   *   decision: 'allow_session'
   * });
   * ```
   */
  async permissionResponse(params: PermissionResponseParams): Promise<void> {
    await this.ensureStarted();
    await this.client.permissionResponse(params);
  }

  /**
   * Allow a pending permission request.
   *
   * @param requestId - Permission request ID from a permission_request event
   * @param scope - How long the decision should apply
   *
   * @example
   * ```typescript
   * await sdk.allowPermission(event.requestId, 'session');
   * ```
   */
  async allowPermission(
    requestId: string,
    scope: PermissionDecisionScope = 'once'
  ): Promise<void> {
    await this.permissionResponse({
      requestId,
      decision: allowDecision(scope),
    });
  }

  /**
   * Deny a pending permission request.
   *
   * @param requestId - Permission request ID from a permission_request event
   * @param scope - How long the decision should apply
   */
  async denyPermission(
    requestId: string,
    scope: PermissionDecisionScope = 'once'
  ): Promise<void> {
    await this.permissionResponse({
      requestId,
      decision: denyDecision(scope),
    });
  }

  /**
   * Respond to a permission request with a safer alternative action.
   */
  async suggestPermissionAlternative(
    requestId: string,
    alternative: string
  ): Promise<void> {
    await this.permissionResponse({
      requestId,
      decision: 'alternative',
      alternative,
    });
  }

  // ============================================================================
  // Event Streaming
  // ============================================================================

  /**
   * Subscribe to all events
   * 
   * Returns an async generator that yields all SDK events as they occur.
   * This includes agent lifecycle events, message updates, tool calls,
   * permission requests, and errors.
   * 
   * @returns Async generator yielding SDK events
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * for await (const event of sdk.events()) {
   *   switch (event.type) {
   *     case 'agent_start':
   *       console.log('Agent started');
   *       break;
   *     case 'message_update':
   *       process.stdout.write(event.delta);
   *       break;
   *     case 'tool_start':
   *       console.log(`Tool: ${event.toolName}`);
   *       break;
   *   }
   * }
   * ```
   */
  async *events(): AsyncGenerator<SDKEvent> {
    await this.ensureStarted();
    for await (const event of this.client.events()) {
      yield event;
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Check if the SDK is started
   * 
   * @returns true if the SDK has been started and the CLI process is running
   * 
   * @example
   * ```typescript
   * if (!sdk.isStarted()) {
   *   await sdk.start();
   * }
   * ```
   */
  isStarted(): boolean {
    return this.started && this.client.isConnected();
  }

  /**
   * Check if the SDK is connected
   * 
   * @returns true if the CLI process is running and responsive
   * 
   * @example
   * ```typescript
   * if (sdk.isConnected()) {
   *   console.log('SDK is connected');
   * }
   * ```
   */
  isConnected(): boolean {
    return this.client.isConnected();
  }

  /**
   * Get the current configuration
   * 
   * Returns a copy of the current SDK configuration.
   * 
   * @returns Current configuration object
   * 
   * @example
   * ```typescript
   * const config = sdk.getConfig();
   * console.log(`Model: ${config.model}`);
   * console.log(`Debug: ${config.debug}`);
   * ```
   */
  getConfig(): SDKConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration
   * 
   * Merges the provided configuration into the current configuration.
   * 
   * @param config - Partial configuration to merge
   * 
   * @example
   * ```typescript
   * sdk.updateConfig({
   *   debug: true,
   *   model: 'openrouter/auto'
   * });
   * ```
   */
  updateConfig(config: Partial<SDKConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.started) {
      this.rebuildClient();
    }
  }

  // ============================================================================
  // Stats Methods
  // ============================================================================

  /**
   * Get session statistics
   * 
   * Returns statistics about the current session including cost, tokens used,
   * request count, tool calls, and duration.
   * 
   * @returns Session statistics
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * const stats = await sdk.getStats();
   * console.log(`Total cost: $${stats.totalCost.toFixed(2)}`);
   * console.log(`Total tokens: ${stats.totalTokens}`);
   * console.log(`Duration: ${stats.duration}s`);
   * ```
   */
  async getStats(): Promise<SessionStats> {
    await this.ensureStarted();
    const state = await this.client.getState();
    const now = new Date().toISOString();
    const stats: SessionStats = {
      totalCost: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      requestCount: state.messageCount ?? 0,
      duration: 0,
      toolCallCount: 0,
      startedAt: now,
    };
    return stats;
  }

  // ============================================================================
  // Session Management Methods
  // ============================================================================

  /**
   * Get session metadata
   * 
   * Returns metadata about the current session including session ID,
   * project information, and status.
   * 
   * @returns Session metadata
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * const metadata = await sdk.getSessionMetadata();
   * console.log(`Session ID: ${metadata.sessionId}`);
   * console.log(`Project: ${metadata.projectName}`);
   * console.log(`Status: ${metadata.status}`);
   * ```
   */
  async getSessionMetadata(): Promise<SessionMetadata> {
    await this.ensureStarted();
    const state = await this.client.getState();
    const now = new Date().toISOString();
    const metadata: SessionMetadata = {
      sessionId: state.sessionId ?? 'unknown',
      createdAt: now,
      lastActiveAt: now,
      projectPath: state.workspace ?? process.cwd(),
      projectName: 'Unknown',
      model: state.model ?? this.config.model ?? 'unknown',
      messageCount: state.messageCount ?? 0,
      status: state.status === 'idle' ? 'completed' : 'active',
    };
    return metadata;
  }

  /**
   * Resume a previous session
   * 
   * Resumes the SDK from a previous session using the session ID.
   * This allows you to continue where you left off.
   * 
   * @param sessionId - The session ID to resume
   * @throws {Error} If the SDK is already started or session not found
   * 
   * @example
   * ```typescript
   * const sdk = new AutohandSDK();
   * await sdk.resumeSession('session-abc123');
   * ```
   */
  async resumeSession(sessionId: string): Promise<void> {
    if (this.started) {
      throw new Error('SDK is already started. Cannot resume session.');
    }
    this.config.sessionId = sessionId;
    this.config.resume = true;
    await this.start();
  }

  /**
   * Save current session
   * 
   * Manually saves the current session state to disk.
   * This is useful if you want to create a checkpoint before a risky operation.
   * 
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * await sdk.saveSession();
   * console.log('Session saved');
   * ```
   */
  async saveSession(): Promise<void> {
    await this.ensureStarted();
    await this.client.request('autohand.saveSession', {});
  }

  // ============================================================================
  // Hooks Management Methods
  // ============================================================================

  /**
   * Get all hooks and settings
   *
   * Returns the current hooks configuration including all hook definitions
   * and the global enabled status.
   *
   * @returns Hooks settings with all definitions
   * @throws {Error} If the SDK is not started
   *
   * @example
   * ```typescript
   * const hooks = await sdk.getHooks();
   * console.log(`Hooks enabled: ${hooks.settings.enabled}`);
   * console.log(`Total hooks: ${hooks.settings.hooks?.length ?? 0}`);
   * ```
   */
  async getHooks(): Promise<GetHooksResult> {
    await this.ensureStarted();
    return this.client.getHooks();
  }

  /**
   * Add a new hook
   *
   * Registers a new lifecycle hook that executes shell commands at specific
   * events. Hooks receive context via environment variables and JSON stdin.
   *
   * @param hook - Hook definition to add
   * @returns Result with success status and hook ID
   * @throws {Error} If the SDK is not started
   *
   * @example
   * ```typescript
   * await sdk.addHook({
   *   event: 'pre-tool',
   *   command: 'echo "About to run tool"',
   *   description: 'Log before tool execution',
   *   filter: { tool: ['write_file', 'edit_file'] }
   * });
   * ```
   */
  async addHook(hook: HookDefinition): Promise<AddHookResult> {
    await this.ensureStarted();
    return this.client.addHook({ hook });
  }

  /**
   * Remove a hook by event and index
   *
   * Removes a hook from the configuration. Hooks are indexed within their
   * event type (e.g., the 0th 'pre-tool' hook).
   *
   * @param event - The event type of the hook to remove
   * @param index - The index of the hook within that event type
   * @returns Result indicating success
   * @throws {Error} If the SDK is not started
   *
   * @example
   * ```typescript
   * await sdk.removeHook('pre-tool', 0);
   * ```
   */
  async removeHook(event: HookEvent, index: number): Promise<RemoveHookResult> {
    await this.ensureStarted();
    return this.client.removeHook({ event, index });
  }

  /**
   * Toggle a hook's enabled status
   *
   * Toggles a hook between enabled and disabled without removing it.
   * Disabled hooks remain in the configuration but won't execute.
   *
   * @param event - The event type of the hook to toggle
   * @param index - The index of the hook within that event type
   * @returns Result with new enabled status
   * @throws {Error} If the SDK is not started
   *
   * @example
   * ```typescript
   * const result = await sdk.toggleHook('pre-tool', 0);
   * console.log(`Hook is now ${result.enabled ? 'enabled' : 'disabled'}`);
   * ```
   */
  async toggleHook(event: HookEvent, index: number): Promise<ToggleHookResult> {
    await this.ensureStarted();
    return this.client.toggleHook({ event, index });
  }

  /**
   * Test a hook with sample context
   *
   * Executes a hook with a test context to verify it works correctly.
   * Useful for debugging hook commands before adding them.
   *
   * @param hook - Hook definition to test
   * @returns Execution result including stdout, stderr, and response
   * @throws {Error} If the SDK is not started
   *
   * @example
   * ```typescript
   * const result = await sdk.testHook({
   *   event: 'pre-tool',
   *   command: 'echo "Test"'
   * });
   * console.log(`Exit code: ${result.exitCode}`);
   * console.log(`Stdout: ${result.stdout}`);
   * ```
   */
  async testHook(hook: HookDefinition): Promise<TestHookResult> {
    await this.ensureStarted();
    return this.client.testHook({ hook });
  }

  /**
   * Update hooks settings
   *
   * Updates the global hooks configuration including enabled status
   * and hook definitions.
   *
   * @param settings - Partial hooks settings to update
   * @throws {Error} If the SDK is not started
   *
   * @example
   * ```typescript
   * await sdk.setHooksSettings({
   *   enabled: true,
   *   hooks: [
   *     { event: 'session-start', command: 'echo "Session started"' }
   *   ]
   * });
   * ```
   */
  async setHooksSettings(settings: Partial<HooksSettings>): Promise<void> {
    await this.ensureStarted();
    await this.client.request('autohand.hooks.setSettings', { settings });
    this.config.hooks = { ...this.config.hooks, ...settings };
  }

  // ============================================================================
  // AGENTS.md Methods
  // ============================================================================

  /**
   * Load AGENTS.md from a file or URL
   * 
   * Loads AGENTS.md content from various sources:
   * - Relative paths (e.g., './AGENTS.md', 'AGENTS.md')
   * - Absolute paths (e.g., '/path/to/AGENTS.md')
   * - file:/// URLs (e.g., 'file:///path/to/AGENTS.md')
   * - https:// URLs (e.g., 'https://example.com/AGENTS.md')
   * 
   * @param source - The source path or URL
   * @returns The content of AGENTS.md
   * 
   * @example
   * ```typescript
   * // Load from local file
   * const content = await sdk.loadAgentsMd('./AGENTS.md');
   * 
   * // Load from URL
   * const content = await sdk.loadAgentsMd('https://example.com/AGENTS.md');
   * 
   * // Load from file:// URL
   * const content = await sdk.loadAgentsMd('file:///path/to/AGENTS.md');
   * ```
   */
  async loadAgentsMd(source: string): Promise<string> {
    return loadAgentsMd(source);
  }

  /**
   * Create a default AGENTS.md template
   * 
   * Creates a default AGENTS.md template with sections for tech stack,
   * commands, conventions, and skills.
   * 
   * @param projectName - Optional project name to include in the template
   * @returns The default AGENTS.md content
   * 
   * @example
   * ```typescript
   * const template = sdk.createDefaultAgentsMd('My Project');
   * console.log(template);
   * ```
   */
  createDefaultAgentsMd(projectName?: string): string {
    return createDefaultAgentsMd(projectName);
  }

  /**
   * Set AGENTS.md content as system prompt
   * 
   * Loads AGENTS.md from a source and sets it as the system prompt.
   * This is a convenience method that combines loadAgentsMd and setSystemPrompt.
   * 
   * @param source - The source path or URL
   * @throws {Error} If the source cannot be loaded
   * 
   * @example
   * ```typescript
   * await sdk.setAgentsMdAsPrompt('./AGENTS.md');
   * ```
   */
  async setAgentsMdAsPrompt(source: string): Promise<void> {
    const content = await this.loadAgentsMd(source);
    this.setSystemPrompt(content);
  }

  /**
   * Ensure the SDK is started before operations
   * 
   * Automatically starts the SDK if it's not already running.
   * This is called internally by all methods that require the SDK to be started.
   * 
   * @private
   */
  private async ensureStarted(): Promise<void> {
    if (!this.started || !this.client.isConnected()) {
      await this.start();
    }
  }
}
