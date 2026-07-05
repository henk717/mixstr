import { useCallback, useEffect, useRef, useState } from 'react';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Like useProfileFeed but also includes reply-type events (kind 1 with an `e` tag).
 * We query for kinds 1, 6, 20, 30023 — same as the base feed — relay filters
 * do the pagination; the client shows everything including posts that are replies.
 */
const KINDS = [1, 6, 20, 30023, 30311, 31337, 34235];
const PAGE_SIZE = 30;

const NEWER_POLL_INTERVAL = 12_000;
const OLDER_POLL_INTERVAL = 20_000;

export function useProfileRepliesFeed(pubkey: string) {
  const { nostr } = useNostr();

  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingOlder, setIsFetchingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const oldestRef = useRef<number | undefined>(undefined);
  const newestRef = useRef<number | undefined>(undefined);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const fetchingOlderRef = useRef(false);
  const fetchingNewerRef = useRef(false);

  const mergeEvents = useCallback((incoming: NostrEvent[]) => {
    setEvents((prev) => {
      let added = false;
      const next = [...prev];
      for (const ev of incoming) {
        if (!seenIdsRef.current.has(ev.id)) {
          seenIdsRef.current.add(ev.id);
          next.push(ev);
          added = true;
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
        if (fetched.length < PAGE_SIZE) setHasMore(false);
      }
    } catch {
      // silently ignore
    } finally {
      fetchingOlderRef.current = false;
      setIsFetchingOlder(false);
    }
  }, [pubkey, nostr, hasMore, mergeEvents]);

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

  useEffect(() => {
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

  useEffect(() => {
    const id = setInterval(() => { void fetchNewer(); }, NEWER_POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchNewer]);

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
    fetchNextPage: fetchOlder,
  };
}
