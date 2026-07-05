import { useEffect, useRef, useCallback } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';

/**
 * Maximum number of active relay connections we aim for in total (pinned + gossip).
 */
export const TARGET_RELAY_LIMIT = 50;

/**
 * How many followed pubkeys to batch per kind-10002 query.
 */
const BATCH_SIZE = 150;

/**
 * Re-run gossip discovery periodically so relays that failed on first attempt or
 * newly declared follower relays are picked up. Also retry sooner when the
 * candidate list is small — this fixes sessions that start with cold connections
 * and an empty initial discovery result.
 */
const DISCOVERY_INTERVAL_MS = 5 * 60 * 1000;   // 5 min
const LOW_CANDIDATE_RETRY_MS = 30 * 1000;      // 30 s
const MAX_RETRY_BACKOFF_MS = 5 * 60 * 1000;    // 5 min
const RETRY_JITTER_MS = 5000;

// ── Shared singleton state (module-level so it survives hook re-renders) ────

/** relay URL → score (number of followed profiles that list this relay) */
const relayScores = new Map<string, number>();

/**
 * All discovered gossip relay candidates sorted by popularity (excluding the
 * user's own pinned relays). NostrProvider slices from this list, skipping any
 * that fail to connect, so we can fall back to lower-ranked candidates and
 * keep the active relay count up.
 */
let gossipCandidates: string[] = [];

/** Returns the current gossip relay candidate list (snapshot at call time) */
export function getGossipCandidates(): string[] {
  return gossipCandidates;
}

/** @deprecated Use `getGossipCandidates()` instead. */
export function getGossipRelays(): string[] {
  return gossipCandidates;
}

/** Recompute the full sorted gossip candidate list, excluding the user's own pinned relays */
function rebuildGossipCandidates(excludeUrls: Set<string>) {
  const sorted = [...relayScores.entries()]
    .filter(([url]) => !excludeUrls.has(url))
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url);
  gossipCandidates = sorted;
}

/**
 * useRelayGossip
 *
 * Mount this once (in NostrProvider).  When the user is logged in and has
 * relays configured, it:
 *  1. Fetches the user's following list (kind 3).
 *  2. Batch-queries kind 10002 (NIP-65) for all followed pubkeys.
 *  3. Scores each relay URL by how many followed profiles declare it.
 *  4. Builds a ranked list of candidate gossip relays NOT already in the user's
 *     own relay list. NostrProvider will fill up to TARGET_RELAY_LIMIT slots
 *     from this list, automatically skipping candidates that fail to connect
 *     and falling back to lower-ranked ones.
 *  5. Calls `onUpdate` whenever the candidate list changes.
 */
