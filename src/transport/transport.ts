/**
 * Transport layer for CLI subprocess communication
 * 
 * Handles spawning the Autohand CLI subprocess, managing stdin/stdout communication,
 * and handling process lifecycle. This class provides a JSON-RPC 2.0 compliant
 * transport layer for communicating with the CLI.
 * 
 * @example
 * ```typescript
 * const transport = new Transport({
 *   cwd: '/path/to/project',
 *   debug: true,
 *   timeout: 300000,
 * });
 * 
 * await transport.start();
 * const result = await transport.request('autohand.getState', {});
 * await transport.stop();
 * ```
 * 
 * @internal
 */

import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import type { ProviderName, AutohandEnvVars } from '../types/index.js';
import { LineReader } from './line-reader.js';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

const currentDirname = path.dirname(fileURLToPath(import.meta.url));

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Configuration options for the Transport layer
 */
export interface TransportOptions {
  /** Working directory for the CLI subprocess */
  cwd?: string;
  /** Path to CLI binary (auto-detected if not provided) */
  cliPath?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Additional environment variables passed to the CLI subprocess */
  env?: Record<string, string>;
  /** Enable auto-mode for autonomous execution */
  autoMode?: boolean;
  /** Run in unrestricted mode (bypasses certain safety checks) */
  unrestricted?: boolean;
  /** Enable auto-skill for automatic skill selection */
  autoSkill?: boolean;
  /** Enable auto-commit with LLM-generated message */
  autoCommit?: boolean;
  /** Enable context compaction */
  contextCompact?: boolean;
  /** Max auto-mode iterations */
  maxIterations?: number;
  /** Max runtime in minutes */
  maxRuntime?: number;
  /** Max API cost in dollars */
  maxCost?: number;
  /** Minimal explicit runtime */
  bare?: boolean;
  /** Keep authenticated idle logout enabled */
  idleLogout?: boolean;
  /** Fork an existing session before startup */
  fork?: string;
  /** CLI display language locale */
  displayLanguage?: string;
  /** System prompt (inline string or file path) */
  sysPrompt?: string;
  /** File path that replaces the system prompt */
  systemPromptFile?: string;
  /** Append to system prompt (inline string or file path) */
  appendSysPrompt?: string;
  /** File path appended to the system prompt */
  appendSystemPromptFile?: string;
  /** Explicit MCP config file */
  mcpConfig?: string;
  /** Inline agents JSON or external agents directory */
  agents?: string;
  /** Explicit plugin/meta-tool directory */
  pluginDir?: string;
  /** Model to use */
  model?: string;
  /** Sampling temperature */
  temperature?: number;
  /** Auto-approve tool calls matching pattern */
  yolo?: string;
  /** Timeout in seconds for auto-approve mode */
  yoloTimeout?: number;
  /** Additional directories to add to workspace */
  addDir?: string[];
  /** Additional CLI arguments */
  extraArgs?: string[];

  // Session options
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

  // AGENTS.md options
  /** Enable AGENTS.md usage */
  agentsMdEnable?: boolean;
  /** Create AGENTS.md if it doesn't exist */
  agentsMdCreate?: boolean;
  /** Path to AGENTS.md */
  agentsMdPath?: string;
  /** Auto-update AGENTS.md with discovered patterns */
  agentsMdAutoUpdate?: boolean;

  // Context options
  /** Maximum context window in tokens */
  maxTokens?: number;
  /** Threshold for starting compression (0-1) */
  compressionThreshold?: number;
  /** Threshold for starting summarization (0-1) */
  summarizationThreshold?: number;

  // Skills options
  /** Specific skills to load (by name) */
  skills?: string[];
  /** SKILL.md files to copy before loading skills by name */
  skillFiles?: string[];
  /** Skill sources to search */
  skillSources?: string[];
  /** Whether to install missing skills from community */
  installMissingSkills?: boolean;

