import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';

const KINDS = [1, 6, 20, 30023, 30311, 31337, 34235];
const PAGE_SIZE = 100;
/**
 * Fallback poll interval for new events. Live subscriptions deliver new events
 * instantly; this poll catches anything the subscription might miss (e.g. after
 * reconnects).
 */
const NEWER_POLL_INTERVAL = 3_000;

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
 *    immediately without waiting for a poll cycle.
 *  - Each relay is paginated independently with its own `until` cursor so a
 *    slow or sparse relay never holds up the others.
 *  - Older fetches use the current oldest timestamp **inclusively** (rather
 *    than `oldest - 1`) so events that share a timestamp are not skipped.
 *  - We de-duplicate by event ID; a relay is considered exhausted only when a
 *    request returns no new IDs. If a full page of duplicates comes back, we
 *    probe one second below the current oldest cursor to make sure there isn't
 *    a wall of older history behind them.
 *  - A 5-second background crawl fills older history automatically.
 *  - A 3-second fallback poll catches edge cases like reconnects.
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
  const fetchingNewerRef = useRef(false);
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
    timeoutMs: number,
  ): Promise<NostrEvent[]> => {
    if (!url) {
      return nostr.query([filter], { signal: AbortSignal.timeout(timeoutMs) });
    }
    try {
      const relay = nostr.relay(url);
      return await relay.query([filter], { signal: AbortSignal.timeout(timeoutMs) });
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
    timeoutMs: number,
  ): Promise<PerRelayResult[]> => {
    if (readRelays.length === 0) {
      const cursor = perRelayCursorRef.current.get('');
      const filter = makeFilter('', cursor);
      const batch = await querySingleRelay('', filter, timeoutMs);
      return [{ url: '', events: batch }];
    }

    const settled = await Promise.allSettled(
      readRelays.map(async (url) => {
        const cursor = perRelayCursorRef.current.get(url);
        const filter = makeFilter(url, cursor);
        const batch = await querySingleRelay(url, filter, timeoutMs);
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
        10_000,
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
        }, 10_000);

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
      // Network errors are swallowed; the next interval will retry.
    } finally {
      fetchingOlderRef.current = false;
      setIsFetchingOlder(false);
    }
  }, [pubkey, hasMore, mergeEvents, queryEachRelay, querySingleRelay, refreshHasMore, expandCursor, markRelayDone, ensureCursor]);

  /** Fetch events newer than the newest we have across all relays */
  const fetchNewer = useCallback(async () => {
    if (fetchingNewerRef.current) return;
    fetchingNewerRef.current = true;

    try {
      const globalNewest = Array.from(perRelayCursorRef.current.values())
        .reduce((max, c) => (c.newest !== undefined && c.newest > max ? c.newest : max), 0);
      const since = globalNewest > 0 ? globalNewest + 1 : undefined;

      const results = await queryEachRelay(
        () => ({
          kinds: KINDS,
          authors: [pubkey],
          limit: PAGE_SIZE,
          ...(since !== undefined && { since }),
        }),
        8_000,
      );

      for (const { url, events: batch } of results) {
        if (batch.length > 0) {
          expandCursor(url, batch);
          mergeEvents(batch);
        }
      }
    } catch {
      // silently ignore
    } finally {
      fetchingNewerRef.current = false;
    }
  }, [pubkey, mergeEvents, queryEachRelay, expandCursor]);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    setEvents([]);
    setIsLoading(true);
    setHasMore(true);
    setIsFetchingOlder(false);
    seenIdsRef.current = new Set();
    fetchingOlderRef.current = false;
    fetchingNewerRef.current = false;
    perRelayCursorRef.current = new Map();

    let cancelled = false;

    const load = async () => {
      try {
        const results = await queryEachRelay(
          () => ({ kinds: KINDS, authors: [pubkey], limit: PAGE_SIZE }),
          10_000,
        );

        if (cancelled) return;

        for (const { url, events: batch } of results) {
          if (batch.length > 0) {
            expandCursor(url, batch);
            mergeEvents(batch);
          }
          if (batch.length < PAGE_SIZE) {
            markRelayDone(url);
          }
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

  // ── Live subscription for brand-new events ─────────────────────────────────
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

  // ── Fallback poll for newer events ───────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => { void fetchNewer(); }, NEWER_POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchNewer]);

  return {
    events,
    isLoading,
    isFetchingOlder,
    hasMore,
    /** Manually request the next older page (e.g. on scroll-to-bottom) */
    fetchNextPage: fetchOlder,
  };
}
