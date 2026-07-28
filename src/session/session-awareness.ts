import type {
  ActiveAgentRecord,
  SessionAwarenessTier,
  SessionPeerEvent,
} from '../types/index.js';

export const SESSION_AWARENESS_POLL_INTERVAL_MS = 5_000;
const SESSION_AWARENESS_TIERS: readonly SessionAwarenessTier[] = [
  'passive',
  'warn',
  'coordinate',
];

export class SessionAwarenessConfigError extends Error {
  constructor(tier: unknown) {
    super(`Unsupported session awareness tier: ${String(tier)}`);
    this.name = 'SessionAwarenessConfigError';
  }
}

export function validateSessionAwarenessTier(
  tier: unknown,
): asserts tier is SessionAwarenessTier {
  if (!SESSION_AWARENESS_TIERS.includes(tier as SessionAwarenessTier)) {
    throw new SessionAwarenessConfigError(tier);
  }
}

export interface ActiveAgentReader {
  listActive(
    workspaceRoot?: string,
    ownSessionId?: string,
  ): Promise<ActiveAgentRecord[]>;
}

export interface SessionAwarenessMonitorOptions {
  workspaceRoot: string;
  ownSessionId?: string;
  ownPid?: number;
  reader: ActiveAgentReader;
  onEvent: (event: SessionPeerEvent) => void;
  onError: (error: SessionAwarenessRuntimeError) => void;
  now?: () => Date;
  pollIntervalMs?: number;
}

export class SessionAwarenessRuntimeError extends Error {
  readonly operation: 'initial_read' | 'poll';
  override readonly cause: unknown;

  constructor(operation: 'initial_read' | 'poll', cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'SessionAwarenessRuntimeError';
    this.operation = operation;
    this.cause = cause;
  }
}

/** Diffs the shared registry into ordered SDK peer lifecycle events. */
export class SessionAwarenessMonitor {
  private readonly workspaceRoot: string;
  private ownSessionId: string | undefined;
  private ownPid: number | undefined;
  private readonly reader: ActiveAgentReader;
  private readonly onEvent: (event: SessionPeerEvent) => void;
  private readonly onError: (error: SessionAwarenessRuntimeError) => void;
  private readonly now: () => Date;
  private readonly pollIntervalMs: number;
  private readonly peers = new Map<string, ActiveAgentRecord>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private refreshPromise: Promise<ActiveAgentRecord[]> | undefined;
  private lifecycleVersion = 0;

  constructor(options: SessionAwarenessMonitorOptions) {
    this.workspaceRoot = options.workspaceRoot;
    this.ownSessionId = options.ownSessionId;
    this.ownPid = options.ownPid;
    this.reader = options.reader;
    this.onEvent = options.onEvent;
    this.onError = options.onError;
    this.now = options.now ?? (() => new Date());
    this.pollIntervalMs = options.pollIntervalMs ?? SESSION_AWARENESS_POLL_INTERVAL_MS;
  }

  async start(): Promise<void> {
    if (this.timer !== undefined) return;
    const lifecycleVersion = this.lifecycleVersion;
    await this.refresh().catch((error: unknown) => {
      this.onError(new SessionAwarenessRuntimeError('initial_read', error));
      return this.getPeers();
    });
    if (lifecycleVersion !== this.lifecycleVersion) return;
    this.timer = setInterval(() => {
      void this.refresh().catch((error: unknown) => {
        this.onError(new SessionAwarenessRuntimeError('poll', error));
      });
    }, this.pollIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    this.lifecycleVersion += 1;
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.peers.clear();
  }

  setOwnSessionId(sessionId: string): void {
    this.ownSessionId = sessionId;
    this.peers.delete(sessionId);
  }

  setOwnPid(pid: number | undefined): void {
    this.ownPid = pid;
    if (pid === undefined) return;
    for (const [sessionId, peer] of this.peers) {
      if (peer.pid === pid) this.peers.delete(sessionId);
    }
  }

  async refresh(): Promise<ActiveAgentRecord[]> {
    if (this.refreshPromise !== undefined) return this.refreshPromise;
    const operation = this.refreshOnce(this.lifecycleVersion);
    this.refreshPromise = operation;
    try {
      return await operation;
    } finally {
      if (this.refreshPromise === operation) this.refreshPromise = undefined;
    }
  }

  getPeers(): ActiveAgentRecord[] {
    return [...this.peers.values()]
      .sort((left, right) => {
        const updatedDifference = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
        return updatedDifference === 0
          ? left.sessionId.localeCompare(right.sessionId)
          : updatedDifference;
      });
  }

  private async refreshOnce(lifecycleVersion: number): Promise<ActiveAgentRecord[]> {
    const records = await this.reader.listActive(this.workspaceRoot, this.ownSessionId);
    if (lifecycleVersion !== this.lifecycleVersion) return this.getPeers();
    const current = new Map(records
      .filter((peer) => peer.sessionId !== this.ownSessionId && peer.pid !== this.ownPid)
      .map((peer) => [peer.sessionId, peer]));
    const timestamp = this.now().toISOString();

    for (const [sessionId, peer] of current) {
      const previous = this.peers.get(sessionId);
      if (previous === undefined) {
        this.onEvent({ type: 'session_peer_joined', peer, timestamp });
      } else if (peerFingerprint(peer) !== peerFingerprint(previous)) {
        this.onEvent({
          type: 'session_peer_updated',
          peer,
          previous,
          timestamp,
        });
      }
    }
    for (const [sessionId, peer] of this.peers) {
      if (!current.has(sessionId)) {
        this.onEvent({ type: 'session_peer_left', peer, timestamp });
      }
    }

    this.peers.clear();
    for (const [sessionId, peer] of current) this.peers.set(sessionId, peer);
    return this.getPeers();
  }
}

function peerFingerprint(peer: ActiveAgentRecord): string {
  return JSON.stringify({
    status: peer.status,
    model: peer.model,
    messageCount: peer.messageCount,
    contextPercent: peer.contextPercent,
    tokensUsed: peer.tokensUsed,
    tokensUsageStatus: peer.tokensUsageStatus,
    sessionTokensUsed: peer.sessionTokensUsed,
    activity: peer.activity,
  });
}
