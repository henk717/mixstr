import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { fetchEventWithRelays } from '@/lib/queryEvent';
import { getParentEventId } from '@/lib/postUtils';
import { cacheEvents } from '@/lib/fetchCachedEvent';

/**
 * Fetches the full thread chain of ancestors for a given event.
 * Returns events in chronological order (oldest first), NOT including the starting event.
 * 
 * Events are cached for faster access across page navigations.
 */
export function useThreadChain(eventId: string, author?: string) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'thread-chain', eventId, author ?? ''],
    queryFn: async ({ signal }) => {
      const abort = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
      const chain: NostrEvent[] = [];
      const visited = new Set<string>();
      
      // Start from the target event and walk up the chain
      let currentEventId = eventId;
      let currentAuthor = author;
      let maxDepth = 50; // Prevent infinite loops
      
      while (currentEventId && maxDepth > 0) {
        if (visited.has(currentEventId)) {
          break; // Prevent infinite loops
        }
        visited.add(currentEventId);
        
        // Fetch the current event
        const filter: { ids: string[]; authors?: string[]; limit: number } = {
          ids: [currentEventId],
          limit: 1,
        };
        if (currentAuthor) {
          filter.authors = [currentAuthor];
        }
        
        const event = await fetchEventWithRelays(
          nostr,
          [filter],
          { timeoutMs: 5000, signal: abort },
        );
        
        if (!event) {
          break; // Event not found, stop the chain
        }
        
        // Get the parent event reference BEFORE adding current event
        const parentRef = getParentEventId(event);
        
        // Add current event to chain (we'll reverse at the end)
        chain.push(event);
        
        if (!parentRef) {
          break; // No parent, we've reached the root
        }
        
        currentEventId = parentRef.id;
        currentAuthor = parentRef.author ?? currentAuthor;
        maxDepth--;
      }
      
      // Cache all fetched events
      cacheEvents(chain);
      
      // Reverse to get chronological order (oldest first)
      return chain.reverse();
    },
    enabled: !!eventId,
    staleTime: 30 * 1000, // 30 seconds
    retry: 2,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 3000),
  });
}