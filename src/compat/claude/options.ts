import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { SDKConfig } from '../../types/index.js';
import { parseConfig, resolveConfigPath } from '../../transport/session-awareness-config.js';
import { ClaudeCompatibilityError } from '../../errors/claude-compat.js';
import { validateClaudeOptions } from '../../validation/claude-compat.js';
import type { Options, PermissionMode } from './types.js';
import { resolveAuthentication, resolveModel, type Authentication } from './models.js';
import { resolvePermissionMode } from './permissions.js';
import { toNativeToolPatterns } from './tools.js';
import { serveSdkMcpServer } from './mcp.js';

const supported = new Set(['cwd', 'env', 'apiKey', 'provider', 'baseUrl', 'model', 'permissionMode',
  'allowDangerouslySkipPermissions', 'allowedTools', 'disallowedTools', 'tools', 'systemPrompt',
  'mcpServers', 'agents', 'additionalDirectories', 'abortController', 'includePartialMessages',
  'resume', 'continue', 'forkSession', 'persistSession', 'cliPath', 'pathToClaudeCodeExecutable',
  'debug', 'stderr', 'maxTurns', 'settingSources']);

export interface PreparedOptions {
  config: SDKConfig;
  auth: Authentication;
  model: string;
  permissionMode: PermissionMode;
  warn(option: string, message: string): void;
  cleanup(): Promise<void>;
}

