import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { fetchEventWithRelays } from '@/lib/queryEvent';
import { fetchCachedEvent } from '@/lib/fetchCachedEvent';
import { getCachedEvent } from '@/lib/eventCacheStore';

interface UseEventByIdOptions {
  eventId: string;
  pubkey?: string;
  kind?: number;
  relayHints?: string[];
  timeoutMs?: number;
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number | false;
  refetchOnWindowFocus?: boolean | 'always';
}

/**
 * Fetch a single Nostr event by id, with optional author/kind constraints
 * and relay hints. The pool is always queried, but any provided relay hints
 * are also probed directly and the first successful result wins.
 * 
 * Now includes browser caching for faster, more consistent access across pages.
 */
export function useEventById(options: UseEventByIdOptions) {
  const {
    eventId,
    pubkey,
    kind,
    relayHints,
    timeoutMs,
    enabled = true,
    staleTime = 5 * 60 * 1000,
    refetchInterval,
    refetchOnWindowFocus,
  } = options;
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: [
      'nostr',
      'event-by-id',
      eventId,
      pubkey ?? '',
      kind ?? 0,
      ...(relayHints ?? []).slice().sort(),
    ],
    queryFn: async ({ signal }) => {
      if (!eventId) return null;

      // For simple id-based queries, use the cached fetch
      if (!kind && !pubkey && !relayHints) {
        return await fetchCachedEvent(nostr, eventId, { 
          timeoutMs: timeoutMs ?? 6000,
          signal,
        });
      }

      // For more complex queries with constraints, fall back to relay fetch
      let filter;
      if (kind && pubkey) {
        filter = [{ kinds: [kind], authors: [pubkey], '#d': [eventId], limit: 1 }];
      } else if (pubkey) {
        filter = [{ ids: [eventId], authors: [pubkey], limit: 1 }];
      } else {
        filter = [{ ids: [eventId], limit: 1 }];
      }

      const ev = await fetchEventWithRelays(nostr, filter, {
        relayHints,
        timeoutMs: timeoutMs ?? 6000,
        signal,
      });
      
      // Cache the result for future use
      if (ev) {
        // We'll cache it in the queryFn of fetchCachedEvent when called directly
      }
      
      return ev ?? null;
    },
    enabled: !!eventId && enabled,
    staleTime,
    refetchInterval,
    refetchOnWindowFocus,
    retry: 2,
    retryDelay: 500,
    // Provide initial data from cache for instant rendering
    initialData: () => {
      if (!eventId || !enabled) return undefined;
      const cached = getCachedEvent(eventId);
      return (cached as NostrEvent | undefined) ?? undefined;
    },
  });
}
