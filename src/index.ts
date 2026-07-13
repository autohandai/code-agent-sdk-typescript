/**
 * Autohand Agent SDK - CLI Wrapper Implementation
 * 
 * This SDK provides a TypeScript wrapper around the Autohand CLI, enabling programmatic
 * control of AI agents through a high-level API. It supports streaming events, permission
 * management, model switching, and full lifecycle control of agent sessions.
 * 
 * @example
 * ```typescript
 * import { AutohandSDK } from '@autohandai/agent-sdk';
 * 
 * const sdk = new AutohandSDK({
 *   cwd: '/path/to/project',
 *   model: 'openrouter/auto',
 *   debug: true,
 * });
 * 
 * await sdk.start();
 * for await (const event of sdk.streamPrompt({ message: 'Hello' })) {
 *   console.log(event);
 * }
 * await sdk.close();
 * ```
 * 
 * @packageDocumentation
 */

/**
 * High-level Agent and Run API
 */
export { Agent, Run, StructuredOutputError, parseJsonText } from './sdk/agent.js';
export type {
  AgentInput,
  AgentOptions,
  AgentSendOptions,
  JsonParseOptions,
  JsonRunOptions,
  RunResult,
} from './sdk/agent.js';

/**
 * Main SDK class for interacting with the Autohand CLI
 */
export { AutohandSDK, formatSlashCommand } from './sdk/index.js';

/**
 * JSON-RPC client for communicating with the CLI subprocess
 */
export { RPCClient } from './rpc/client.js';

/**
 * Transport layer for CLI subprocess communication
 */
export { Transport } from './transport/transport.js';

/**
 * Type definitions for the SDK
 */
export * from './types/index.js';

/**
 * Load SDK configuration from a JSON file
 */
export { loadConfigFrom, loadWorkspaceConfig } from './types/index.js';

/**
 * Tool enum for simplified configuration
 */
export { Tool } from './types/index.js';

/**
 * Provider detection and types
 */
export type { ProviderName, AutohandEnvVars } from './types/index.js';
export { detectProviderFromModel, ProviderConfigError, validateProviderConfig } from './types/index.js';

/**
 * Permission types and settings
 */
export type { PermissionMode, PermissionRule, PermissionSettings } from './types/index.js';

/**
 * Skill types and settings
 */
export type { SkillSource, SkillFrontmatter, SkillDefinition, SkillSettings, SkillReference } from './types/index.js';
export { isSkillFilePath, getSkillName, getSkillPath } from './types/index.js';

/**
 * Context management types
 */
export type { ContextUsage, ContextSettings } from './types/index.js';

/**
 * Stats tracking types
 */
export type { SessionStats } from './types/index.js';

/**
 * Session management types
 */
export type { SessionType, SessionMetadata, SessionSettings } from './types/index.js';

/**
 * AGENTS.md types and helpers
 */
export type { AgentsMdSettings } from './types/index.js';
export { loadAgentsMd, createDefaultAgentsMd } from './types/index.js';

/**
 * Hooks types and helpers (matching CLI-3 HookManager)
 */
export { HOOK_EVENTS } from './types/index.js';
export type {
  HookEvent,
  HookDefinition,
  HookFilter,
  HookResponse,
  HooksSettings,
  HookContext,
  HookExecutionResult,
  AddHookParams,
  RemoveHookParams,
  ToggleHookParams,
  TestHookParams,
  AddHookResult,
  RemoveHookResult,
  ToggleHookResult,
  TestHookResult,
  GetHooksResult,
} from './types/index.js';
