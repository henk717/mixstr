import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';

const KINDS = [1, 6, 20, 30023, 30311, 31337, 34235];
const PAGE_SIZE = 250;
/** Per-relay query timeout. Slow/stuck relays get marked done quickly. */
const QUERY_TIMEOUT = 4_000;
/** How often to re-probe relays once we think history is exhausted. */
const HISTORY_REPROBE_INTERVAL = 30_000;

interface RelayCursor {
  oldest?: number;
  newest?: number;
  hasMore: boolean;
}

interface FilterSpec {
  kinds: number[];
  authors: string[];
  limit: number;
  until?: number;
  since?: number;
}

interface PerRelayResult {
  url: string;
  events: NostrEvent[];
}

type RelayMsg =
  | readonly ['EVENT', string, NostrEvent]
  | readonly ['EOSE', string]
  | readonly ['CLOSED', string, string]
  | readonly ['NOTICE', string];

/**
 * useProfileFeed
 *
 * Fetches a profile's full event history from every configured read relay.
 *
 * Strategy:
 *  - A live subscription is opened on each read relay so new events arrive
 *    immediately, replacing any polling.
 *  - Older history is backfilled page-by-page as fast as relays respond.
 *  - Each relay is paginated independently with its own `until` cursor so a
 *    slow or sparse relay never holds up the others.
 *  - Older fetches use the current oldest timestamp **inclusively** (rather
 *    than `oldest - 1`) so events that share a timestamp are not skipped.
 *  - A relay is considered exhausted only when it stops returning new event
 *    IDs. If a full page of duplicates comes back, we probe one second below
 *    the current oldest cursor to make sure there isn't a wall of older
 *    history behind them.
 *  - Per-relay requests use a short timeout so unresponsive relays don't stall
 *    the whole feed.
 */
