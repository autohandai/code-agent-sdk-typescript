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
import type { ProviderName } from '../types/index.js';
import { LineReader } from './line-reader.js';
import * as path from 'path';
import * as os from 'os';

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
  /** Skill sources to search */
  skillSources?: string[];
  /** Whether to install missing skills from community */
  installMissingSkills?: boolean;

  // Permissions options
  /** Permission mode */
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto';
  /** Permission allow list */
  permissionAllowList?: string[];
  /** Permission deny list */
  permissionDenyList?: string[];

  // Provider-specific options
  /** Provider name (optional, auto-detected from model ID) */
  provider?: ProviderName | undefined;
  /** API key for the provider */
  apiKey?: string;
  /** Base URL for the provider API */
  baseUrl?: string;
  /** Port for local provider */
  port?: number;
}

export class Transport {
  private process: ChildProcess | null = null;
  private lineReader: LineReader | null = null;
  private requestCallbacks = new Map<number | string, (response: unknown) => void>();
  private notificationCallbacks = new Map<string, (params: unknown) => void>();
  private requestIdCounter = 0;
  private debug: boolean;
  private messageBuffer: string = '';

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

    this.log(`Starting CLI: ${cliPath}`);
    this.log(`Working directory: ${cwd}`);

    // Build CLI arguments
    const args = ['--mode', 'rpc'];

    if (this.options.unrestricted) {
      args.push('--unrestricted');
    }
    if (this.options.autoMode) {
      args.push('--auto-mode');
    }
    if (this.options.autoSkill) {
      args.push('--auto-skill');
    }
    if (this.options.autoCommit) {
      args.push('-c');
    }
    if (this.options.contextCompact === false) {
      args.push('--no-context-compact');
    } else if (this.options.contextCompact === true) {
      args.push('--context-compact');
    }
    if (this.options.persistSession) {
      args.push('--persist-session');
    }
    if (this.options.sessionId) {
      args.push('--session-id', this.options.sessionId);
    }
    if (this.options.resume) {
      args.push('--resume');
    }
    if (this.options.continue) {
      args.push('--continue');
    }
    if (this.options.sessionPath) {
      args.push('--session-path', this.options.sessionPath);
    }
    if (this.options.autoSaveInterval) {
      args.push('--auto-save-interval', String(this.options.autoSaveInterval));
    }
    if (this.options.agentsMdEnable === false) {
      args.push('--no-agents-md');
    } else if (this.options.agentsMdEnable === true) {
      args.push('--agents-md');
    }
    if (this.options.agentsMdCreate) {
      args.push('--agents-md-create');
    }
    if (this.options.agentsMdPath) {
      args.push('--agents-md-path', this.options.agentsMdPath);
    }
    if (this.options.agentsMdAutoUpdate) {
      args.push('--agents-md-auto-update');
    }
    if (this.options.maxTokens) {
      args.push('--max-tokens', String(this.options.maxTokens));
    }
    if (this.options.compressionThreshold) {
      args.push('--compression-threshold', String(this.options.compressionThreshold));
    }
    if (this.options.summarizationThreshold) {
      args.push('--summarization-threshold', String(this.options.summarizationThreshold));
    }
    if (this.options.skills && this.options.skills.length > 0) {
      args.push('--skills', this.options.skills.join(','));
    }
    if (this.options.skillSources && this.options.skillSources.length > 0) {
      args.push('--skill-sources', this.options.skillSources.join(','));
    }
    if (this.options.installMissingSkills) {
      args.push('--install-missing-skills');
    }
    if (this.options.permissionMode) {
      args.push('--permission-mode', this.options.permissionMode);
    }
    if (this.options.permissionAllowList && this.options.permissionAllowList.length > 0) {
      args.push('--permission-allow-list', this.options.permissionAllowList.join(','));
    }
    if (this.options.permissionDenyList && this.options.permissionDenyList.length > 0) {
      args.push('--permission-deny-list', this.options.permissionDenyList.join(','));
    }
    if (this.options.maxIterations) {
      args.push('--max-iterations', String(this.options.maxIterations));
    }
    if (this.options.maxRuntime) {
      args.push('--max-runtime', String(this.options.maxRuntime));
    }
    if (this.options.maxCost) {
      args.push('--max-cost', String(this.options.maxCost));
    }
    if (this.options.sysPrompt) {
      args.push('--sys-prompt', this.options.sysPrompt);
    }
    if (this.options.appendSysPrompt) {
      args.push('--append-sys-prompt', this.options.appendSysPrompt);
    }
    if (this.options.model) {
      args.push('--model', this.options.model);
    }
    if (this.options.temperature) {
      args.push('--temperature', String(this.options.temperature));
    }
    if (this.options.yolo) {
      args.push('--yolo', this.options.yolo);
    }
    if (this.options.yoloTimeout) {
      args.push('--yolo-timeout', String(this.options.yoloTimeout));
    }
    if (this.options.addDir && this.options.addDir.length > 0) {
      this.options.addDir.forEach((dir) => {
        args.push('--add-dir', dir);
      });
    }
    if (this.options.extraArgs) {
      args.push(...this.options.extraArgs);
    }

