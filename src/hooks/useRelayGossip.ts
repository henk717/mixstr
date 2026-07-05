import { useEffect, useRef, useCallback } from 'react';
import { useNostr } from '@nostrify/react';

/**
 * Maximum number of gossip relays we add on top of the user's own relays.
 * These come from scanning NIP-65 (kind 10002) events of profiles we encounter.
 */
export const GOSSIP_RELAY_LIMIT = 50;

/**
 * How often (ms) we score and trim the gossip relay set.
 */
const SCORE_INTERVAL = 60_000; // 1 minute

/**
 * How often (ms) we batch-fetch kind 10002 for unseen pubkeys.
 */
const FETCH_INTERVAL = 30_000; // 30 seconds

/**
 * Maximum batch size for kind-10002 queries.
 */
const BATCH_SIZE = 100;

// ── Shared singleton state (module-level so it survives hook re-renders) ────

/** Pubkeys we have seen but not yet fetched a kind-10002 for */
const pendingPubkeys = new Set<string>();
/** Pubkeys we have already fetched */
const fetchedPubkeys = new Set<string>();
/** relay URL → score (number of profiles that list this relay) */
const relayScores = new Map<string, number>();
/** Current top-N gossip relay list (read by NostrProvider) */
let gossipRelays: string[] = [];

/** Register that a pubkey has been "seen" (call whenever you render an event) */
export function registerGossipPubkey(pubkey: string) {
  if (!fetchedPubkeys.has(pubkey)) {
    pendingPubkeys.add(pubkey);
  }
}

/** Returns the current gossip relay list (snapshot at call time) */
export function getGossipRelays(): string[] {
  return gossipRelays;
}

/** Recompute and trim gossip relay list from scores */
function rebuildGossipRelays() {
  const sorted = [...relayScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, GOSSIP_RELAY_LIMIT)
    .map(([url]) => url);
  gossipRelays = sorted;
}

/**
 * useRelayGossip
 *
 * Mount this once (in NostrProvider or App).  It:
 *  1. Periodically drains `pendingPubkeys` in batches, querying kind 10002.
 *  2. Scores each relay URL by how many profiles declare it.
 *  3. Rebuilds the `gossipRelays` list (top-N).
 *  4. Calls `onUpdate` whenever the list changes, so the pool can be reconfigured.
 */
export function useRelayGossip(onUpdate: (relays: string[]) => void) {
  const { nostr } = useNostr();
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const previousListRef = useRef<string>('');

  const doFetch = useCallback(async () => {
    if (pendingPubkeys.size === 0) return;

    // Take a batch
    const batch = [...pendingPubkeys].slice(0, BATCH_SIZE);

    // Mark as fetched (optimistic — even if network fails we won't retry spam)
    for (const pk of batch) {
      pendingPubkeys.delete(pk);
      fetchedPubkeys.add(pk);
    }

    try {
      const events = await nostr.query(
        [{ kinds: [10002], authors: batch, limit: batch.length }],
        { signal: AbortSignal.timeout(8_000) },
      );

      for (const event of events) {
        for (const tag of event.tags) {
          if (tag[0] === 'r' && typeof tag[1] === 'string') {
            const url = tag[1].replace(/\/$/, ''); // normalise trailing slash
            if (url.startsWith('wss://') || url.startsWith('ws://')) {
              relayScores.set(url, (relayScores.get(url) ?? 0) + 1);
            }
          }
        }
      }
    } catch {
      // Ignore network errors — we'll try remaining pending pubkeys later
    }
  }, [nostr]);

  const doScore = useCallback(() => {
    rebuildGossipRelays();
    const key = gossipRelays.join(',');
    if (key !== previousListRef.current) {
      previousListRef.current = key;
      onUpdateRef.current([...gossipRelays]);
    }
  }, []);

  useEffect(() => {
    const fetchId = setInterval(() => { void doFetch(); }, FETCH_INTERVAL);
    const scoreId = setInterval(doScore, SCORE_INTERVAL);

    // Also do an initial fetch quickly
    const initId = setTimeout(() => { void doFetch(); }, 3_000);

    return () => {
      clearInterval(fetchId);
      clearInterval(scoreId);
      clearTimeout(initId);
    };
  }, [doFetch, doScore]);
}
