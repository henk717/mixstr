import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type NostrSigner, NostrEvent, NostrFilter, NPool, NRelay1 } from '@nostrify/nostrify';
import { NostrContext } from '@nostrify/react';
import { NUser, useNostrLogin } from '@nostrify/react/login';
import { useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';
import { useRelayGossip, getGossipCandidates, GOSSIP_RELAY_LIMIT } from '@/hooks/useRelayGossip';
import {
  updateRelayStatus,
  addEventLog,
  incrementRelayEvents,
  markRelayFailed,
  unmarkRelayFailed,
  isRelayFailed,
  type RelayEntry,
} from '@/lib/relayMonitor';

interface NostrProviderProps {
  children: React.ReactNode;
}

/**
 * RelayGossipSync — mounted inside the NostrContext.Provider so it can call
 * useNostr() without violating the "must be within a NostrProvider" rule.
 * It drives the gossip relay scanning and updates the pool's gossipRelaysRef.
 */
function RelayGossipSync({ gossipCandidatesRef }: { gossipCandidatesRef: React.RefObject<string[]> }) {
  useRelayGossip((candidates) => {
    gossipCandidatesRef.current = candidates;
    console.log(`[RelayGossip] Updated gossip candidates (${candidates.length}):`, candidates.slice(0, 5).join(', ') + (candidates.length > 5 ? '…' : ''));
  });
  return null;
}

/**
 * Creates an instrumented NRelay1 that reports connection status and events
 * to the relay monitor singleton.
 */
function createInstrumentedRelay(
  url: string,
  type: RelayEntry['type'],
  authCallback: (challenge: string) => Promise<NostrEvent>,
): NRelay1 {
  updateRelayStatus(url, 'connecting', type);

  const relay = new NRelay1(url, {
    auth: async (challenge: string) => {
      addEventLog('auth', url, 'AUTH challenge received', challenge.slice(0, 32));
      try {
        const event = await authCallback(challenge);
        addEventLog('ok', url, 'AUTH signed and sent');
        return event;
      } catch (err) {
        addEventLog('error', url, 'AUTH failed', String(err));
        throw err;
      }
    },
  });

  // Patch the relay so the monitor stays in sync with its actual socket state.
  instrumentRelay(relay, url, type);

  return relay;
}

/** Relays currently being monitored for health/status changes. */
const monitoredRelays = new Map<string, NRelay1>();
const relayTypes = new Map<string, RelayEntry['type']>();

/** Relays that have successfully connected at least once this session. */
const connectedThisSession = new Set<string>();

/** Tracks sockets we've already patched so we don't leak duplicate listeners. */
const patchedSockets = new WeakSet<object>();

let relaySyncInterval: ReturnType<typeof setInterval> | undefined;

type WsSocket = {
  readyState: number;
  addEventListener(type: string, listener: (this: unknown, ev: unknown) => void): void;
};

function getSocket(relay: NRelay1): WsSocket {
  return relay.socket as unknown as WsSocket;
}

/**
 * Attaches lifecycle listeners to a relay's underlying WebSocket wrapper and
 * keeps a weak reference so re-connections are reported correctly.
 */
function instrumentRelay(relay: NRelay1, url: string, type: RelayEntry['type']) {
  monitoredRelays.set(url, relay);
  relayTypes.set(url, type);
  patchRelaySocket(relay, url, type);
  patchRelayReq(relay, url);
  startRelayStatusSync();
}

/**
 * Monkey-patches the relay's underlying WebSocket wrapper to report lifecycle
 * to the relay monitor singleton. The `Websocket` wrapper persists across
 * reconnects, so listeners attached here stay attached.
 */
function patchRelaySocket(relay: NRelay1, url: string, type: RelayEntry['type']) {
  const socket = getSocket(relay);
  if (patchedSockets.has(socket)) return;
  patchedSockets.add(socket);

  const setConnected = () => {
    connectedThisSession.add(url);
    unmarkRelayFailed(url);
    updateRelayStatus(url, 'connected', type);
    addEventLog('ok', url, 'Connected');
  };

  const setDisconnected = () => {
    // A relay that never managed to connect is treated as failed for this
    // session so the router can replace it with the next gossip candidate.
    if (!connectedThisSession.has(url)) {
      markRelayFailed(url);
    }
    updateRelayStatus(url, 'disconnected', type);
    addEventLog('error', url, 'Disconnected');
  };

  const setError = () => {
    if (!connectedThisSession.has(url)) {
      markRelayFailed(url);
    }
    updateRelayStatus(url, 'error', type);
    addEventLog('error', url, 'Connection error');
  };

  try {
    socket.addEventListener('open', setConnected);
    socket.addEventListener('reconnect', setConnected);
    socket.addEventListener('close', setDisconnected);
    socket.addEventListener('error', setError);

    // If the socket is already open when we arrive, mark it immediately.
    if (socket.readyState === WebSocket.OPEN) {
      setConnected();
    }
  } catch {
    console.warn('[RelayMonitor] Could not patch relay socket:', url);
  }
}

/**
 * Starts a single background interval that polls the readyState of every
 * monitored relay. This catches reconnects after idle timeouts / spotty
 * networks and prevents the indicator from getting stuck on stale states.
 */
function startRelayStatusSync() {
  if (relaySyncInterval) return;

  relaySyncInterval = setInterval(() => {
    for (const [url, relay] of monitoredRelays) {
      const type = relayTypes.get(url);
      if (!type) continue;

      // NRelay1 can replace its socket wrapper after an idle timeout; make
      // sure any new wrapper also gets patched, then reflect its readyState.
      patchRelaySocket(relay, url, type);

      try {
        const socket = getSocket(relay);
        if (socket.readyState === WebSocket.OPEN) {
          updateRelayStatus(url, 'connected', type);
        }
      } catch {
        // ignore
      }
    }
  }, 1500);
}

/**
 * Counts every EVENT message this relay yields. This is more reliable than
 * trying to parse raw WebSocket frames, and it survives socket reconnects.
 */
function patchRelayReq(relay: NRelay1, url: string) {
  const originalReq = relay.req.bind(relay);

  const wrappedReq = async function* (
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ) {
    for await (const msg of originalReq(filters, opts)) {
      if (Array.isArray(msg) && msg[0] === 'EVENT') {
        incrementRelayEvents(url);
      }
      yield msg;
    }
  };

  relay.req = wrappedReq as unknown as typeof relay.req;
}

const NostrProvider: React.FC<NostrProviderProps> = (props) => {
  const { children } = props;
  const { config } = useAppContext();
  const { logins } = useNostrLogin();

  const queryClient = useQueryClient();

  // Use refs so the pool callbacks always see the latest data without
  // recreating the pool. The refs are written from effects (never during
  // render) to satisfy React's purity rules.
  const relayMetadataRef = useRef(config.relayMetadata);

  // Gossip relay candidates sorted by popularity. NostrProvider slices from
  // this list, skipping candidates that have failed to connect this session.
  // Stored in a ref so the reqRouter closure always reads the latest list
  // without recreating the pool.
  const gossipCandidatesRef = useRef<string[]>(getGossipCandidates());

  // Stable ref to the current user's signer for NIP-42 AUTH.
  const signerRef = useRef<NostrSigner | undefined>(undefined);

  // Lazily create the pool once, via useState's initializer.
  // eslint-disable-next-line react-hooks/refs
  const [pool] = useState<NPool>(() => new NPool({
    open(url: string) {
      // Determine type: pinned (user's own relays) or gossip (from follows).
      const pinnedUrls = relayMetadataRef.current.relays.map(r => r.url);
      const type: RelayEntry['type'] = pinnedUrls.includes(url) ? 'pinned' : 'gossip';

      return createInstrumentedRelay(url, type, async (challenge: string) => {
        const signer = signerRef.current;
        if (!signer) {
          throw new Error('AUTH failed: no signer available (user not logged in)');
        }
        return signer.signEvent({
          kind: 22242,
          content: '',
          tags: [
            ['relay', url],
            ['challenge', challenge],
          ],
          created_at: Math.floor(Date.now() / 1000),
        });
      });
    },
    reqRouter(filters: NostrFilter[]) {
      const routes = new Map<string, NostrFilter[]>();

      // Route to all configured read relays (user's own NIP-65 list).
      const pinnedRelays = relayMetadataRef.current.relays;
      const pinnedUrls = new Set(pinnedRelays.map(r => r.url));
      const readRelays = pinnedRelays
        .filter(r => r.read)
        .map(r => r.url);

      for (const url of readRelays) {
        routes.set(url, filters);
      }

      // Fill the remaining slots with gossip candidates, skipping any that
      // have failed to connect this session. If a high-ranking candidate
      // fails, the next one in the list takes its place.
      const gossipSlots = Math.max(0, GOSSIP_RELAY_LIMIT - pinnedRelays.length);
      const activeGossip: string[] = [];

      for (const url of gossipCandidatesRef.current) {
        if (activeGossip.length >= gossipSlots) break;
        if (pinnedUrls.has(url)) continue;
        if (isRelayFailed(url)) continue;
        activeGossip.push(url);
      }

      for (const url of activeGossip) {
        if (!routes.has(url)) {
          routes.set(url, filters);
        }
      }

      return routes;
    },
    eventRouter(_event: NostrEvent) {
      const writeRelays = relayMetadataRef.current.relays
        .filter(r => r.write)
        .map(r => r.url);

      return [...new Set<string>(writeRelays)];
    },
    // 4 seconds: enough time for slow relays to send EOSE without hanging forever.
    eoseTimeout: 4000,
  }));

  // Instrument pool.event() to log publish attempts and outcomes.
  useEffect(() => {
    const originalEvent = pool.event.bind(pool);
    pool.event = async (event: NostrEvent, opts?: { signal?: AbortSignal }) => {
      addEventLog(
        'publish',
        '(all write relays)',
        `Publishing kind ${event.kind}`,
        event.id?.slice(0, 16),
      );
      try {
        await originalEvent(event, opts);
        addEventLog('ok', '(all write relays)', `Published kind ${event.kind} OK`, event.id?.slice(0, 16));
      } catch (err) {
        addEventLog('error', '(all write relays)', `Publish failed: ${String(err)}`, event.id?.slice(0, 16));
        throw err;
      }
    };
    // No cleanup needed — pool lives for the app lifetime
  }, [pool]);

  // Derive the current signer from the active login.
  const currentLogin = logins[0];
  const currentSigner = useMemo(() => {
    if (!currentLogin) return undefined;
    try {
      switch (currentLogin.type) {
        case 'nsec':
          return NUser.fromNsecLogin(currentLogin).signer;
        case 'bunker':
          return NUser.fromBunkerLogin(currentLogin, pool).signer;
        case 'extension':
          return NUser.fromExtensionLogin(currentLogin).signer;
        default:
          return undefined;
      }
    } catch {
      return undefined;
    }
  }, [currentLogin, pool]);

  // Keep the signer ref in sync.
  useEffect(() => {
    signerRef.current = currentSigner;
  }, [currentSigner]);

  // Invalidate Nostr queries when relay metadata changes.
  useEffect(() => {
    relayMetadataRef.current = config.relayMetadata;
    queryClient.invalidateQueries({ queryKey: ['nostr'] });
  }, [config.relayMetadata, queryClient]);

  const contextValue = useMemo(() => ({ nostr: pool }), [pool]);

  return (
    <NostrContext.Provider value={contextValue}>
      {/* RelayGossipSync is a child of NostrContext.Provider so it can safely
          call useNostr() without the "must be within a NostrProvider" error. */}
      <RelayGossipSync gossipCandidatesRef={gossipCandidatesRef} />
      {children}
    </NostrContext.Provider>
  );
};

export default NostrProvider;