  // Provider-specific options
  /** Provider name (optional, auto-detected from model ID) */
  provider?: ProviderName | undefined;
  /** API key for the provider */
  apiKey?: string;
  /** Base URL for the provider API */
  baseUrl?: string;
  /** Autohand AI plan style */
  autohandAIPlan?: 'cloud' | 'local';
  /** Port for local provider */
  port?: number;

  // Environment variables
  /** AUTOHAND_ prefixed environment variables forwarded to the CLI subprocess */
  envVars?: AutohandEnvVars;

  // Hooks options
  /** Enable hooks globally */
  hooksEnabled?: boolean;
  /** Hook definitions to register */
  hooksDefinitions?: import('../types/index.js').HookDefinition[];
}

export function buildCliArgs(options: TransportOptions): string[] {
  const args = ['--mode', 'rpc'];

  if (options.bare === true) args.push('--bare');
  if (options.unrestricted === true) args.push('--unrestricted');
  if (options.autoMode === true) args.push('--auto-mode');
  if (options.autoSkill === true) args.push('--auto-skill');
  if (options.autoCommit === true) args.push('-c');
  if (options.idleLogout === false) args.push('--no-idle-logout');
  if (options.contextCompact === false) args.push('--no-context-compact');
  if (options.contextCompact === true) args.push('--context-compact');
  if (options.persistSession === true) args.push('--persist-session');
  if (options.sessionId !== undefined) args.push('--session-id', options.sessionId);
  if (options.resume === true) args.push('--resume');
  if (options.continue === true) args.push('--continue');
  if (options.fork !== undefined) args.push('--fork', options.fork);
  if (options.sessionPath !== undefined) args.push('--session-path', options.sessionPath);
  if (options.autoSaveInterval !== undefined) args.push('--auto-save-interval', String(options.autoSaveInterval));
  if (options.agentsMdEnable === false) args.push('--no-agents-md');
  if (options.agentsMdEnable === true) args.push('--agents-md');
  if (options.agentsMdCreate === true) args.push('--agents-md-create');
  if (options.agentsMdPath !== undefined) args.push('--agents-md-path', options.agentsMdPath);
  if (options.agentsMdAutoUpdate === true) args.push('--agents-md-auto-update');
  if (options.maxTokens !== undefined) args.push('--max-tokens', String(options.maxTokens));
  if (options.compressionThreshold !== undefined) args.push('--compression-threshold', String(options.compressionThreshold));
  if (options.summarizationThreshold !== undefined) args.push('--summarization-threshold', String(options.summarizationThreshold));
  if (options.skills !== undefined && options.skills.length > 0) args.push('--skills', options.skills.join(','));
  if (options.skillSources !== undefined && options.skillSources.length > 0) args.push('--skill-sources', options.skillSources.join(','));
  if (options.installMissingSkills === true) args.push('--install-missing-skills');
  if (options.maxIterations !== undefined) args.push('--max-iterations', String(options.maxIterations));
  if (options.maxRuntime !== undefined) args.push('--max-runtime', String(options.maxRuntime));
  if (options.maxCost !== undefined) args.push('--max-cost', String(options.maxCost));
  if (options.displayLanguage !== undefined) args.push('--display-language', options.displayLanguage);
  if (options.sysPrompt !== undefined) args.push('--sys-prompt', options.sysPrompt);
  if (options.systemPromptFile !== undefined) args.push('--system-prompt-file', options.systemPromptFile);
  if (options.appendSysPrompt !== undefined) args.push('--append-sys-prompt', options.appendSysPrompt);
  if (options.appendSystemPromptFile !== undefined) args.push('--append-system-prompt-file', options.appendSystemPromptFile);
  if (options.mcpConfig !== undefined) args.push('--mcp-config', options.mcpConfig);
  if (options.agents !== undefined) args.push('--agents', options.agents);
  if (options.pluginDir !== undefined) args.push('--plugin-dir', options.pluginDir);
  if (options.model !== undefined) args.push('--model', options.model);
  if (options.temperature !== undefined) args.push('--temperature', String(options.temperature));
  if (options.yolo !== undefined) args.push('--yolo', options.yolo);
  if (options.yoloTimeout !== undefined) args.push('--yolo-timeout', String(options.yoloTimeout));
  options.addDir?.forEach((dir) => args.push('--add-dir', dir));
  if (options.extraArgs !== undefined) args.push(...options.extraArgs);

  return args;
}