export async function prepareOptions(options: Options = {}): Promise<PreparedOptions> {
  validateClaudeOptions(options);
  const warnings = new Set<string>();
  const warn = (option: string, message: string): void => {
    if (warnings.has(option)) return;
    warnings.add(option);
    const text = `[Autohand Claude compatibility] ${option}: ${message}\n`;
    if (options.stderr) options.stderr(text); else process.stderr.write(text);
  };
  if (options.maxBudgetUsd !== undefined) throw new ClaudeCompatibilityError('The current CLI cannot enforce a dollar budget. maxBudgetUsd is unavailable until the budget runtime ships.');
  for (const field of ['hooks', 'sandbox', 'managedSettings', 'extraArgs', 'sessionId', 'isolation', 'outputFormat',
    'settings', 'permissionPrompts', 'permissionPromptToolName', 'toolAliases', 'toolConfig', 'taskBudget',
    'strictMcpConfig', 'spawnClaudeCodeProcess', 'resumeSessionAt', 'resumeDropsTurn', 'sessionStore',
    'sessionStoreFlush', 'agent', 'plugins', 'skills', 'projectConfigRoot']) {
    if (options[field] !== undefined) throw new ClaudeCompatibilityError(`${field} cannot be applied safely by this CLI compatibility release`);
  }
  if (options.canUseTool !== undefined) throw new ClaudeCompatibilityError('canUseTool requires a CLI release that supplies tool input and tool-use IDs before authorization. The current CLI emits tool_start only after authorization.');
  const writeCapabilities = new Set(['write_file', 'append_file', 'apply_patch', 'search_replace',
    'multi_file_edit', 'notebook_edit', 'format_file', 'delete_path', 'rename_path', 'copy_path']);
  if (options.permissionMode !== 'bypassPermissions' && (options.permissionMode === 'acceptEdits'
    || (options.allowedTools ?? []).filter(pattern => !pattern.includes('(')).flatMap(toNativeToolPatterns).some(tool => writeCapabilities.has(tool)))) {
    throw new ClaudeCompatibilityError('File-tool preapproval and acceptEdits require requested-tool permission rules in the CLI. Native write_file capability rules would also authorize dependency or branch changes.');
  }
  if (options.agents) for (const [name, agent] of Object.entries(options.agents)) {
    for (const field of ['disallowedTools', 'permissionMode', 'maxTurns', 'hooks']) {
      if (agent[field] !== undefined) throw new ClaudeCompatibilityError(`agents.${name}.${field} is not enforced by the current CLI`);
    }
  }
  for (const [key, value] of Object.entries(options)) if (value !== undefined && !supported.has(key)) warn(key, 'unsupported; see COMPAT.md');
  if (options.permissionMode === 'auto') warn('permissionMode.auto', 'no equivalent classifier; using interactive approval');
  if (options.maxTurns !== undefined) warn('maxTurns', 'bounded by total model requests, including subagents; exact main-agent turn accounting needs a newer CLI');
  if ((options.allowedTools ?? []).some(pattern => pattern.includes('('))) warn('allowedTools', 'scoped preapproval requires the correlated permission runtime; scoped tools will require approval and are denied without it');
  if (options.pathToClaudeCodeExecutable !== undefined) warn('pathToClaudeCodeExecutable', 'must point to an Autohand CLI executable, not Claude Code');
  if ((options.settingSources?.length ?? 0) > 0) throw new ClaudeCompatibilityError('Selective settingSources import requires the CLI import boundary. Claude permission rules and hooks must not be silently ignored.');

  let auth = resolveAuthentication(options);
  const selected = resolveModel(options.model, auth);
  if (selected.provider !== auth.provider) auth = resolveAuthentication({ ...options, provider: selected.provider });
  const mode = resolvePermissionMode(options.permissionMode, options.allowDangerouslySkipPermissions);
  const cwd = resolve(options.cwd ?? process.cwd());
  const sourcePath = options.settingSources?.length === 0 ? undefined : await resolveConfigPath({ env: auth.env });
  const original = sourcePath !== undefined ? await parseConfig(sourcePath) : {};
  const providerSettings = original[auth.provider];
  const existingProvider = providerSettings !== undefined && providerSettings !== null && typeof providerSettings === 'object' && !Array.isArray(providerSettings) ? providerSettings : {};
  const originalPermissions = original.permissions;
  const permissions = originalPermissions !== undefined && originalPermissions !== null && typeof originalPermissions === 'object' && !Array.isArray(originalPermissions) ? originalPermissions : {};
  const explicitAllowed = (options.allowedTools ?? []).filter(pattern => !pattern.includes('('))
    .flatMap(toNativeToolPatterns).filter(tool => !writeCapabilities.has(tool)).map(tool => `${tool}:*`);
  const baseAllow = 'allowList' in permissions && Array.isArray(permissions.allowList) ? permissions.allowList : [];
  const merged = {
    ...original, auth: { token: auth.accountApiKey }, provider: auth.provider,
    [auth.provider]: { ...existingProvider, model: selected.model,
      ...(auth.apiKey !== undefined ? { apiKey: auth.apiKey } : {}),
      ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
      ...(auth.provider === 'autohandai' ? { plan: 'cloud', authMode: 'api-key' } : {}) },
    permissions: { ...permissions, mode: mode.mode, allowList: [...baseAllow, ...explicitAllowed] },
  };
  const directory = await mkdtemp(join(tmpdir(), 'autohand-claude-'));
  const resources: Array<() => Promise<void>> = [];
  const cleanup = async (): Promise<void> => {
    try { await Promise.all(resources.splice(0).map(close => close())); }
    finally { await rm(directory, { recursive: true, force: true }); }
  };
  try {
    await chmod(directory, 0o700);
    const configPath = join(directory, 'config.json');
    await writeFile(configPath, JSON.stringify(merged), { mode: 0o600 });
    const extraArgs: string[] = [];
    const disallowed = (options.disallowedTools ?? []).flatMap(toNativeToolPatterns);
    if (disallowed.length) extraArgs.push('--disallowed-tools', disallowed.join(','));
    if (Array.isArray(options.tools)) extraArgs.push('--allowed-tools', options.tools.length ? options.tools.flatMap(toNativeToolPatterns).join(',') : '__autohand_no_tools__');
    if (options.persistSession === false) extraArgs.push('--ephemeral');
    if (options.maxTurns !== undefined) extraArgs.push('--max-requests', String(options.maxTurns));
    const config: SDKConfig = {
      cwd, configPath, provider: auth.provider, model: selected.model,
      env: { ...auth.env, AUTOHAND_NO_BANNER: '1', AUTOHAND_NON_INTERACTIVE: '1', AUTOHAND_SKIP_UPDATE_CHECK: '1' },
      permissionMode: mode.mode, planMode: mode.planMode, extraArgs,
      ...(auth.apiKey !== undefined ? { apiKey: auth.apiKey } : {}),
      ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
      ...(options.cliPath !== undefined || options.pathToClaudeCodeExecutable !== undefined ? { cliPath: options.cliPath ?? options.pathToClaudeCodeExecutable } : {}),
      ...(options.additionalDirectories ? { addDir: options.additionalDirectories } : {}),
      ...(options.debug !== undefined ? { debug: options.debug } : {}),
      ...(options.settingSources?.length === 0 ? { bare: true } : {}),
      ...(options.forkSession === true && options.resume !== undefined ? { fork: options.resume } : {}),
    };
    if (typeof options.systemPrompt === 'string') config.systemPrompt = options.systemPrompt;
    else if (Array.isArray(options.systemPrompt)) config.systemPrompt = options.systemPrompt.join('\n\n');
    else if (options.systemPrompt?.type === 'custom') config.systemPrompt = options.systemPrompt.prompt;
    else if (options.systemPrompt?.type === 'preset' && options.systemPrompt.append !== undefined) config.appendSystemPrompt = options.systemPrompt.append;
    if (options.mcpServers) {
      const servers = [];
      for (const [name, server] of Object.entries(options.mcpServers)) {
        const served = server.type === 'sdk' ? await serveSdkMcpServer(server) : undefined;
        if (served !== undefined) resources.push(served.close);
        const { type, ...settings } = served?.config ?? server;
        servers.push({ ...settings, name, transport: type ?? 'stdio' });
      }
      config.mcpConfig = join(directory, 'mcp.json');
      await writeFile(config.mcpConfig, JSON.stringify({ enabled: true, servers }), { mode: 0o600 });
    }
    if (options.agents) config.agents = JSON.stringify(Object.fromEntries(Object.entries(options.agents).map(([name, agent]) => [name, {
      description: agent.description, prompt: agent.prompt,
      ...(agent.tools ? { tools: agent.tools.flatMap(toNativeToolPatterns) } : {}),
      ...(agent.model !== undefined && agent.model !== 'inherit' ? { model: resolveModel(agent.model, auth).model } : {}),
    }])));
    return { config, auth, model: selected.model, permissionMode: options.permissionMode ?? 'default', warn, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
