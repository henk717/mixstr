import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { fetchEventWithRelays } from '@/lib/queryEvent';
import { fetchCachedEvent } from '@/lib/fetchCachedEvent';
import { getCachedEvent, cacheEvent } from '@/lib/eventCacheStore';

interface ParentRef {
  id: string;
  relay?: string;
  author?: string;
}

/**
 * Fetch the parent event of a reply.
 *
 * Strategy:
 *  1. Check browser cache first for instant access
 *  2. Query the pool while also probing the relay hint from the reply's e-tag,
 *     and include the author hint when available. Directly querying the e-tag
 *     relay is essential when the parent lives on a relay outside the normal
 *     pool or is slower than the pool's default EOSE timeout.
 *  3. If that fails, fall back to a broad id-only pool query. This handles the
 *     common case where the e-tag author hint was wrong or the relay doesn't
 *     have the event.
 *
 * Returns undefined while loading, null if not found, or the event.
 */
export function useParentEvent(parentRef: ParentRef | null) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: ['nostr', 'parent-event', parentRef?.id ?? '', parentRef?.relay ?? '', parentRef?.author ?? ''],
    queryFn: async ({ signal }) => {
      if (!parentRef?.id) return null;

      // Check cache first
      const cached = getCachedEvent(parentRef.id);
      if (cached && typeof cached === 'object' && 'id' in cached) {
        const cachedEvent = cached as NostrEvent;
        if (cachedEvent.id === parentRef.id && cachedEvent.pubkey && cachedEvent.sig) {
          return cachedEvent;
        }
      }

      const abort = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);

      // First attempt: pool + author hint + relay hint from the reply tag.
      if (parentRef.author) {
        const ev = await fetchEventWithRelays(
          nostr,
          [{ ids: [parentRef.id], authors: [parentRef.author], limit: 1 }],
          { relayHints: parentRef.relay ? [parentRef.relay] : undefined, timeoutMs: 8000, signal: abort },
        );
        if (ev) {
          cacheEvent(ev.id, ev);
          return ev;
        }
      }

      // Second attempt: pool + relay hint without author constraint.
      const ev = await fetchEventWithRelays(
        nostr,
        [{ ids: [parentRef.id], limit: 1 }],
        { relayHints: parentRef.relay ? [parentRef.relay] : undefined, timeoutMs: 8000, signal },
      );
      if (ev) {
        cacheEvent(ev.id, ev);
      }
      return ev ?? null;
    },
    enabled: !!parentRef?.id,
    staleTime: 5 * 60 * 1000,
    // Retry twice with a short backoff — relays sometimes need a moment
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    // Provide initial data from cache for instant rendering
    initialData: () => {
      if (!parentRef?.id) return undefined;
      const cached = getCachedEvent(parentRef.id);
      return (cached as NostrEvent | undefined) ?? undefined;
    },
  });
}
