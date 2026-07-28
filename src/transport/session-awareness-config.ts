import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import type {
  AutohandEnvVars,
  SessionAwarenessTier,
} from '../types/index.js';

const CONFIG_FILENAMES = [
  'config.toml',
  'config.yaml',
  'config.yml',
  'config.json',
] as const;

export interface SessionAwarenessConfigSource {
  awareness: SessionAwarenessTier;
  configPath?: string;
  env?: Record<string, string>;
  envVars?: AutohandEnvVars;
}

export interface PreparedSessionAwarenessConfig {
  configPath: string;
  cleanup(): Promise<void>;
}

export class SessionAwarenessConfigFileError extends Error {
  readonly configPath: string;
  override readonly cause: unknown;

  constructor(configPath: string, cause: unknown) {
    super(`Failed to prepare session awareness from config: ${configPath}`);
    this.name = 'SessionAwarenessConfigFileError';
    this.configPath = configPath;
    this.cause = cause;
  }
}

/**
 * Build a private, short-lived CLI config with the SDK tier overlaid.
 *
 * The user's effective config is copied rather than mutated so concurrent SDK
 * instances may choose different awareness tiers safely.
 */
export async function prepareSessionAwarenessConfig(
  source: SessionAwarenessConfigSource,
): Promise<PreparedSessionAwarenessConfig> {
  const originalPath = await resolveConfigPath(source);
  const original = originalPath === undefined
    ? {}
    : await parseConfig(originalPath);
  const existingSessions = isRecord(original.sessions) ? original.sessions : {};
  const merged = {
    ...original,
    sessions: {
      ...existingSessions,
      awareness: source.awareness,
    },
  };
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'autohand-sdk-session-'));
  await fs.chmod(directory, 0o700);
  const configPath = path.join(directory, 'config.json');
  await fs.writeFile(configPath, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
  await fs.chmod(configPath, 0o600);

  return {
    configPath,
    cleanup: async () => {
      await fs.rm(directory, { recursive: true, force: true });
    },
  };
}

async function resolveConfigPath(
  source: SessionAwarenessConfigSource,
): Promise<string | undefined> {
  const explicit = source.configPath
    ?? source.envVars?.AUTOHAND_CONFIG
    ?? source.env?.AUTOHAND_CONFIG
    ?? process.env.AUTOHAND_CONFIG;
  if (explicit !== undefined && explicit !== '') {
    const resolved = path.resolve(expandHome(explicit));
    try {
      await fs.access(resolved);
      await assertNoDuplicateConfigFiles(path.dirname(resolved));
      return resolved;
    } catch (error) {
      throw new SessionAwarenessConfigFileError(resolved, error);
    }
  }

  const autohandHome = source.envVars?.AUTOHAND_HOME
    ?? source.env?.AUTOHAND_HOME
    ?? process.env.AUTOHAND_HOME
    ?? path.join(os.homedir(), '.autohand');
  const existing = await findConfigFiles(expandHome(autohandHome));
  if (existing.length > 1) {
    throw new SessionAwarenessConfigFileError(
      expandHome(autohandHome),
      new Error(`multiple config files found: ${existing.map((filePath) => path.basename(filePath)).sort().join(', ')}`),
    );
  }
  for (const filename of CONFIG_FILENAMES) {
    const candidate = path.join(expandHome(autohandHome), filename);
    if (existing.includes(candidate)) return candidate;
  }
  return undefined;
}

async function assertNoDuplicateConfigFiles(directory: string): Promise<void> {
  const existing = await findConfigFiles(directory);
  if (existing.length <= 1) return;
  throw new SessionAwarenessConfigFileError(
    directory,
    new Error(`multiple config files found: ${existing.map((filePath) => path.basename(filePath)).sort().join(', ')}`),
  );
}

async function findConfigFiles(directory: string): Promise<string[]> {
  const existing: string[] = [];
  for (const filename of CONFIG_FILENAMES) {
    const candidate = path.join(directory, filename);
    try {
      await fs.access(candidate);
      existing.push(candidate);
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw new SessionAwarenessConfigFileError(candidate, error);
      }
    }
  }
  return existing;
}

async function parseConfig(configPath: string): Promise<Record<string, unknown>> {
  try {
    const content = await fs.readFile(configPath, 'utf8');
    const extension = path.extname(configPath).toLowerCase();
    let value: unknown;
    if (extension === '.toml') {
      const toml = await import('toml');
      value = toml.parse(content);
    } else if (extension === '.yaml' || extension === '.yml') {
      const yaml = await import('yaml');
      value = yaml.parse(content);
    } else {
      value = JSON.parse(content);
    }
    if (!isRecord(value)) {
      throw new Error('config root must be an object');
    }
    return value;
  } catch (error) {
    if (error instanceof SessionAwarenessConfigFileError) throw error;
    throw new SessionAwarenessConfigFileError(configPath, error);
  }
}

function expandHome(value: string): string {
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingPathError(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}
