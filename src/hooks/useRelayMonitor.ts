import { useSyncExternalStore } from 'react';
import {
  subscribe,
  getRelays,
  getEventLog,
  getConnectedCount,
  getTotalCount,
  type RelayEntry,
  type EventLogEntry,
} from '@/lib/relayMonitor';

/**
 * Returns a live snapshot of the relay monitor state.
 * Uses useSyncExternalStore for concurrent-safe subscription.
 */
export function useRelayMonitor(): {
  relays: RelayEntry[];
  eventLog: EventLogEntry[];
  connectedCount: number;
  totalCount: number;
} {
  // Each selector is a separate subscription to avoid unnecessary object churn.
  const relays = useSyncExternalStore(subscribe, getRelays, getRelays);
  const eventLog = useSyncExternalStore(subscribe, getEventLog, getEventLog);
  const connectedCount = useSyncExternalStore(subscribe, getConnectedCount, getConnectedCount);
  const totalCount = useSyncExternalStore(subscribe, getTotalCount, getTotalCount);

  return { relays, eventLog, connectedCount, totalCount };
}