export function useRelayGossip(onUpdate: (relays: string[]) => void) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const previousListRef = useRef<string>('');
  // Guard: only run once per (user pubkey + relay config timestamp) pair when
  // triggered by dependency changes. Retries and periodic re-runs bypass this.
  const lastRunKeyRef = useRef<string>('');

  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);

  const clearRetry = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    retryAttemptRef.current = 0;
  }, []);

  const runGossipFetch = useCallback(async (isRetry = false) => {
    if (!user?.pubkey) return;
    const pinnedRelays = config.relayMetadata.relays;
    if (pinnedRelays.length === 0) return;

    if (!isRetry) {
      // Deduplicate runs triggered by dependency changes — don't re-fetch when
      // nothing has changed.
      const runKey = `${user.pubkey}:${config.relayMetadata.updatedAt}`;
      if (lastRunKeyRef.current === runKey) return;
      lastRunKeyRef.current = runKey;
    }

    console.log(
      isRetry
        ? '[RelayGossip] Retrying gossip relay fetch'
        : '[RelayGossip] Starting gossip relay fetch for user',
      user.pubkey.slice(0, 8),
    );

    try {
      // Step 1: fetch the user's contact/following list (kind 3)
      const contactEvents = await nostr.query(
        [{ kinds: [3], authors: [user.pubkey], limit: 1 }],
        { signal: AbortSignal.timeout(8000) }
      );

      const followedPubkeys: string[] = [];
      if (contactEvents.length > 0) {
        for (const tag of contactEvents[0].tags) {
          if (tag[0] === 'p' && typeof tag[1] === 'string' && tag[1].length === 64) {
            followedPubkeys.push(tag[1]);
          }
        }
      }

      if (followedPubkeys.length === 0) {
        console.log('[RelayGossip] No followed pubkeys found — skipping gossip fetch');
        return;
      }

      console.log(`[RelayGossip] Fetching NIP-65 for ${followedPubkeys.length} followed pubkeys`);

      // Step 2: batch-fetch kind 10002 for all followed pubkeys.
      // We accumulate rather than replace: a later re-discovery run may query a
      // different set of relays and find NIP-65 events the first run missed.
      // Scores are capped to prevent unbounded growth across many re-runs.
      for (let i = 0; i < followedPubkeys.length; i += BATCH_SIZE) {
        const batch = followedPubkeys.slice(i, i + BATCH_SIZE);
        try {
          const events = await nostr.query(
            [{ kinds: [10002], authors: batch, limit: batch.length }],
            { signal: AbortSignal.timeout(10000) }
          );

          for (const event of events) {
            for (const tag of event.tags) {
              if (tag[0] === 'r' && typeof tag[1] === 'string') {
                const url = tag[1].replace(/\/$/, ''); // normalise trailing slash
                if (url.startsWith('wss://') || url.startsWith('ws://')) {
                  const next = (relayScores.get(url) ?? 0) + 1;
                  relayScores.set(url, Math.min(next, 10000));
                }
              }
            }
          }
        } catch {
          // Ignore errors on individual batches; continue with next batch
        }
      }

      // Step 3: rebuild gossip candidate list, excluding user's own pinned relays.
      const pinnedSet = new Set(pinnedRelays.map(r => r.url));
      rebuildGossipCandidates(pinnedSet);

      const key = gossipCandidates.join(',');
      if (key !== previousListRef.current) {
        previousListRef.current = key;
        console.log(`[RelayGossip] Updated gossip candidates (${gossipCandidates.length}):`, gossipCandidates.slice(0, 5).join(', ') + (gossipCandidates.length > 5 ? '…' : ''));
        onUpdateRef.current([...gossipCandidates]);
      }

      // If we discovered very few candidates, schedule a retry with backoff.
      // This commonly happens when the first discovery runs before WebSocket
      // connections are warm, or when the current relays don't yet have the
      // follows' NIP-65 events.
      const pinnedCount = pinnedRelays.length;
      const neededGossipSlots = Math.max(0, TARGET_RELAY_LIMIT - pinnedCount);
      if (gossipCandidates.length < neededGossipSlots && neededGossipSlots > 0) {
        const backoff = Math.min(
          MAX_RETRY_BACKOFF_MS,
          LOW_CANDIDATE_RETRY_MS * 2 ** retryAttemptRef.current,
        );
        const jitter = Math.floor(Math.random() * RETRY_JITTER_MS);
        retryAttemptRef.current += 1;
        console.log(`[RelayGossip] Candidate count low (${gossipCandidates.length}/${neededGossipSlots}), retrying in ${(backoff + jitter) / 1000}s`);
        return backoff + jitter;
      }

      clearRetry();
      return null;
    } catch (err) {
      console.warn('[RelayGossip] Gossip fetch failed:', err);
      // Retry quickly after an outright failure so a cold start doesn't leave
      // the pool under-filled for minutes.
      const delay = Math.min(
        MAX_RETRY_BACKOFF_MS,
        LOW_CANDIDATE_RETRY_MS * 2 ** retryAttemptRef.current + Math.floor(Math.random() * RETRY_JITTER_MS),
      );
      retryAttemptRef.current += 1;
      return delay;
    }
  }, [nostr, user?.pubkey, config.relayMetadata, clearRetry]);

  // Stable ref so the retry scheduler never closes over a stale copy.
  const runGossipFetchRef = useRef(runGossipFetch);
  useEffect(() => {
    runGossipFetchRef.current = runGossipFetch;
  }, [runGossipFetch]);

  const scheduleRetry = useCallback((delayMs: number) => {
    clearRetry();
    retryTimeoutRef.current = setTimeout(() => {
      retryTimeoutRef.current = null;
      const nextDelay = runGossipFetchRef.current(true);
      if (nextDelay != null) scheduleRetry(nextDelay);
    }, delayMs);
  }, [clearRetry]);

  // Initial run + re-run whenever the user or their relay list changes.
  useEffect(() => {
    void runGossipFetch().then((delay) => {
      if (delay != null) scheduleRetry(delay);
    });
  }, [runGossipFetch, scheduleRetry]);

  // Periodic re-discovery: follower relay lists change over time, and relays
  // that were down on first attempt may come back.
  useEffect(() => {
    if (!user?.pubkey || config.relayMetadata.relays.length === 0) return;

    const id = setInterval(() => {
      void runGossipFetchRef.current(true).then((delay) => {
        if (delay != null) scheduleRetry(delay);
      });
    }, DISCOVERY_INTERVAL_MS);

    return () => clearInterval(id);
  }, [user?.pubkey, config.relayMetadata.relays.length, scheduleRetry]);

  // Cleanup any pending retry on unmount.
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);
}
