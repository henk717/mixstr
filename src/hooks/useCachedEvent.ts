import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { fetchCachedEvent } from '@/lib/fetchCachedEvent';
import { getCachedEvent, isEventCached } from '@/lib/eventCacheStore';

interface UseCachedEventOptions {
  eventId: string;
  pubkey?: string;
  kind?: number;
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number | false;
  refetchOnWindowFocus?: boolean | 'always';
}

/**
 * Fetch a single Nostr event with browser cache optimization
 * 
 * This hook provides:
 * - Instant cache hits for recently viewed events
 * - Automatic cache population on cache misses
 * - Consistent event data across page navigations
 * - Reduced relay queries and faster load times
 */
export function useCachedEvent(options: UseCachedEventOptions) {
  const {
    eventId,
    pubkey,
    kind,
    enabled = true,
    staleTime = 5 * 60 * 1000, // 5 minutes
    refetchInterval,
    refetchOnWindowFocus = false,
  } = options;
  
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: ['cached-event', eventId, pubkey ?? '', kind ?? 0],
    queryFn: async ({ signal }) => {
      if (!eventId) return null;

      return await fetchCachedEvent(nostr, eventId, { signal });
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

/**
 * Check if an event is currently cached
 */
export function isEventInCache(eventId: string): boolean {
  return isEventCached(eventId);
}