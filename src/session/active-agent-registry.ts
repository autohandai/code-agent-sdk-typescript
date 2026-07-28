import { promises as fs } from 'fs';
import path from 'path';
import type { ActiveAgentRecord } from '../types/index.js';
import { parseActiveAgentRecord } from '../validation/active-agent-record.js';

export const ACTIVE_AGENT_STALE_MS = 15_000;

export interface ActiveAgentRegistryReaderDependencies {
  now?: () => Date;
  isPidAlive?: (pid: number) => boolean;
}

export class ActiveAgentRegistryReadError extends Error {
  readonly path: string;
  override readonly cause: unknown;

  constructor(filePath: string, cause: unknown) {
    super(`Failed to read active-agent registry path: ${filePath}`);
    this.name = 'ActiveAgentRegistryReadError';
    this.path = filePath;
    this.cause = cause;
  }
}

/**
 * Read-only SDK view of CLI-3's active-agent registry.
 *
 * Invalid, stale, and dead records are ignored. Cleanup remains owned by CLI-3.
 */
export class ActiveAgentRegistryReader {
  private readonly now: () => Date;
  private readonly isPidAlive: (pid: number) => boolean;

  constructor(
    private readonly directory: string,
    dependencies: ActiveAgentRegistryReaderDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date());
    this.isPidAlive = dependencies.isPidAlive ?? isProcessAlive;
  }

  async listActive(
    workspaceRoot?: string,
    ownSessionId?: string,
  ): Promise<ActiveAgentRecord[]> {
    let filenames: string[];
    try {
      filenames = await fs.readdir(this.directory);
    } catch (error) {
      if (isMissingPathError(error)) return [];
      throw new ActiveAgentRegistryReadError(this.directory, error);
    }

    const normalizedWorkspace = workspaceRoot === undefined
      ? undefined
      : path.resolve(workspaceRoot);
    const records = await Promise.all(filenames
      .filter((filename) => filename.endsWith('.json'))
      .map((filename) => this.readRecord(path.join(this.directory, filename))));

    return records
      .filter((record): record is ActiveAgentRecord => record !== undefined)
      .filter((record) => ownSessionId === undefined || record.sessionId !== ownSessionId)
      .filter((record) => normalizedWorkspace === undefined
        || path.resolve(record.workspaceRoot) === normalizedWorkspace)
      .sort(compareActiveAgentRecords);
  }

  private async readRecord(filePath: string): Promise<ActiveAgentRecord | undefined> {
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      if (isMissingPathError(error)) return undefined;
      throw new ActiveAgentRegistryReadError(filePath, error);
    }
    let value: unknown;
    try {
      value = JSON.parse(content);
    } catch {
      return undefined;
    }
    const record = parseActiveAgentRecord(value);
    if (record === undefined || this.isStale(record)) return undefined;
    return record;
  }

  private isStale(record: ActiveAgentRecord): boolean {
    if (!this.isPidAlive(record.pid)) return true;
    const updatedAt = Date.parse(record.updatedAt);
    return !Number.isFinite(updatedAt)
      || this.now().getTime() - updatedAt > ACTIVE_AGENT_STALE_MS;
  }
}

function compareActiveAgentRecords(
  left: ActiveAgentRecord,
  right: ActiveAgentRecord,
): number {
  const updatedDifference = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  return updatedDifference === 0
    ? left.sessionId.localeCompare(right.sessionId)
    : updatedDifference;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isRecord(error) && error.code === 'EPERM';
  }
}

function isMissingPathError(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
