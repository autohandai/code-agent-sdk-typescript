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
  /** System prompt (inline string or file path) */
  sysPrompt?: string;
  /** Append to system prompt (inline string or file path) */
  appendSysPrompt?: string;
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

export class Transport {
  private process: ChildProcess | null = null;
  private lineReader: LineReader | null = null;
  private requestCallbacks = new Map<number | string, (response: unknown) => void>();
  private notificationCallbacks = new Map<string, (params: unknown) => void>();
  private requestIdCounter = 0;
  private debug: boolean;

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
    const cliPath = this.options.cliPath ?? await this.detectCLIBinary();
    const cwd = this.options.cwd ?? process.cwd();

    // Copy skill files before starting CLI
    if (this.options.skillFiles !== undefined) {
      await this.copySkillFiles(cwd);
    }

    this.log(`Starting CLI: ${cliPath}`);
    this.log(`Working directory: ${cwd}`);

    // Build CLI arguments
    const args = ['--mode', 'rpc'];

    if (this.options.unrestricted === true) {
      args.push('--unrestricted');
    }
    if (this.options.autoMode === true) {
      args.push('--auto-mode');
    }
    if (this.options.autoSkill === true) {
      args.push('--auto-skill');
    }
    if (this.options.autoCommit === true) {
      args.push('-c');
    }
    if (this.options.contextCompact === false) {
      args.push('--no-context-compact');
    } else if (this.options.contextCompact === true) {
      args.push('--context-compact');
    }
    if (this.options.persistSession === true) {
      args.push('--persist-session');
    }
    if (this.options.sessionId !== undefined) {
      args.push('--session-id', this.options.sessionId);
    }
    if (this.options.resume === true) {
      args.push('--resume');
    }
    if (this.options.continue === true) {
      args.push('--continue');
    }
    if (this.options.sessionPath !== undefined) {
      args.push('--session-path', this.options.sessionPath);
    }
    if (this.options.autoSaveInterval !== undefined) {
      args.push('--auto-save-interval', String(this.options.autoSaveInterval));
    }
    if (this.options.agentsMdEnable === false) {
      args.push('--no-agents-md');
    } else if (this.options.agentsMdEnable === true) {
      args.push('--agents-md');
    }
    if (this.options.agentsMdCreate === true) {
      args.push('--agents-md-create');
    }
    if (this.options.agentsMdPath !== undefined) {
      args.push('--agents-md-path', this.options.agentsMdPath);
    }
    if (this.options.agentsMdAutoUpdate === true) {
      args.push('--agents-md-auto-update');
    }
    if (this.options.maxTokens !== undefined) {
      args.push('--max-tokens', String(this.options.maxTokens));
    }
    if (this.options.compressionThreshold !== undefined) {
      args.push('--compression-threshold', String(this.options.compressionThreshold));
    }
    if (this.options.summarizationThreshold !== undefined) {
      args.push('--summarization-threshold', String(this.options.summarizationThreshold));
    }
    if (this.options.skills !== undefined && this.options.skills.length > 0) {
      args.push('--skills', this.options.skills.join(','));
    }
    if (this.options.skillSources !== undefined && this.options.skillSources.length > 0) {
      args.push('--skill-sources', this.options.skillSources.join(','));
    }
    if (this.options.installMissingSkills === true) {
      args.push('--install-missing-skills');
    }
    if (this.options.maxIterations !== undefined) {
      args.push('--max-iterations', String(this.options.maxIterations));
    }
    if (this.options.maxRuntime !== undefined) {
      args.push('--max-runtime', String(this.options.maxRuntime));
    }
    if (this.options.maxCost !== undefined) {
      args.push('--max-cost', String(this.options.maxCost));
    }
    if (this.options.sysPrompt !== undefined) {
      args.push('--sys-prompt', this.options.sysPrompt);
    }
    if (this.options.appendSysPrompt !== undefined) {
      args.push('--append-sys-prompt', this.options.appendSysPrompt);
    }
    if (this.options.model !== undefined) {
      args.push('--model', this.options.model);
    }
    if (this.options.temperature !== undefined) {
      args.push('--temperature', String(this.options.temperature));
    }
    if (this.options.yolo !== undefined) {
      args.push('--yolo', this.options.yolo);
    }
    if (this.options.yoloTimeout !== undefined) {
      args.push('--yolo-timeout', String(this.options.yoloTimeout));
    }
    if (this.options.addDir !== undefined && this.options.addDir.length > 0) {
      this.options.addDir.forEach((dir) => {
        args.push('--add-dir', dir);
      });
    }
    if (this.options.extraArgs !== undefined) {
      args.push(...this.options.extraArgs);
    }

    this.log(`CLI args: ${args.join(' ')}`);

    // Build environment variables to forward to CLI subprocess
    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    // Enable tool output streaming for SDK events
    env.AUTOHAND_STREAM_TOOL_OUTPUT = '1';
    if (this.options.envVars) {
      for (const [key, value] of Object.entries(this.options.envVars)) {
        if (value !== undefined) {
          env[key] = value;
        }
      }
    }

    this.process = spawn(cliPath, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });

    this.process.on('error', (error) => {
      this.log(`Process error: ${error.message}`);
      throw new Error(`Failed to start CLI: ${error.message}`);
    });

    this.process.on('exit', (code, signal) => {
      this.log(`Process exited: code=${code}, signal=${signal}`);
    });

    // Setup line reader for stdout
    const stdout = this.process.stdout;
    if (stdout === null) {
      throw new Error('Process stdout not available');
    }
    this.lineReader = new LineReader(stdout);
    void this.startReadingResponses();

    // Keep stderr out of the JSON-RPC stdout channel.
    this.process.stderr?.on('data', (data: Buffer) => {
      this.log(`STDERR: ${data.toString()}`);
    });

    // Wait for process to be ready
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  /**
   * Stop the CLI subprocess
   * 
   * Gracefully terminates the CLI process using SIGTERM and waits for exit.
   */
  async stop(): Promise<void> {
    if (this.process !== null) {
      const process = this.process;
      this.log('Stopping CLI process');
      process.kill('SIGTERM');
      
      // Wait for process to exit
      await new Promise((resolve) => {
        process.once('exit', resolve);
      });

      this.process = null;
      this.lineReader = null;
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
    if (!this.process) {
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

    // Create promise for response
    const responsePromise = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.requestCallbacks.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.options.timeout ?? 300000); // 5 minutes default

      this.requestCallbacks.set(id, (response) => {
        clearTimeout(timeout);
        if (this.isErrorResponse(response)) {
          const errorResponse = response as { error: { message: string } };
          reject(new Error(errorResponse.error.message));
        } else {
          const successResponse = response as { result: unknown };
          resolve(successResponse.result);
        }
      });
    });

    // Send request
    if (this.process.stdin) {
      this.process.stdin.write(JSON.stringify(request) + '\n');
    } else {
      throw new Error('Process stdin not available');
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

  /**
   * Start reading responses from stdout
   * 
   * Begins the loop that reads JSON-RPC responses from stdout
   * and dispatches them to the appropriate handlers.
   * 
   * @private
   */
  private async startReadingResponses(): Promise<void> {
    if (!this.lineReader) return;

    try {
      while (!this.lineReader.isClosed()) {
        const line = await this.lineReader.readLine();
        this.handleLine(line);
      }
    } catch (error) {
      this.log(`Error reading responses: ${error}`);
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
        const callback = this.requestCallbacks.get(response.id);
        if (callback) {
          this.requestCallbacks.delete(response.id);
          callback(response);
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
    return this.process !== null && !this.process.killed;
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