export class Transport {
  private process: ChildProcess | null = null;
  private lineReader: LineReader | null = null;
  private pendingRequests = new Map<number | string, PendingRequest>();
  private notificationCallbacks = new Map<string, (params: unknown) => void>();
  private terminationCallbacks = new Set<(error: Error) => void>();
  private requestIdCounter = 0;
  private debug: boolean;
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;
  private outputTerminationPromise: Promise<void> | null = null;
  private stderrLines: string[] = [];

  /**
   * Create a new Transport instance
   * 
   * @param options - Transport configuration options
   */
  constructor(private options: TransportOptions = {}) {
    this.debug = options.debug ?? false;
  }

  /**
   * Start the CLI subprocess
   * 
   * Spawns the Autohand CLI in RPC mode and sets up communication channels.
   * The CLI is started with configurable flags based on TransportOptions.
   * 
   * @throws {Error} If the CLI process fails to start
   */
  async start(): Promise<void> {
    if (this.outputTerminationPromise !== null) await this.outputTerminationPromise;
    if (this.stopPromise !== null) await this.stopPromise;
    if (this.startPromise !== null) return this.startPromise;
    if (this.isRunning()) return;

    const operation = this.startProcess();
    this.startPromise = operation;
    try {
      await operation;
    } finally {
      if (this.startPromise === operation) {
        this.startPromise = null;
      }
    }
  }

  private async startProcess(): Promise<void> {
    const cliPath = this.options.cliPath ?? await this.detectCLIBinary();
    const cwd = this.options.cwd ?? process.cwd();

    // Copy skill files before starting CLI
    if (this.options.skillFiles !== undefined) {
      await this.copySkillFiles(cwd);
    }

    this.log(`Starting CLI: ${cliPath}`);
    this.log(`Working directory: ${cwd}`);

    // Build CLI arguments
    const args = buildCliArgs(this.options);

    this.log(`CLI args: ${args.join(' ')}`);

    // Build environment variables to forward to CLI subprocess
    const env: Record<string, string> = {
      ...process.env,
      ...this.options.env,
    } as Record<string, string>;
    // Enable tool output streaming for SDK events
    env.AUTOHAND_STREAM_TOOL_OUTPUT = '1';
    if (this.options.provider === 'autohandai') {
      env.AUTOHAND_AI_PLAN = this.options.autohandAIPlan ?? 'cloud';
      if (this.options.apiKey !== undefined) {
        env.AUTOHAND_AI_API_KEY = this.options.apiKey;
      }
      if (this.options.baseUrl !== undefined) {
        env.AUTOHAND_AI_BASE_URL = this.options.baseUrl;
      }
    }
    if (this.options.envVars) {
      for (const [key, value] of Object.entries(this.options.envVars)) {
        if (value !== undefined) {
          env[key] = value;
        }
      }
    }

    this.stderrLines = [];
    const child = spawn(cliPath, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });
    this.process = child;

    child.on('error', (error) => {
      const failure = new Error(`CLI process error: ${error.message}`);
      this.log(failure.message);
      this.handleProcessTermination(child, failure);
    });

    child.on('exit', (code, signal) => {
      const detail = code !== null ? `code ${code}` : `signal ${signal ?? 'unknown'}`;
      const stderr = this.getStderrTail();
      const failure = new Error(
        `CLI process exited with ${detail}${stderr === '' ? '' : `:\n${stderr}`}`
      );
      this.log(failure.message);
      this.handleProcessTermination(child, failure);
    });

    // Setup line reader for stdout
    const stdout = child.stdout;
    if (stdout === null) {
      child.kill('SIGTERM');
      this.process = null;
      throw new Error('Process stdout not available');
    }
    const reader = new LineReader(stdout);
    this.lineReader = reader;
    void this.startReadingResponses(child, reader);

