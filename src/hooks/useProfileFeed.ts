import { useCallback, useEffect, useRef, useState } from 'react';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

const KINDS = [1, 6, 20, 30023, 30311, 31337, 34235];
const PAGE_SIZE = 30;
/**
 * How often (ms) to poll for newer + older events while the profile page is mounted.
 * We stagger the two directions so they don't both fire at the same time.
 */
const NEWER_POLL_INTERVAL = 12_000;   // 12 s — check for brand-new posts
const OLDER_POLL_INTERVAL = 20_000;   // 20 s — keep fetching the next history page

/**
 * useProfileFeed
 *
 * Persistently fetches a profile's events while mounted.
 *
 * Strategy:
 *  – Initial load: fetch `limit` events ending now.
 *  – "Newer" poll (NEWER_POLL_INTERVAL): fetch events since the latest we have.
 *    Prepends new items to the accumulated list.
 *  – "Older" crawl (OLDER_POLL_INTERVAL): advance the cursor and fetch the next
 *    page back in history.  Stops when a page comes back empty.
 *  – Manual `fetchNextPage`: user-triggered fetch of the next older page.
 *
 * Events are de-duplicated by ID and sorted newest-first.
 */
export function useProfileFeed(pubkey: string) {
  const { nostr } = useNostr();

  // Accumulated de-duplicated events, sorted newest-first
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingOlder, setIsFetchingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // oldest created_at we've successfully loaded (pagination cursor)
  const oldestRef = useRef<number | undefined>(undefined);
  // newest created_at we've successfully loaded (for "newer" polling)
  const newestRef = useRef<number | undefined>(undefined);
  // set of event IDs we already have
  const seenIdsRef = useRef<Set<string>>(new Set());
  // guard against concurrent fetches in the same direction
  const fetchingOlderRef = useRef(false);
  const fetchingNewerRef = useRef(false);

  /** Merge new events into state, deduplicated and sorted */
  const mergeEvents = useCallback((incoming: NostrEvent[]) => {
    setEvents((prev) => {
      let added = false;
      const next = [...prev];
      for (const ev of incoming) {
        if (!seenIdsRef.current.has(ev.id)) {
          seenIdsRef.current.add(ev.id);
          next.push(ev);
          added = true;
          // update cursors
          if (newestRef.current === undefined || ev.created_at > newestRef.current) {
            newestRef.current = ev.created_at;
          }
          if (oldestRef.current === undefined || ev.created_at < oldestRef.current) {
            oldestRef.current = ev.created_at;
          }
        }
      }
      if (!added) return prev;
      return next.sort((a, b) => b.created_at - a.created_at);
    });
  }, []);

  /** Fetch events older than the current cursor */
  const fetchOlder = useCallback(async () => {
    if (fetchingOlderRef.current || !hasMore) return;
    fetchingOlderRef.current = true;
    setIsFetchingOlder(true);

    try {
      const until = oldestRef.current !== undefined ? oldestRef.current - 1 : undefined;
      const filter: Record<string, unknown> = {
        kinds: KINDS,
        authors: [pubkey],
        limit: PAGE_SIZE,
      };
      if (until !== undefined) filter.until = until;

      const fetched = await nostr.query(
        [filter as Parameters<typeof nostr.query>[0][0]],
        { signal: AbortSignal.timeout(10_000) },
      );

      if (fetched.length === 0) {
        setHasMore(false);
      } else {
        mergeEvents(fetched);
        if (fetched.length < PAGE_SIZE) {
          setHasMore(false);
        }
      }
    } catch {
      // Network errors are silently swallowed — the next interval will retry
    } finally {
      fetchingOlderRef.current = false;
      setIsFetchingOlder(false);
    }
  }, [pubkey, nostr, hasMore, mergeEvents]);

  /** Fetch events newer than the newest we have */
  const fetchNewer = useCallback(async () => {
    if (fetchingNewerRef.current) return;
    fetchingNewerRef.current = true;

    try {
      const since = newestRef.current !== undefined ? newestRef.current + 1 : undefined;
      const filter: Record<string, unknown> = {
        kinds: KINDS,
        authors: [pubkey],
        limit: PAGE_SIZE,
      };
      if (since !== undefined) filter.since = since;

      const fetched = await nostr.query(
        [filter as Parameters<typeof nostr.query>[0][0]],
        { signal: AbortSignal.timeout(8_000) },
      );

      if (fetched.length > 0) mergeEvents(fetched);
    } catch {
      // silently ignore
    } finally {
      fetchingNewerRef.current = false;
    }
  }, [pubkey, nostr, mergeEvents]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    // Reset state whenever the pubkey changes
    setEvents([]);
    setIsLoading(true);
    setHasMore(true);
    setIsFetchingOlder(false);
    seenIdsRef.current = new Set();
    oldestRef.current = undefined;
    newestRef.current = undefined;
    fetchingOlderRef.current = false;
    fetchingNewerRef.current = false;

    let cancelled = false;

    const load = async () => {
      try {
        const fetched = await nostr.query(
          [{ kinds: KINDS, authors: [pubkey], limit: PAGE_SIZE }],
          { signal: AbortSignal.timeout(10_000) },
        );
        if (!cancelled) {
          mergeEvents(fetched);
          if (fetched.length < PAGE_SIZE) setHasMore(false);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey]);

  // ── "Newer" polling interval ───────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => { void fetchNewer(); }, NEWER_POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchNewer]);

  // ── "Older" crawl interval ─────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (hasMore && !isLoading) void fetchOlder();
    }, OLDER_POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchOlder, hasMore, isLoading]);

  return {
    events,
    isLoading,
    isFetchingOlder,
    hasMore,
    /** Manually request the next older page (e.g. on scroll-to-bottom) */
    fetchNextPage: fetchOlder,
  };
}
