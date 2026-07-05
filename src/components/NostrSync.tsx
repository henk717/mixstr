import { useEffect } from 'react';
import { useNostr } from '@nostrify/react';
import { useNostrLogin } from '@nostrify/react/login';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { parseBlossomServerList } from '@/lib/appBlossom';

/**
 * NostrSync — syncs user NIP-65 relay list + Blossom servers on login.
 *
 * Relay bootstrap order (inbox/outbox model):
 *  1. NIP-07 extension: call window.nostr.getRelays() directly — no relay
 *     connection required. This gives us a relay list immediately.
 *  2. Query the user's NIP-65 kind 10002 event from those relays to get
 *     their canonical relay list, and replace the extension list if newer.
 *  3. Fall back to whatever relays are already in AppConfig (set by the
 *     user via the setup screen or Settings).
 */
export function NostrSync() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { logins } = useNostrLogin();
  const { config, updateConfig } = useAppContext();

  // ── Step 1: import relays from NIP-07 extension immediately on login ──
  useEffect(() => {
    const login = logins[0];
    if (!login || login.type !== 'extension') return;

    // Only auto-import when we have no relays configured yet
    if (config.relayMetadata.relays.length > 0) return;

    const importExtensionRelays = async () => {
      try {
        // NIP-07 standard: window.nostr.getRelays() → Record<url, {read,write}>
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
    // Need at least one relay to query
    if (config.relayMetadata.relays.length === 0) return;

    const syncRelaysFromNostr = async () => {
      try {
        const events = await nostr.query(
          [{ kinds: [10002], authors: [user.pubkey], limit: 1 }],
          { signal: AbortSignal.timeout(5000) }
        );

        if (events.length > 0) {
          const event = events[0];

          // Only update if the event is newer than our stored data
          if (event.created_at > config.relayMetadata.updatedAt) {
            const fetchedRelays = event.tags
              .filter(([name]) => name === 'r')
              .map(([_, url, marker]) => ({
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
        }
      } catch (error) {
        console.error('[NostrSync] Failed to sync NIP-65 relays:', error);
      }
    };

    syncRelaysFromNostr();
  // Re-run when relays become available (e.g. after extension import above)
  }, [user, config.relayMetadata.updatedAt, config.relayMetadata.relays.length, nostr, updateConfig]);

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