    // Keep stderr out of the JSON-RPC stdout channel.
    child.stderr?.on('data', (data: Buffer | string) => {
      const text = data.toString();
      this.stderrLines.push(...text.split(/\r?\n/).filter((line) => line !== ''));
      this.stderrLines = this.stderrLines.slice(-50);
      this.log(`STDERR: ${text}`);
    });

    // The spawn event means the subprocess exists and its stdin pipe is ready.
    // JSON-RPC input may safely be buffered while the CLI finishes initialization.
    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        child.off('spawn', onSpawn);
        child.off('error', onError);
        child.off('exit', onExit);
      };
      const onSpawn = (): void => {
        cleanup();
        resolve();
      };
      const onError = (error: Error): void => {
        cleanup();
        reject(new Error(`Failed to start CLI: ${error.message}`));
      };
      const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
        cleanup();
        reject(new Error(
          `CLI process exited during startup (${code !== null ? `code ${code}` : `signal ${signal ?? 'unknown'}`})`
        ));
      };

      child.once('spawn', onSpawn);
      child.once('error', onError);
      child.once('exit', onExit);
    });

    if (this.process !== child || child.exitCode !== null) {
      throw new Error('CLI process exited before startup completed');
    }
  }

  /**
   * Stop the CLI subprocess
   * 
   * Gracefully terminates the CLI process using SIGTERM and waits for exit.
   */
  async stop(): Promise<void> {
    if (this.stopPromise !== null) return this.stopPromise;

    const operation = this.stopProcess();
    this.stopPromise = operation;
    try {
      await operation;
    } finally {
      if (this.stopPromise === operation) {
        this.stopPromise = null;
      }
    }
  }

  private async stopProcess(): Promise<void> {
    if (this.outputTerminationPromise !== null) await this.outputTerminationPromise;
    const starting = this.startPromise;
    if (starting !== null) {
      await starting.catch(() => undefined);
    }
    const child = this.process;
    const stopped = new Error('CLI process stopped');
    this.process = null;
    this.lineReader?.close(stopped);
    this.lineReader = null;
    this.failPendingRequests(stopped);

    if (child === null || child.exitCode !== null) return;

    this.log('Stopping CLI process');
    child.stdin?.end();
    child.kill('SIGTERM');

    const exited = await this.waitForExit(child, 1_000);
    if (!exited && child.exitCode === null) {
      child.kill('SIGKILL');
      await this.waitForExit(child, 1_000);
    }
  }

  /**
   * Send a JSON-RPC request
   * 
   * Sends a JSON-RPC 2.0 request to the CLI and waits for the response.
   * Requests are matched by ID and have a configurable timeout.
   * 
   * @param method - RPC method name
   * @param params - Method parameters
   * @returns Promise that resolves with the response result
   * @throws {Error} If the process is not started, request times out, or an error response is received
   */
  async request(method: string, params?: unknown): Promise<unknown> {
    const child = this.process;
    if (child === null || child.exitCode !== null || child.stdin === null || !child.stdin.writable) {
      throw new Error('CLI process not started');
    }

    const id = ++this.requestIdCounter;
    const request = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    };

    this.log(`Sending request: ${method} (id: ${id})`);

    const serialized = JSON.stringify(request) + '\n';
    const responsePromise = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.options.timeout ?? 300000);

      this.pendingRequests.set(id, { method, resolve, reject, timeout });
    });

    try {
      child.stdin.write(serialized, (error) => {
        if (error !== null && error !== undefined) {
          this.failPendingRequest(id, new Error(`Failed to write RPC request ${method}: ${error.message}`));
        }
      });
    } catch (error) {
      this.failPendingRequest(
        id,
        new Error(`Failed to write RPC request ${method}: ${error instanceof Error ? error.message : String(error)}`)
      );
    }

    return responsePromise;
  }

  /**
   * Register a notification callback
   * 
   * Registers a callback for a specific JSON-RPC notification method.
   * Notifications are server-to-client messages that don't have an ID.
   * 
   * @param method - Notification method name
   * @param callback - Callback function to handle the notification
   */
  onNotification(method: string, callback: (params: unknown) => void): void {
    this.notificationCallbacks.set(method, callback);
  }

  /**
   * Remove a notification callback
   * 
   * Removes the callback for a specific notification method.
   * 
   * @param method - Notification method name
   */
  offNotification(method: string): void {
    this.notificationCallbacks.delete(method);
  }

  /** Register a callback that runs when the active CLI process exits unexpectedly. */
  onTermination(callback: (error: Error) => void): void {
    this.terminationCallbacks.add(callback);
  }

  /**
   * Start reading responses from stdout
   * 
   * Begins the loop that reads JSON-RPC responses from stdout
   * and dispatches them to the appropriate handlers.
   * 
   * @private
   */
  private async startReadingResponses(child: ChildProcess, reader: LineReader): Promise<void> {
    let failure = new Error('CLI stdout closed');
    try {
      while (!reader.isClosed() || reader.hasPendingLines()) {
        const line = await reader.readLine();
        this.handleLine(line);
      }
    } catch (error) {
      failure = new Error(
        `CLI stdout closed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    this.log(failure.message);
    if (this.process === child && this.lineReader === reader) {
      const operation = this.terminateAfterStdoutClosure(child, failure);
      this.outputTerminationPromise = operation;
      try {
        await operation;
      } finally {
        if (this.outputTerminationPromise === operation) {
          this.outputTerminationPromise = null;
        }
      }
    }
  }

  private async terminateAfterStdoutClosure(child: ChildProcess, failure: Error): Promise<void> {
    this.handleProcessTermination(child, failure);
    child.stdin?.destroy();
    if (child.exitCode !== null) return;

    child.kill('SIGTERM');
    const exited = await this.waitForExit(child, 1_000);
    if (!exited && child.exitCode === null) {
      child.kill('SIGKILL');
      await this.waitForExit(child, 1_000);
    }
  }

  /**
   * Handle a line from stdout
   * 
   * Parses a JSON-RPC message and dispatches it to either a request callback
   * or a notification callback based on whether it has an ID.
   * 
   * @param line - Raw JSON line from stdout
   * @private
   */
  private handleLine(line: string): void {
    try {
      const response = JSON.parse(line);

      if (response.id !== undefined) {
        // This is a response to a request
        const pending = this.pendingRequests.get(response.id);
        if (pending !== undefined) {
          this.pendingRequests.delete(response.id);
          clearTimeout(pending.timeout);
          if (this.isErrorResponse(response)) {
            const error = (response as { error: unknown }).error;
            if (
              typeof error === 'object'
              && error !== null
              && 'message' in error
              && typeof error.message === 'string'
            ) {
              pending.reject(new Error(error.message));
            } else {
              pending.reject(new Error(
                `Malformed JSON-RPC error response for ${pending.method}`
              ));
            }
          } else if (
            typeof response === 'object'
            && response !== null
            && 'result' in response
          ) {
            pending.resolve((response as { result: unknown }).result);
          } else {
            pending.reject(new Error(
              `Malformed JSON-RPC response for ${pending.method}`
            ));
          }
        }
      } else {
        // This is a notification
        const callback = this.notificationCallbacks.get(response.method);
        if (callback) {
          callback(response.params);
        }
      }
    } catch (error) {
      this.log(`Error parsing line: ${line}`);
    }
  }

  /**
   * Check if a response is an error response
   * 
   * @param response - Response object to check
   * @returns true if the response contains an error field
   * @private
   */
  private isErrorResponse(response: unknown): boolean {
    return typeof response === 'object' && response !== null && 'error' in response;
  }

  /**
   * Detect the CLI binary for the current platform
   * 
   * Determines the appropriate binary name based on the operating system
   * and architecture, then checks if it exists in the package or system PATH.
   * 
   * @returns Path to the CLI binary
   * @throws {Error} If the platform is not supported
   * @private
   */
  private async detectCLIBinary(): Promise<string> {
    const platform = os.platform();
    const arch = os.arch();

    let binaryName: string;

    switch (platform) {
      case 'darwin':
        binaryName = arch === 'arm64' ? 'autohand-macos-arm64' : 'autohand-macos-x64';
        break;
      case 'linux':
        binaryName = arch === 'arm64' ? 'autohand-linux-arm64' : 'autohand-linux-x64';
        break;
      case 'win32':
        binaryName = 'autohand-windows-x64.exe';
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    // Try to find binary in package
    const packagePath = path.join(currentDirname, '../../cli', binaryName);
    
    // Try to find binary in system PATH
    const systemPath = binaryName;

    // Check if package binary exists
    try {
      await fs.access(packagePath);
      return packagePath;
    } catch {
      // Fall back to system PATH
      return systemPath;
    }
  }

  /**
   * Log a message if debug mode is enabled
   * 
   * @param message - Message to log
   * @private
   */
  private log(message: string): void {
    if (this.debug) {
      console.log(`[Transport] ${message}`);
    }
  }

  /**
   * Check if the process is running
   * 
   * @returns true if the process exists and has not been killed
   */
  isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  /** Return the last stderr lines emitted by the CLI without mixing them into RPC stdout. */
  getStderrTail(): string {
    return this.stderrLines.join('\n');
  }

  private handleProcessTermination(child: ChildProcess, error: Error): void {
    if (this.process !== child) return;
    this.process = null;
    this.lineReader?.close(error);
    this.lineReader = null;
    this.failPendingRequests(error);
    for (const callback of this.terminationCallbacks) {
      callback(error);
    }
  }

  private failPendingRequest(id: number | string, error: Error): void {
    const pending = this.pendingRequests.get(id);
    if (pending === undefined) return;
    this.pendingRequests.delete(id);
    clearTimeout(pending.timeout);
    pending.reject(error);
  }

  private failPendingRequests(error: Error): void {
    const requests = [...this.pendingRequests.values()];
    this.pendingRequests.clear();
    for (const pending of requests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`${error.message} (pending RPC: ${pending.method})`));
    }
  }

  private async waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
    if (child.exitCode !== null) return true;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        child.off('exit', onExit);
        resolve(false);
      }, timeoutMs);
      const onExit = (): void => {
        clearTimeout(timeout);
        resolve(true);
      };
      child.once('exit', onExit);
    });
  }

  /**
   * Copy skill files to the appropriate directories
   * 
   * Detects file paths in skills array and copies them to ~/.autohand/skills/
   * before starting the CLI. This enables using custom skill files via SDK config.
   * 
   * @param cwd - Working directory for resolving relative paths
   * @private
   */
  private async copySkillFiles(cwd: string): Promise<void> {
    const homeDir = os.homedir();
    const autohandSkillsDir = path.join(homeDir, '.autohand', 'skills');

    for (const skill of this.options.skillFiles ?? []) {
      // Resolve the source path
      const srcPath = path.resolve(cwd, skill);

      try {
        // Check if file exists
        await fs.access(srcPath);

        // Determine skill name from directory structure
        // e.g., "./skills/my-skill/SKILL.md" -> "my-skill"
        const parts = skill.split(/[\\/]/).filter(p => p && p !== '.' && p !== '..');
        let skillName = parts[parts.length - 1];
        if (skillName === 'SKILL.md' && parts.length > 1) {
          skillName = parts[parts.length - 2];
        }
        skillName = skillName?.replace(/\.md$/i, '') ?? 'custom-skill';

        // Copy to user skills directory
        const destDir = path.join(autohandSkillsDir, skillName);
        const destPath = path.join(destDir, 'SKILL.md');

        // Create directory if it doesn't exist
        await fs.mkdir(destDir, { recursive: true });

        // Copy the file
        const content = await fs.readFile(srcPath, 'utf-8');
        await fs.writeFile(destPath, content);

        this.log(`Copied skill file: ${srcPath} -> ${destPath}`);
      } catch (error) {
        this.log(`Failed to copy skill file ${skill}: ${error}`);
        // Don't throw - let CLI handle missing skills
      }
    }
  }
}
