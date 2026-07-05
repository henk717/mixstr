import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type NostrSigner, NostrEvent, NostrFilter, NPool, NRelay1 } from '@nostrify/nostrify';
import { NostrContext } from '@nostrify/react';
import { NUser, useNostrLogin } from '@nostrify/react/login';
import { useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';
import { useRelayGossip, getGossipRelays } from '@/hooks/useRelayGossip';
import {
  updateRelayStatus,
  addEventLog,
  incrementRelayEvents,
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
function RelayGossipSync({ gossipRelaysRef }: { gossipRelaysRef: React.RefObject<string[]> }) {
  useRelayGossip((relays) => {
    gossipRelaysRef.current = relays;
    console.log(`[RelayGossip] Updated gossip relays (${relays.length}):`, relays.slice(0, 5).join(', ') + (relays.length > 5 ? '…' : ''));
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

  // Patch the underlying WebSocket lifecycle.
  patchRelaySocket(relay, url, type);

  return relay;
}

/**
 * Monkey-patches a relay instance to intercept WebSocket events.
 */
function patchRelaySocket(relay: NRelay1, url: string, type: RelayEntry['type']) {
  try {
    relay.addEventListener('open', () => {
      updateRelayStatus(url, 'connected', type);
      addEventLog('ok', url, 'Connected');
    });

    relay.addEventListener('close', () => {
      updateRelayStatus(url, 'disconnected', type);
      addEventLog('error', url, 'Disconnected');
    });

    relay.addEventListener('notice', (e: Event) => {
      const detail = (e as CustomEvent).detail as string | undefined;
      addEventLog('notice', url, 'NOTICE', detail?.slice(0, 120));
    });

    // Count inbound events
    relay.addEventListener('event', () => {
      incrementRelayEvents(url);
    });
  } catch {
    console.warn('[RelayMonitor] Could not patch relay:', url);
  }
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

  // Gossip relays (top-N from NIP-65 scanning of followed profiles).
  // Stored in a ref so the reqRouter closure always reads the latest list
  // without recreating the pool.
  const gossipRelaysRef = useRef<string[]>(getGossipRelays());

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
      const readRelays = relayMetadataRef.current.relays
        .filter(r => r.read)
        .map(r => r.url);

      for (const url of readRelays) {
        routes.set(url, filters);
      }

      // Add gossip relays discovered via NIP-65 of followed profiles.
      // These are the top-N most common relays across everyone the user follows.
      // They supplement (never replace) the user's own relays.
      for (const url of gossipRelaysRef.current) {
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
      <RelayGossipSync gossipRelaysRef={gossipRelaysRef} />
      {children}
    </NostrContext.Provider>
  );
};

export default NostrProvider;
