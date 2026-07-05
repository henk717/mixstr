import { useEffect, useRef } from 'react';
import { NPool, NRelay1 } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useNostrLogin } from '@nostrify/react/login';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { parseBlossomServerList } from '@/lib/appBlossom';

/**
 * Well-known bootstrap relays used ONLY to fetch the user's NIP-65 kind 10002
 * event when no relays are configured yet.  These are never stored in AppConfig
 * and never shown in the relay indicator — they are discarded once the real
 * relay list is fetched.
 */
const BOOTSTRAP_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.nostr.band',
  'wss://relay.ditto.pub',
];

/**
 * NostrSync — syncs user NIP-65 relay list + Blossom servers on login.
 *
 * Relay bootstrap order (inbox/outbox model):
 *  1. NIP-07 extension: call window.nostr.getRelays() directly — gives us a
 *     relay list immediately without any network round-trip.
 *  2. Query the user's NIP-65 kind 10002 event:
 *     - If we already have configured relays, query those.
 *     - If we have NO relays yet (fresh login / nsec), open temporary
 *       connections to BOOTSTRAP_RELAYS, fetch, then close them. The result
 *       is written to AppConfig and the temporary relays are discarded.
 *  3. The user's configured relays (from step 1 or 2) are now the sole source
 *     of truth — no permanent fallbacks are added to the pool.
 */
export function NostrSync() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { logins } = useNostrLogin();
  const { config, updateConfig } = useAppContext();

  // Track whether we have already triggered the bootstrap fetch for this user
  // so we don't re-run it on every render while awaiting the result.
  const bootstrapTriggeredRef = useRef<string | null>(null);

  // ── Step 1: import relays from NIP-07 extension immediately on login ──
  useEffect(() => {
    const login = logins[0];
    if (!login || login.type !== 'extension') return;

    // Only auto-import when we have no relays configured yet
    if (config.relayMetadata.relays.length > 0) return;

    const importExtensionRelays = async () => {
      try {
        const ext = (window as unknown as { nostr?: { getRelays?: () => Promise<Record<string, { read: boolean; write: boolean }>> } }).nostr;
        if (!ext?.getRelays) return;

        const relayMap = await ext.getRelays();
        const relays = Object.entries(relayMap).map(([url, { read, write }]) => ({
          url,
          read,
          write,
        }));

        if (relays.length > 0) {
          console.log('[NostrSync] Imported relays from NIP-07 extension:', relays);
          updateConfig((current) => ({
            ...current,
            relayMetadata: {
              relays,
              updatedAt: Math.floor(Date.now() / 1000),
            },
          }));
        }
      } catch (err) {
        console.warn('[NostrSync] Could not read relays from NIP-07 extension:', err);
      }
    };

    importExtensionRelays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logins]);

  // ── Step 2: sync NIP-65 relay list (kind 10002) from relays ──
  useEffect(() => {
    if (!user) return;

    const syncRelaysFromNostr = async () => {
      let queryNostr = nostr;

      if (config.relayMetadata.relays.length === 0) {
        // No relays configured yet — open a temporary pool to bootstrap relays.
        // Guard so we only kick off one bootstrap per user pubkey.
        if (bootstrapTriggeredRef.current === user.pubkey) return;
        bootstrapTriggeredRef.current = user.pubkey;

        console.log('[NostrSync] No relays configured — bootstrapping via well-known relays');
        const bootstrapPool = new NPool({
          open: (url: string) => new NRelay1(url),
          reqRouter: (filters) => {
            const map = new Map<string, typeof filters>();
            for (const url of BOOTSTRAP_RELAYS) map.set(url, filters);
            return map;
          },
          eventRouter: () => [],
        });
        queryNostr = bootstrapPool;
      }

      try {
        const events = await queryNostr.query(
          [{ kinds: [10002], authors: [user.pubkey], limit: 1 }],
          { signal: AbortSignal.timeout(8000) }
        );

        if (events.length > 0) {
          const event = events[0];

          // Only update if the event is newer than our stored data
          if (event.created_at > config.relayMetadata.updatedAt) {
            const fetchedRelays = event.tags
              .filter(([name]) => name === 'r')
              .map(([, url, marker]) => ({
                url,
                read: !marker || marker === 'read',
                write: !marker || marker === 'write',
              }));

            if (fetchedRelays.length > 0) {
              console.log('[NostrSync] Synced NIP-65 relay list from Nostr:', fetchedRelays);
              updateConfig((current) => ({
                ...current,
                relayMetadata: {
                  relays: fetchedRelays,
                  updatedAt: event.created_at,
                },
              }));
            }
          }
        } else if (config.relayMetadata.relays.length === 0) {
          console.log('[NostrSync] No NIP-65 event found for user via bootstrap relays');
        }
      } catch (error) {
        console.error('[NostrSync] Failed to sync NIP-65 relays:', error);
      }
    };

    syncRelaysFromNostr();
  // Re-run when user changes or relays become available (e.g. after extension import)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.pubkey, config.relayMetadata.updatedAt, config.relayMetadata.relays.length]);

  // ── Step 3: sync Blossom server list (kind 10063) ──
  useEffect(() => {
    if (!user) return;
    if (config.relayMetadata.relays.length === 0) return;

    const syncBlossomServersFromNostr = async () => {
      try {
        const events = await nostr.query(
          [{ kinds: [10063], authors: [user.pubkey], limit: 1 }],
          { signal: AbortSignal.timeout(5000) }
        );

        if (events.length > 0) {
          const event = events[0];

          if (event.created_at > config.blossomServerMetadata.updatedAt) {
            const fetchedServers = parseBlossomServerList(event);

            if (fetchedServers.length > 0) {
              console.log('[NostrSync] Synced Blossom server list from Nostr:', fetchedServers);
              updateConfig((current) => ({
                ...current,
                blossomServerMetadata: {
                  servers: fetchedServers,
                  updatedAt: event.created_at,
                },
              }));
            }
          }
        }
      } catch (error) {
        console.error('[NostrSync] Failed to sync Blossom servers:', error);
      }
    };

    syncBlossomServersFromNostr();
  }, [user, config.blossomServerMetadata.updatedAt, config.relayMetadata.relays.length, nostr, updateConfig]);

  return null;
}
