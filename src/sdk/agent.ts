import { AutohandSDK, formatSlashCommand } from './index.js';
import type {
  CreateGoalParams,
  GoalMutationRpcResult,
  GoalSnapshotResult,
  GoalTemplatesResult,
  PermissionDecisionScope,
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
  SessionAttachParams,
  SessionAttachResult,
  YoloSetParams,
  YoloSetResult,
  McpSetVscodeToolsParams,
  McpSetVscodeToolsResult,
  McpInvokeResponseParams,
  McpInvokeResponseResult,
  LearnRecommendParams,
  LearnRecommendResult,
  PermissionResponseParams,
  PromptParams,
  QueueGoalParams,
  ResetResult,
  SDKConfig,
  SDKEvent,
  SlashCommand,
  SlashCommandArguments,
  UpdateGoalParams,
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
  InstallSkillParams,
  InstallSkillResult,
  McpListServersResult,
  McpListToolsParams,
  McpListToolsResult,
  McpGetServerConfigsResult,
} from '../types/index.js';

export type AgentInput = string | PromptParams;

export type AgentSendOptions = Omit<PromptParams, 'message'>;

export interface JsonParseOptions<T> {
  /**
   * Validate and transform the parsed JSON value. Pass schema.parse from Zod or
   * any function that accepts unknown and returns T.
   */
  validate?: (value: unknown) => T;
}

export interface JsonRunOptions<T> extends AgentSendOptions, JsonParseOptions<T> {
  /**
   * Human-readable schema name included in the JSON instruction.
   */
  schemaName?: string;
  /**
   * JSON-serializable schema or example shape shown to the agent.
   */
  schema?: unknown;
  /**
   * Additional output instructions.
   */
  outputInstructions?: string;
}

export interface AgentOptions extends SDKConfig {
  /**
   * Instructions appended to the default Autohand system prompt.
   *
   * Use systemPrompt or setSystemPrompt only when replacing the full agent
   * contract is intentional.
   */
  instructions?: string;
}

export interface RunResult {
  id: string;
  status: 'completed' | 'aborted';
  text: string;
  events: SDKEvent[];
}

export class StructuredOutputError extends Error {
  readonly rawResponse: string;

  constructor(message: string, rawResponse: string) {
    super(`${message}\n\nRaw response preview:\n${previewResponse(rawResponse)}`);
    this.name = 'StructuredOutputError';
    this.rawResponse = rawResponse;
  }
}

function createRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function appendPrompt(existing: string | undefined, next: string): string {
  if (existing === undefined || existing === '') {
    return next;
  }
  return `${existing}\n\n${next}`;
}

function toSDKConfig(options: AgentOptions): SDKConfig {
  const { instructions, ...sdkConfig } = options;
  const config: SDKConfig = { ...sdkConfig };

  if (instructions !== undefined && instructions !== '') {
    if (config.appendSystemPrompt !== undefined) {
      config.appendSystemPrompt = appendPrompt(config.appendSystemPrompt, instructions);
    } else {
      config.appendSysPrompt = appendPrompt(config.appendSysPrompt, instructions);
    }
  }

  return config;
}

function toPromptParams(input: AgentInput, options?: AgentSendOptions): PromptParams {
  if (typeof input === 'string') {
    const params: PromptParams = { message: input };
    if (options?.context !== undefined) params.context = options.context;
    if (options?.images !== undefined) params.images = options.images;
    if (options?.thinkingLevel !== undefined) params.thinkingLevel = options.thinkingLevel;
    if (options?.agentsMd !== undefined) params.agentsMd = options.agentsMd;
    return params;
  }

  if (options === undefined) {
    return input;
  }

  const params: PromptParams = { ...input };
  if (options.context !== undefined) params.context = options.context;
  if (options.images !== undefined) params.images = options.images;
  if (options.thinkingLevel !== undefined) params.thinkingLevel = options.thinkingLevel;
  if (options.agentsMd !== undefined) params.agentsMd = options.agentsMd;
  return params;
}

