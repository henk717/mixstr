/**
 * relayMonitor.ts
 *
 * A lightweight singleton store for relay connection state and event publish log.
 * Lives at module scope so it survives hook re-renders and doesn't require React context.
 *
 * useSyncExternalStore requires snapshot functions to return stable references
 * between notifies. We cache frozen snapshots and only rebuild them when
 * state actually changes (inside notify()).
 */

export type RelayStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface RelayEntry {
  url: string;
  status: RelayStatus;
  /** ISO timestamp of last status change */
  lastSeen: string;
  /** Number of events received from this relay */
  eventsReceived: number;
  /** Whether this is a user-configured relay (pinned) or a gossip relay discovered via followed profiles' NIP-65 */
  type: 'pinned' | 'gossip';
}

export type EventLogKind = 'publish' | 'ok' | 'notice' | 'error' | 'auth';

export interface EventLogEntry {
  id: string;
  timestamp: string;
  kind: EventLogKind;
  relay: string;
  /** Short human-readable message */
  message: string;
  /** Optional detail (event id, notice content, etc.) */
  detail?: string;
}

// ── Mutable singleton state ───────────────────────────────────────────────

/** Current relay map: url → entry */
const relayMap = new Map<string, RelayEntry>();

/** URLs that have failed to connect this session — excluded from future routes */
const failedRelays = new Set<string>();

/** Bounded event log (newest first) */
const MAX_LOG = 200;
const eventLog: EventLogEntry[] = [];

/** Incrementing ID for log entries */
let logSeq = 0;

/** Subscribers — called whenever state changes */
const subscribers = new Set<() => void>();

// ── Stable snapshot cache (rebuilt on every notify()) ─────────────────────

// These are the values returned by getX() snapshot functions.
// useSyncExternalStore requires the same reference between notifies.

let relaysSnapshot: RelayEntry[] = [];
let eventLogSnapshot: EventLogEntry[] = [];
let connectedCountSnapshot = 0;
let totalCountSnapshot = 0;

function rebuildSnapshots() {
  const order: Record<RelayStatus, number> = { connected: 0, connecting: 1, disconnected: 2, error: 3 };
  const entries = [...relayMap.values()];
  entries.sort((a, b) => order[a.status] - order[b.status] || a.url.localeCompare(b.url));
  relaysSnapshot = entries;

  eventLogSnapshot = [...eventLog];

  let connected = 0;
  for (const e of relayMap.values()) {
    if (e.status === 'connected') connected++;
  }
  connectedCountSnapshot = connected;
  totalCountSnapshot = relayMap.size;
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Subscribe to state changes. Returns an unsubscribe function. */
export function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/** Stable snapshot of current relay list (sorted: connected first, then by url) */
export function getRelays(): RelayEntry[] {
  return relaysSnapshot;
}

/** Stable snapshot of event log (newest first) */
export function getEventLog(): EventLogEntry[] {
  return eventLogSnapshot;
}

/** Count of currently connected relays */
export function getConnectedCount(): number {
  return connectedCountSnapshot;
}

/** Total relay count (all states) */
export function getTotalCount(): number {
  return totalCountSnapshot;
}

/** Mark a relay as failed for this session so it can be replaced in routes */
export function markRelayFailed(url: string): void {
  if (!failedRelays.has(url)) {
    failedRelays.add(url);
    notify();
  }
}

/** Remove a relay from the failed set (e.g. it connected successfully) */
export function unmarkRelayFailed(url: string): void {
  if (failedRelays.has(url)) {
    failedRelays.delete(url);
    notify();
  }
}

/** Check whether a relay has been marked failed this session */
export function isRelayFailed(url: string): boolean {
  return failedRelays.has(url);
}

/** Snapshot of all failed relay URLs */
export function getFailedRelays(): readonly string[] {
  return [...failedRelays];
}

// ── Periodic retry of failed relays ───────────────────────────────────────

/**
 * Relays that fail on the first connection attempt are often just temporarily
 * unreachable (cold start, spotty network, DNS timeout). Re-trying them every
 * few minutes lets the pool refill slots that would otherwise stay empty for the
 * whole session.
 */
const FAILED_RELAY_RETRY_INTERVAL_MS = 5 * 60 * 1000;

setInterval(() => {
  if (failedRelays.size > 0) {
    console.log(`[RelayMonitor] Clearing ${failedRelays.size} failed relays for retry`);
    failedRelays.clear();
    notify();
  }
}, FAILED_RELAY_RETRY_INTERVAL_MS);

// ── Internal notify ───────────────────────────────────────────────────────

function notify() {
  // Rebuild stable snapshots BEFORE notifying subscribers,
  // so React sees fresh data on the same tick.
  rebuildSnapshots();
  for (const fn of subscribers) fn();
}

// ── Mutation helpers (called by NostrProvider) ─────────────────────────────

export function updateRelayStatus(
  url: string,
  status: RelayStatus,
  type: RelayEntry['type'],
) {
  const existing = relayMap.get(url);
  relayMap.set(url, {
    url,
    status,
    lastSeen: new Date().toISOString(),
    eventsReceived: existing?.eventsReceived ?? 0,
    type: existing?.type ?? type,
  });
  notify();
}

export function incrementRelayEvents(url: string) {
  const existing = relayMap.get(url);
  if (existing) {
    existing.eventsReceived++;
    // Batch via rAF to avoid notifying React on every inbound event
    scheduleBatchNotify();
  }
}

let batchNotifyScheduled = false;
function scheduleBatchNotify() {
  if (batchNotifyScheduled) return;
  batchNotifyScheduled = true;
  requestAnimationFrame(() => {
    batchNotifyScheduled = false;
    notify();
  });
}

export function addEventLog(
  kind: EventLogKind,
  relay: string,
  message: string,
  detail?: string,
) {
  const entry: EventLogEntry = {
    id: String(++logSeq),
    timestamp: new Date().toISOString(),
    kind,
    relay,
    message,
    detail,
  };
  eventLog.unshift(entry);
  if (eventLog.length > MAX_LOG) eventLog.length = MAX_LOG;
  notify();
}

/** Mark a relay as removed/gone (for gossip relays that rotate out) */
export function removeRelay(url: string) {
  if (relayMap.delete(url)) notify();
}

/**
 * Drop every relay that is not in the active set. This keeps the monitor's
 * total/connected counts in line with the relays the pool is actually using.
 */
export function syncRelayMap(activeUrls: Set<string>): void {
  let changed = false;
  for (const url of relayMap.keys()) {
    if (!activeUrls.has(url)) {
      relayMap.delete(url);
      changed = true;
    }
  }
  if (changed) notify();
}