    this.log(`CLI args: ${args.join(' ')}`);

    this.process = spawn(cliPath, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.on('error', (error) => {
      this.log(`Process error: ${error.message}`);
      throw new Error(`Failed to start CLI: ${error.message}`);
    });

    this.process.on('exit', (code, signal) => {
      this.log(`Process exited: code=${code}, signal=${signal}`);
    });

    // Setup line reader for stdout
    this.lineReader = new LineReader(this.process.stdout!);
    this.lineReader.readLine().then(() => {
      this.startReadingResponses();
    });

    // Log stderr and parse events from debug logs
    this.process.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      this.log(`STDERR: ${output}`);
      this.parseStderrEvents(output);
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
    if (this.process) {
      this.log('Stopping CLI process');
      this.process.kill('SIGTERM');
      
      // Wait for process to exit
      await new Promise((resolve) => {
        this.process!.once('exit', resolve);
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
      reject(new Error('Process stdin not available'));
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
    const packagePath = path.join(__dirname, '../../cli', binaryName);
    
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
   * Parse events from stderr debug logs
   * 
   * Temporary workaround to extract event information from CLI debug logs.
   * This parses [RPC DEBUG] prefixed lines to reconstruct message content
   * and turn lifecycle events.
   * 
   * @param output - Stderr output to parse
   * @private
   */
  private parseStderrEvents(output: string): void {
    const lines = output.split('\n');
    for (const line of lines) {
      // Parse message content start
      const messageContentMatch = line.match(/\[RPC DEBUG\] Emitting message content: (.+)/);
      if (messageContentMatch?.[1]) {
        this.messageBuffer = messageContentMatch[1];
        continue;
      }

      // Accumulate additional message content lines (lines that don't start with [RPC DEBUG])
      if (this.messageBuffer && !line.startsWith('[RPC DEBUG]') && line.trim()) {
        this.messageBuffer += '\n' + line;
        continue;
      }

      // Parse Emitting MESSAGE_END - emit the accumulated message
      const messageEndMatch = line.match(/\[RPC DEBUG\] Emitting MESSAGE_END, messageId=(\w+)/);
      if (messageEndMatch) {
        const messageCallback = this.notificationCallbacks.get('message');
        if (messageCallback && this.messageBuffer) {
          messageCallback(this.messageBuffer);
        }
        const endCallback = this.notificationCallbacks.get('message_end');
        if (endCallback) {
          endCallback({ messageId: messageEndMatch[1], content: this.messageBuffer || '', timestamp: new Date().toISOString() });
        }
        this.messageBuffer = '';
        continue;
      }

      // Parse Emitting TURN_END
      const turnEndMatch = line.match(/\[RPC DEBUG\] Emitting TURN_END, turnId=(\w+)/);
      if (turnEndMatch) {
        const callback = this.notificationCallbacks.get('turn_end');
        if (callback) {
          callback({ turnId: turnEndMatch[1], timestamp: new Date().toISOString() });
        }
      }
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
}