function stringifySchema(schema: unknown): string {
  try {
    return JSON.stringify(schema, null, 2);
  } catch (error) {
    throw new Error(`JSON output schema must be serializable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function buildJsonInstruction<T>(options?: JsonRunOptions<T>): string {
  const parts = [
    'Return only valid JSON.',
    'Do not wrap the response in Markdown.',
    'Do not include commentary outside the JSON value.',
  ];

  if (options?.schemaName !== undefined && options.schemaName !== '') {
    parts.push(`The JSON value should satisfy: ${options.schemaName}.`);
  }

  if (options?.schema !== undefined) {
    parts.push(`Use this JSON schema or example shape:\n${stringifySchema(options.schema)}`);
  }

  if (options?.outputInstructions !== undefined && options.outputInstructions !== '') {
    parts.push(options.outputInstructions);
  }

  return parts.join('\n');
}

function withJsonInstruction<T>(input: AgentInput, options?: JsonRunOptions<T>): PromptParams {
  const params = toPromptParams(input, options);
  return {
    ...params,
    message: `${params.message}\n\n${buildJsonInstruction(options)}`,
  };
}

function previewResponse(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 1200) {
    return trimmed || '<empty>';
  }
  return `${trimmed.slice(0, 1200)}\n...`;
}

function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function parseFencedJson(text: string): unknown | undefined {
  const fencePattern = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  let match = fencePattern.exec(text);

  while (match !== null) {
    const candidate = match[1]?.trim();
    if (candidate !== undefined && candidate !== '') {
      const parsed = tryParseJson(candidate);
      if (parsed !== undefined) {
        return parsed;
      }
    }
    match = fencePattern.exec(text);
  }

  return undefined;
}

function findJsonSubstrings(text: string): string[] {
  const candidates: string[] = [];
  const stack: string[] = [];
  let startIndex: number | undefined;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      if (stack.length === 0) {
        startIndex = index;
      }
      stack.push(char);
      continue;
    }

    if ((char === '}' || char === ']') && stack.length > 0) {
      const opener = stack[stack.length - 1];
      const matches = (opener === '{' && char === '}') || (opener === '[' && char === ']');
      if (!matches) {
        stack.length = 0;
        startIndex = undefined;
        continue;
      }

      stack.pop();
      if (stack.length === 0 && startIndex !== undefined) {
        candidates.push(text.slice(startIndex, index + 1));
        startIndex = undefined;
      }
    }
  }

  return candidates;
}

function parseEmbeddedJson(text: string): unknown | undefined {
  for (const candidate of findJsonSubstrings(text)) {
    const parsed = tryParseJson(candidate);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

export function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === '') {
    throw new StructuredOutputError('Expected JSON output, received an empty response.', text);
  }

  const direct = tryParseJson(trimmed);
  if (direct !== undefined) {
    return direct;
  }

  const fenced = parseFencedJson(trimmed);
  if (fenced !== undefined) {
    return fenced;
  }

  const embedded = parseEmbeddedJson(trimmed);
  if (embedded !== undefined) {
    return embedded;
  }

  throw new StructuredOutputError('Expected valid JSON output from the agent.', text);
}

function parseJsonResult<T>(text: string, options?: JsonParseOptions<T>): T {
  const parsed = parseJsonText(text);
  if (options?.validate !== undefined) {
    return options.validate(parsed);
  }
  return parsed as T;
}

export class Run {
  readonly id: string;

  private eventsBuffer: SDKEvent[] = [];
  private waiters: Array<() => void> = [];
  private resultPromise: Promise<RunResult> | undefined;
  private completed = false;
  private aborted = false;
  private error: unknown;
  private text = '';

  constructor(
    private readonly sdk: AutohandSDK,
    private readonly params: PromptParams,
    id: string = createRunId()
  ) {
    this.id = id;
  }

  /**
   * Stream run events. Multiple consumers can subscribe; each receives the full
   * buffered event history followed by live events.
   */
  async *stream(): AsyncGenerator<SDKEvent> {
    this.ensureStarted();

    let index = 0;
    while (true) {
      while (index < this.eventsBuffer.length) {
        const event = this.eventsBuffer[index];
        index += 1;
        if (event !== undefined) {
          yield event;
        }
      }

      if (this.completed) {
        if (this.error !== undefined) {
          throw this.error;
        }
        return;
      }

      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
  }

  /**
   * Wait for the run to finish and return its final text and event trace.
   */
  wait(): Promise<RunResult> {
    this.ensureStarted();
    return this.resultPromise as Promise<RunResult>;
  }

  /**
   * Wait for the run and parse the final text as JSON.
   */
  async json<T = unknown>(options?: JsonParseOptions<T>): Promise<T> {
    const result = await this.wait();
    return parseJsonResult(result.text, options);
  }

  /**
   * Abort the active run.
   */
  async abort(): Promise<void> {
    this.aborted = true;
    await this.sdk.interrupt();
  }

  private ensureStarted(): void {
    if (this.resultPromise === undefined) {
      this.resultPromise = this.pump();
    }
  }

  private async pump(): Promise<RunResult> {
    try {
      for await (const event of this.sdk.streamPrompt(this.params)) {
        this.record(event);
      }
      return this.createResult();
    } catch (error) {
      this.error = error;
      throw error;
    } finally {
      this.completed = true;
      this.notify();
    }
  }

  private record(event: SDKEvent): void {
    this.eventsBuffer.push(event);

    if (event.type === 'message_update') {
      this.text += event.delta;
    } else if (event.type === 'message_end') {
      this.text = event.content;
    }

    this.notify();
  }

  private createResult(): RunResult {
    return {
      id: this.id,
      status: this.aborted ? 'aborted' : 'completed',
      text: this.text,
      events: [...this.eventsBuffer],
    };
  }

  private notify(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const resolve of waiters) {
      resolve();
    }
  }
}

export class Agent {
  private constructor(private readonly sdk: AutohandSDK) {}

  /**
   * Create and start an agent session.
   */
  static async create(options: AgentOptions = {}): Promise<Agent> {
    const sdk = new AutohandSDK(toSDKConfig(options));
    await sdk.start();
    return new Agent(sdk);
  }

  /**
   * Wrap an existing low-level SDK instance.
   */
  static fromSDK(sdk: AutohandSDK): Agent {
    return new Agent(sdk);
  }

  /**
   * Create a run without waiting for it to finish.
   */
  async send(input: AgentInput, options?: AgentSendOptions): Promise<Run> {
    return new Run(this.sdk, toPromptParams(input, options));
  }

  /**
   * Run a prompt to completion and return the final result.
   */
  async run(input: AgentInput, options?: AgentSendOptions): Promise<RunResult> {
    const run = await this.send(input, options);
    return run.wait();
  }

  async command(
    command: SlashCommand,
    args?: SlashCommandArguments,
    options?: AgentSendOptions
  ): Promise<Run> {
    return this.send(formatSlashCommand(command, args), options);
  }

  async deepResearch(topic: string, options?: AgentSendOptions): Promise<Run> {
    return this.command('/deep-research', topic, options);
  }

  async autoresearch(objective: string, options?: AgentSendOptions): Promise<Run> {
    return this.command('/autoresearch', objective, options);
  }

  async startAutoresearch(params: AutoresearchStartParams): Promise<AutoresearchStartResult> {
    return this.sdk.startAutoresearch(params);
  }

  async getAutoresearchStatus(): Promise<AutoresearchStatusResult> {
    return this.sdk.getAutoresearchStatus();
  }

  async stopAutoresearch(): Promise<AutoresearchStopResult> {
    return this.sdk.stopAutoresearch();
  }

  async getAutoresearchHistory(): Promise<AutoresearchHistoryResult> {
    return this.sdk.getAutoresearchHistory();
  }

  async replayAutoresearch(params: AutoresearchReplayParams): Promise<AutoresearchReplayResult> {
    return this.sdk.replayAutoresearch(params);
  }

  async rescoreAutoresearch(params: AutoresearchRescoreParams): Promise<AutoresearchRescoreResult> {
    return this.sdk.rescoreAutoresearch(params);
  }

  async compareAutoresearch(params: AutoresearchCompareParams): Promise<AutoresearchCompareResult> {
    return this.sdk.compareAutoresearch(params);
  }

  async getAutoresearchPareto(): Promise<AutoresearchParetoResult> {
    return this.sdk.getAutoresearchPareto();
  }

  async pinAutoresearch(params: AutoresearchPinParams): Promise<AutoresearchPinResult> {
    return this.sdk.pinAutoresearch(params);
  }

  async pruneAutoresearch(params: AutoresearchPruneParams = {}): Promise<AutoresearchPruneResult> {
    return this.sdk.pruneAutoresearch(params);
  }

  /**
   * Run a prompt to completion and parse the response as JSON.
   *
   * This is SDK-level JSON mode: it instructs the agent to return only JSON,
   * then parses and optionally validates the final response. Use validate for
   * Zod or application-specific schemas.
   */
  async runJson<T = unknown>(input: AgentInput, options?: JsonRunOptions<T>): Promise<T> {
    const run = await this.send(withJsonInstruction(input, options));
    return run.json(options);
  }

  /**
   * Stream a prompt directly without manually creating a run.
   */
  async *stream(input: AgentInput, options?: AgentSendOptions): AsyncGenerator<SDKEvent> {
    const run = await this.send(input, options);
    yield* run.stream();
  }

  async close(): Promise<void> {
    await this.sdk.close();
  }

  async reset(): Promise<ResetResult> {
    return this.sdk.reset();
  }

  async createBrowserHandoff(
    params: BrowserHandoffCreateParams = {}
  ): Promise<BrowserHandoffCreateResult> {
    return this.sdk.createBrowserHandoff(params);
  }

  async attachBrowserHandoff(
    params: BrowserHandoffAttachParams
  ): Promise<BrowserHandoffAttachResult> {
    return this.sdk.attachBrowserHandoff(params);
  }

  async attachLatestBrowserHandoff(): Promise<BrowserHandoffAttachResult> {
    return this.sdk.attachLatestBrowserHandoff();
  }

  async startAutomode(params: AutomodeStartParams): Promise<AutomodeStartResult> {
    return this.sdk.startAutomode(params);
  }

  async getAutomodeStatus(): Promise<AutomodeStatusResult> {
    return this.sdk.getAutomodeStatus();
  }

  async pauseAutomode(): Promise<AutomodeOperationResult> {
    return this.sdk.pauseAutomode();
  }

  async resumeAutomode(): Promise<AutomodeOperationResult> {
    return this.sdk.resumeAutomode();
  }

  async cancelAutomode(
    params: AutomodeCancelParams = {}
  ): Promise<AutomodeOperationResult> {
    return this.sdk.cancelAutomode(params);
  }

  async getAutomodeLog(
    params: AutomodeGetLogParams = {}
  ): Promise<AutomodeGetLogResult> {
    return this.sdk.getAutomodeLog(params);
  }

  async setPlanMode(enabled: boolean): Promise<void> {
    await this.sdk.setPlanMode(enabled);
  }

  async enablePlanMode(): Promise<void> {
    await this.sdk.enablePlanMode();
  }

  async disablePlanMode(): Promise<void> {
    await this.sdk.disablePlanMode();
  }

  async supportedCommands(): Promise<string[]> {
    return this.sdk.supportedCommands();
  }

  async supportsCommand(command: SlashCommand): Promise<boolean> {
    return this.sdk.supportsCommand(command);
  }

  async getGoal(): Promise<GoalSnapshotResult> {
    return this.sdk.getGoal();
  }

  async createGoal(params: CreateGoalParams): Promise<GoalMutationRpcResult> {
    return this.sdk.createGoal(params);
  }

  async updateGoal(params: UpdateGoalParams): Promise<GoalMutationRpcResult> {
    return this.sdk.updateGoal(params);
  }

  async clearGoal(): Promise<GoalMutationRpcResult> {
    return this.sdk.clearGoal();
  }

  async queueGoal(params: QueueGoalParams): Promise<GoalMutationRpcResult> {
    return this.sdk.queueGoal(params);
  }

  async startQueuedGoal(): Promise<GoalMutationRpcResult> {
    return this.sdk.startQueuedGoal();
  }

  async listGoalTemplates(): Promise<GoalTemplatesResult> {
    return this.sdk.listGoalTemplates();
  }

  async getSkillsRegistry(
    params: GetSkillsRegistryParams = {}
  ): Promise<GetSkillsRegistryResult> {
    return this.sdk.getSkillsRegistry(params);
  }

  async installSkill(params: InstallSkillParams): Promise<InstallSkillResult> {
    return this.sdk.installSkill(params);
  }

  async listMcpServers(): Promise<McpListServersResult> {
    return this.sdk.listMcpServers();
  }

  async listMcpTools(params: McpListToolsParams = {}): Promise<McpListToolsResult> {
    return this.sdk.listMcpTools(params);
  }

  async getMcpServerConfigs(): Promise<McpGetServerConfigsResult> {
    return this.sdk.getMcpServerConfigs();
  }

  async allowPermission(requestId: string, scope?: PermissionDecisionScope): Promise<void> {
    await this.sdk.allowPermission(requestId, scope);
  }

  async denyPermission(requestId: string, scope?: PermissionDecisionScope): Promise<void> {
    await this.sdk.denyPermission(requestId, scope);
  }

  async suggestPermissionAlternative(requestId: string, alternative: string): Promise<void> {
    await this.sdk.suggestPermissionAlternative(requestId, alternative);
  }

  async permissionResponse(params: PermissionResponseParams): Promise<void> {
    await this.sdk.permissionResponse(params);
  }

  async acknowledgePermission(
    params: PermissionAcknowledgedParams
  ): Promise<PermissionAcknowledgedResult> {
    return this.sdk.acknowledgePermission(params);
  }

  async respondToDirectoryAccess(
    params: DirectoryAccessResponseParams
  ): Promise<DirectoryAccessResponseResult> {
    return this.sdk.respondToDirectoryAccess(params);
  }

  async acknowledgeDirectoryAccess(
    params: DirectoryAccessAcknowledgedParams
  ): Promise<DirectoryAccessAcknowledgedResult> {
    return this.sdk.acknowledgeDirectoryAccess(params);
  }

  async decideChanges(params: ChangesDecisionParams): Promise<ChangesDecisionResult> {
    return this.sdk.decideChanges(params);
  }

  async getHistory(params: GetHistoryParams = {}): Promise<GetHistoryResult> {
    return this.sdk.getHistory(params);
  }

  async getSession(params: GetSessionParams): Promise<GetSessionResult> {
    return this.sdk.getSession(params);
  }

  async attachSession(params: SessionAttachParams): Promise<SessionAttachResult> {
    return this.sdk.attachSession(params);
  }

  async setYolo(params: YoloSetParams): Promise<YoloSetResult> {
    return this.sdk.setYolo(params);
  }

  async setYoloCompat(params: YoloSetParams): Promise<YoloSetResult> {
    return this.sdk.setYoloCompat(params);
  }

  async setVscodeMcpTools(
    params: McpSetVscodeToolsParams
  ): Promise<McpSetVscodeToolsResult> {
    return this.sdk.setVscodeMcpTools(params);
  }

  async respondToMcpInvocation(
    params: McpInvokeResponseParams
  ): Promise<McpInvokeResponseResult> {
    return this.sdk.respondToMcpInvocation(params);
  }

  async getLearningRecommendations(
    params: LearnRecommendParams = {}
  ): Promise<LearnRecommendResult> {
    return this.sdk.getLearningRecommendations(params);
  }
}
