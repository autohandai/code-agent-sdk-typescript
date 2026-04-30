/**
 * Autohand Agent SDK - CLI Wrapper Implementation
 * 
 * This SDK provides a TypeScript wrapper around the Autohand CLI, enabling programmatic
 * control of AI agents through a high-level API. It supports streaming events, permission
 * management, model switching, and full lifecycle control of agent sessions.
 * 
 * @example
 * ```typescript
 * import { AutohandSDK } from '@autohand/agent-sdk';
 * 
 * const sdk = new AutohandSDK({
 *   cwd: '/path/to/project',
 *   model: 'claude-sonnet-4-20250514',
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
 * Main SDK class for interacting with the Autohand CLI
 */
export { AutohandSDK } from './sdk/index.js';

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
export type { ProviderName } from './types/index.js';
export { detectProviderFromModel, ProviderConfigError, validateProviderConfig } from './types/index.js';

/**
 * Permission types and settings
 */
export type { PermissionMode, PermissionRule, PermissionSettings } from './types/index.js';

/**
 * Skill types and settings
 */
export type { SkillSource, SkillFrontmatter, SkillDefinition, SkillSettings } from './types/index.js';

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
