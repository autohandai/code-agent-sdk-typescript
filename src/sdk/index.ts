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
 *   model: 'claude-sonnet-4-20250514',
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
  PermissionResponseParams,
  SDKEvent,
  ModelInfo,
  AgentInfo,
  ContextUsage,
  AccountInfo,
  McpServerConfig,
  SessionStats,
  SessionMetadata,
} from '../types/index.js';
import { Tool, loadAgentsMd, createDefaultAgentsMd } from '../types/index.js';

export class AutohandSDK {
  private client: RPCClient;
  private started: boolean = false;
  private _tools: Tool[] = [];

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
   * @param config.systemPrompt - System prompt (inline string or file path)
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
    if (this.started) {
      return;
    }

    await this.client.start();
    this.started = true;
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
    if (!this.started) {
      return;
    }

    await this.client.stop();
    this.started = false;
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
    await this.ensureStarted();
    await this.client.prompt(params);
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

    // Start the prompt in the background
    this.client.prompt(params).catch((error) => {
      console.error('Prompt failed:', error);
    });

    // Stream events
    for await (const event of this.client.events()) {
      yield event;

      // Stop streaming when agent ends
      if (event.type === 'agent_end') {
        break;
      }
    }
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
   * Permission modes control how the agent handles tool execution requests:
   * - 'default': Ask for permission for each tool
   * - 'acceptEdits': Auto-accept file edits
   * - 'bypassPermissions': Run all tools without asking
   * - 'plan': Plan mode for complex tasks
   * - 'dontAsk': Never ask for permission
   * - 'auto': Automatically approve based on heuristics
   * 
   * @param mode - The permission mode to set
   * 
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * await sdk.setPermissionMode('bypassPermissions');
   * ```
   */
  async setPermissionMode(mode: SDKConfig['permissionMode']): Promise<void> {
    await this.ensureStarted();
    await this.client.setPermissionMode(mode ?? 'default');
    if (mode !== undefined) {
      this.config.permissionMode = mode;
    }
  }

  /**
   * Change the model used for subsequent responses
   * 
   * Dynamically switches the model for the current session. This allows you to
   * use different models for different tasks without restarting the SDK.
   * 
   * @param model - The model identifier (e.g., 'claude-sonnet-4-20250514')
   * 
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * await sdk.setModel('claude-opus-4-20250514');
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
    // TODO: Implement RPC method to get supported commands
    return [
      'help', 'new', 'model', 'resume', 'sessions', 'session',
      'status', 'undo', 'init', 'memory', 'skills', 'export',
      'permissions', 'feedback', 'agents', 'hooks', 'automode',
    ];
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
  async mcpServerStatus(): Promise<unknown[]> {
    await this.ensureStarted();
    // TODO: Implement RPC method to get MCP server status
    return [];
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

  // ============================================================================
  // MCP Server Management
  // ============================================================================

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
   * @param params.decision - Whether to allow, deny, or provide an alternative
   * @param params.allowed - Boolean approval (alternative to decision)
   * @param params.alternative - Alternative tool or command to run
   * @param params.remember - Whether to remember this decision for future requests
   * @throws {Error} If the SDK is not started
   * 
   * @example
   * ```typescript
   * await sdk.permissionResponse({
   *   requestId: 'req-123',
   *   decision: 'allow',
   *   remember: true
   * });
   * ```
   */
  async permissionResponse(params: PermissionResponseParams): Promise<void> {
    await this.ensureStarted();
    await this.client.permissionResponse(params);
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
    return this.started;
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
   *   model: 'claude-opus-4-20250514'
   * });
   * ```
   */
  updateConfig(config: Partial<SDKConfig>): void {
    this.config = { ...this.config, ...config };
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
      outhutTokens: 0,
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
    this.config.sysPrompt = content;
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
    if (!this.started) {
      await this.start();
    }
  }
}
