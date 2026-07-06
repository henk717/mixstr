import { useCallback, useEffect, useRef, useState } from 'react';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';

const KINDS = [1, 6, 20, 30023, 30311, 31337, 34235];
const PAGE_SIZE = 30;
/**
 * How often (ms) to poll for newer events while the profile page is mounted.
 */
const NEWER_POLL_INTERVAL = 12_000;

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

/**
 * useProfileFeed
 *
 * Fetches a profile's full event history from every configured read relay.
 *
 * Strategy:
 *  - Each relay is paginated independently with its own `until` cursor so a
 *    slow or sparse relay never advances the global cursor past data that
 *    another relay still needs to return.
 *  - The feed keeps fetching older pages as long as any relay reports more
 *    events, eliminating the time gaps caused by the old global-page logic.
 *  - A background poll checks for brand-new posts and prepends them.
 *  - Events are de-duplicated by ID and sorted newest-first.
 */
export function useProfileFeed(pubkey: string) {
  const { nostr } = useNostr();
  const { config } = useAppContext();

  // Accumulated de-duplicated events, sorted newest-first
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingOlder, setIsFetchingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const seenIdsRef = useRef<Set<string>>(new Set());
  const fetchingOlderRef = useRef(false);
  const fetchingNewerRef = useRef(false);
  const perRelayCursorRef = useRef<Map<string, RelayCursor>>(new Map());

  /** Read-relay URLs from the user's NIP-65 list */
  const readRelays = config.relayMetadata.relays
    .filter((r) => r.read)
    .map((r) => r.url);

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

  /** Update per-relay cursors from the events that relay just returned */
  const updateRelayCursor = useCallback((url: string, batch: NostrEvent[]) => {
    const cursor = perRelayCursorRef.current.get(url) ?? { hasMore: true };

    for (const ev of batch) {
      if (cursor.oldest === undefined || ev.created_at < cursor.oldest) {
        cursor.oldest = ev.created_at;
      }
      if (cursor.newest === undefined || ev.created_at > cursor.newest) {
        cursor.newest = ev.created_at;
      }
    }

    if (batch.length === 0) {
      cursor.hasMore = false;
    }

    perRelayCursorRef.current.set(url, cursor);
  }, []);

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
      const batch = await nostr.query([filter], { signal: AbortSignal.timeout(timeoutMs) });
      return [{ url: '', events: batch }];
    }

    const settled = await Promise.allSettled(
      readRelays.map(async (url) => {
        const cursor = perRelayCursorRef.current.get(url);
        const filter = makeFilter(url, cursor);
        try {
          const relay = nostr.relay(url);
          const batch = await relay.query([filter], { signal: AbortSignal.timeout(timeoutMs) });
          return { url, events: batch };
        } catch {
          return { url, events: [] };
        }
      }),
    );

    return settled
      .filter((r): r is PromiseFulfilledResult<PerRelayResult> => r.status === 'fulfilled')
      .map((r) => r.value);
  }, [nostr, readRelays]);

  /** Fetch the next older page from every relay that still has history */
  const fetchOlder = useCallback(async () => {
    if (fetchingOlderRef.current || !hasMore) return;
    fetchingOlderRef.current = true;
    setIsFetchingOlder(true);

    try {
      const results = await queryEachRelay(
        (_url, cursor) => {
          const until = cursor?.oldest !== undefined ? cursor.oldest - 1 : undefined;
          return {
            kinds: KINDS,
            authors: [pubkey],
            limit: PAGE_SIZE,
            ...(until !== undefined && { until }),
          };
        },
        10_000,
      );

      let anyNew = false;
      for (const { url, events: batch } of results) {
        updateRelayCursor(url, batch);
        if (batch.length > 0) {
          anyNew = true;
          mergeEvents(batch);
        }
      }

      refreshHasMore();

      // If every relay came back empty this round, there is genuinely no more.
      if (!anyNew) {
        setHasMore(false);
      }
    } catch {
      // Network errors are swallowed; the next poll/scroll will retry.
    } finally {
      fetchingOlderRef.current = false;
      setIsFetchingOlder(false);
    }
  }, [pubkey, hasMore, mergeEvents, queryEachRelay, refreshHasMore, updateRelayCursor]);

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
        updateRelayCursor(url, batch);
        if (batch.length > 0) mergeEvents(batch);
      }
    } catch {
      // silently ignore
    } finally {
      fetchingNewerRef.current = false;
    }
  }, [pubkey, mergeEvents, queryEachRelay, updateRelayCursor]);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    // Reset state whenever the pubkey changes
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
          updateRelayCursor(url, batch);
          if (batch.length > 0) mergeEvents(batch);
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

  // ── Background poll for brand-new posts ──────────────────────────────────
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