export function useProfileFeed(pubkey: string) {
  const { nostr } = useNostr();
  const { config } = useAppContext();

  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingOlder, setIsFetchingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const seenIdsRef = useRef<Set<string>>(new Set());
  const fetchingOlderRef = useRef(false);
  const perRelayCursorRef = useRef<Map<string, RelayCursor>>(new Map());

  const readRelays = useMemo(
    () => config.relayMetadata.relays.filter((r) => r.read).map((r) => r.url),
    [config.relayMetadata.relays],
  );

  /** Merge new events into state, de-duplicated and sorted */
  const mergeEvents = useCallback((incoming: NostrEvent[]) => {
    if (incoming.length === 0) return;

    setEvents((prev) => {
      let added = false;
      const next = [...prev];
      for (const ev of incoming) {
        if (!seenIdsRef.current.has(ev.id)) {
          seenIdsRef.current.add(ev.id);
          next.push(ev);
          added = true;
        }
      }
      if (!added) return prev;
      return next.sort((a, b) => b.created_at - a.created_at);
    });
  }, []);

  const ensureCursor = useCallback((url: string) => {
    let cursor = perRelayCursorRef.current.get(url);
    if (!cursor) {
      cursor = { hasMore: true };
      perRelayCursorRef.current.set(url, cursor);
    }
    return cursor;
  }, []);

  /** Expand a relay's cursor from newly discovered events */
  const expandCursor = useCallback((url: string, batch: NostrEvent[]) => {
    const cursor = ensureCursor(url);
    for (const ev of batch) {
      if (cursor.oldest === undefined || ev.created_at < cursor.oldest) {
        cursor.oldest = ev.created_at;
      }
      if (cursor.newest === undefined || ev.created_at > cursor.newest) {
        cursor.newest = ev.created_at;
      }
    }
    cursor.hasMore = true;
  }, [ensureCursor]);

  /** Mark a relay as exhausted */
  const markRelayDone = useCallback((url: string) => {
    const cursor = ensureCursor(url);
    cursor.hasMore = false;
  }, [ensureCursor]);

  /** Recompute global hasMore from per-relay state */
  const refreshHasMore = useCallback(() => {
    if (readRelays.length === 0) {
      const cursor = perRelayCursorRef.current.get('');
      setHasMore(cursor?.hasMore ?? false);
      return;
    }
    let anyHasMore = false;
    for (const url of readRelays) {
      if (perRelayCursorRef.current.get(url)?.hasMore) {
        anyHasMore = true;
        break;
      }
    }
    setHasMore(anyHasMore);
  }, [readRelays]);

  const querySingleRelay = useCallback(async (
    url: string,
    filter: FilterSpec,
  ): Promise<NostrEvent[]> => {
    if (!url) {
      return nostr.query([filter], { signal: AbortSignal.timeout(QUERY_TIMEOUT) });
    }
    try {
      const relay = nostr.relay(url);
      return await relay.query([filter], { signal: AbortSignal.timeout(QUERY_TIMEOUT) });
    } catch {
      return [];
    }
  }, [nostr]);

  /**
   * Query each configured read relay individually. Returns each relay's
   * results separately so callers can update per-relay cursors.
   */
  const queryEachRelay = useCallback(async (
    makeFilter: (url: string, cursor: RelayCursor | undefined) => FilterSpec,
  ): Promise<PerRelayResult[]> => {
    if (readRelays.length === 0) {
      const cursor = perRelayCursorRef.current.get('');
      const filter = makeFilter('', cursor);
      const batch = await querySingleRelay('', filter);
      return [{ url: '', events: batch }];
    }

    const settled = await Promise.allSettled(
      readRelays.map(async (url) => {
        const cursor = perRelayCursorRef.current.get(url);
        const filter = makeFilter(url, cursor);
        const batch = await querySingleRelay(url, filter);
        return { url, events: batch };
      }),
    );

    return settled
      .filter((r): r is PromiseFulfilledResult<PerRelayResult> => r.status === 'fulfilled')
      .map((r) => r.value);
  }, [readRelays, querySingleRelay]);

  /** Fetch the next older page from every relay that still has history */
  const fetchOlder = useCallback(async () => {
    if (fetchingOlderRef.current || !hasMore) return;
    fetchingOlderRef.current = true;
    setIsFetchingOlder(true);

    try {
      const results = await queryEachRelay(
        (_url, cursor) => ({
          kinds: KINDS,
          authors: [pubkey],
          limit: PAGE_SIZE,
          ...(cursor?.oldest !== undefined && { until: cursor.oldest }),
        }),
      );

      let anyProgress = false;

      for (const { url, events: batch } of results) {
        const cursor = ensureCursor(url);
        const newEvents = batch.filter((ev) => !seenIdsRef.current.has(ev.id));

        if (newEvents.length > 0) {
          mergeEvents(newEvents);
          expandCursor(url, newEvents);
          anyProgress = true;
          continue;
        }

        // No new IDs in this batch.
        if (batch.length < PAGE_SIZE || cursor.oldest === undefined || cursor.oldest <= 1) {
          markRelayDone(url);
          continue;
        }

        // The relay filled the page but every item was a duplicate. There may
        // be a wall of older events behind them, so probe just below the
        // current oldest timestamp.
        const probeUntil = cursor.oldest - 1;
        const probe = await querySingleRelay(url, {
          kinds: KINDS,
          authors: [pubkey],
          limit: PAGE_SIZE,
          until: probeUntil,
        });

        const probeNew = probe.filter((ev) => !seenIdsRef.current.has(ev.id));
        if (probeNew.length > 0) {
          mergeEvents(probeNew);
          expandCursor(url, probeNew);
          anyProgress = true;
        } else {
          markRelayDone(url);
        }
      }

      refreshHasMore();

      if (!anyProgress) {
        setHasMore(false);
      }
    } catch {
      // Network errors are swallowed; the next iteration will retry.
    } finally {
      fetchingOlderRef.current = false;
      setIsFetchingOlder(false);
    }
  }, [pubkey, hasMore, mergeEvents, queryEachRelay, querySingleRelay, refreshHasMore, expandCursor, markRelayDone, ensureCursor]);

  // ── Initial load ───────────────────────────────────────────────────────────
  // Use layout effect so state is reset synchronously when the pubkey changes,
  // preventing a flash of stale "End of history" from the previous profile.
  useLayoutEffect(() => {
    setEvents([]);
    setIsLoading(true);
    setHasMore(true);
    setIsFetchingOlder(false);
    seenIdsRef.current = new Set();
    fetchingOlderRef.current = false;
    perRelayCursorRef.current = new Map();

    let cancelled = false;

    const load = async () => {
      try {
        const results = await queryEachRelay(
          () => ({ kinds: KINDS, authors: [pubkey], limit: PAGE_SIZE }),
        );

        if (cancelled) return;

        for (const { url, events: batch } of results) {
          if (batch.length > 0) {
            expandCursor(url, batch);
            mergeEvents(batch);
          }
          // Do NOT mark relays done here: relays may return fewer than
          // PAGE_SIZE because of their own internal limit, not because the
          // profile has no more history. Let the older crawl prove exhaustion.
        }
        refreshHasMore();
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

  // ── Live subscription for all new events ───────────────────────────────────
  useEffect(() => {
    const since = Math.floor(Date.now() / 1000) - 60;
    const filters: FilterSpec[] = [{ kinds: KINDS, authors: [pubkey], since }];
    const controllers: AbortController[] = [];

    const handleMsg = (url: string, msg: RelayMsg) => {
      if (msg[0] === 'EVENT') {
        const ev = msg[2];
        expandCursor(url, [ev]);
        mergeEvents([ev]);
      }
    };

    const startRelay = async (url: string, relayFilters: FilterSpec[]) => {
      const ac = new AbortController();
      controllers.push(ac);
      try {
        const relay = url ? nostr.relay(url) : nostr;
        for await (const msg of relay.req(relayFilters, { signal: ac.signal })) {
          handleMsg(url, msg as RelayMsg);
        }
      } catch {
        // Subscription closed or errored; reconnect handled by Nostrify.
      }
    };

    if (readRelays.length === 0) {
      void startRelay('', filters);
    } else {
      for (const url of readRelays) {
        void startRelay(url, filters);
      }
    }

    return () => {
      for (const ac of controllers) {
        ac.abort();
      }
    };
  }, [pubkey, nostr, readRelays, mergeEvents, expandCursor]);

  // ── Active older-history crawl (fetch back-to-back) ──────────────────────
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      timeoutId = setTimeout(async () => {
        if (cancelled || !hasMore || isLoading) return;
        await fetchOlder();
        schedule();
      }, 0);
    };

    schedule();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [fetchOlder, hasMore, isLoading]);

  // ── Re-probe exhausted relays periodically ─────────────────────────────────
  // Relays can come back online, or the user may publish while we thought we
  // were done. Wake the crawler up every so often to check again.
  useEffect(() => {
    if (hasMore || isLoading) return;

    const id = setInterval(() => {
      const urls = readRelays.length === 0 ? [''] : readRelays;
      for (const url of urls) {
        const cursor = perRelayCursorRef.current.get(url);
        if (cursor) cursor.hasMore = true;
      }
      setHasMore(true);
    }, HISTORY_REPROBE_INTERVAL);

    return () => clearInterval(id);
  }, [hasMore, isLoading, readRelays]);

  return {
    events,
    isLoading,
    isFetchingOlder,
    hasMore,
    /** Kept for compatibility; the profile UI no longer uses scroll-to-load. */
    fetchNextPage: fetchOlder,
  };
}
