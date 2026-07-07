import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { cacheEvent, getCachedEvent } from '@/lib/eventCacheStore';

export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: ['nostr', 'author', pubkey ?? ''],
    queryFn: async () => {
      if (!pubkey) {
        return {};
      }

      // Check cache first for kind 0 events from this pubkey
      // We cache by pubkey for kind 0 since there's typically only one per user
      const cachedKey = `kind0_${pubkey}`;
      const cached = getCachedEvent(cachedKey);
      
      if (cached && typeof cached === 'object' && 'id' in cached) {
        const cachedEvent = cached as NostrEvent;
        if (cachedEvent.kind === 0 && cachedEvent.pubkey === pubkey) {
          try {
            const metadata = n.json().pipe(n.metadata()).parse(cachedEvent.content);
            return { metadata, event: cachedEvent };
          } catch {
            return { event: cachedEvent };
          }
        }
      }

      const [event] = await nostr.query(
        [{ kinds: [0], authors: [pubkey!], limit: 1 }],
        { signal: AbortSignal.timeout(6000) },
      );

      if (!event) {
        throw new Error('No event found');
      }

      // Cache the profile event by pubkey
      cacheEvent(cachedKey, event);

      try {
        const metadata = n.json().pipe(n.metadata()).parse(event.content);
        return { metadata, event };
      } catch {
        return { event };
      }
    },
    staleTime: 2 * 60 * 1000,   // Re-fetch profiles after 2 minutes
    retry: 2,
    refetchOnWindowFocus: true,
  });
}
