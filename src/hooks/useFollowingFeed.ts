import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useFollowing } from './useFollowing';
import { cacheEvents } from '@/lib/fetchCachedEvent';

const PAGE_SIZE = 30;

export function useFollowingFeed() {
  const { nostr } = useNostr();
  const { data: following = [] } = useFollowing();

  return useInfiniteQuery<NostrEvent[]>({
    queryKey: ['nostr', 'following-feed-infinite', following.slice().sort().join(',')],
    queryFn: async ({ pageParam, signal }) => {
      if (following.length === 0) return [];
      const until = pageParam as number | undefined;
      const timeFilter = until ? { until } : {};
      const abort = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      // Batch queries for large follow lists
      const chunks: string[][] = [];
      for (let i = 0; i < following.length; i += 500) {
        chunks.push(following.slice(i, i + 500));
      }

      const results = await Promise.all(
        chunks.map((batch) =>
          nostr.query(
            [{ kinds: [1, 6, 20, 30023, 30311, 31337, 34235, 34236], authors: batch, limit: PAGE_SIZE, ...timeFilter }],
            { signal: abort },
          ),
        ),
      );

      const all = results.flat();
      const seen = new Set<string>();
      const uniqueEvents = all
        .filter((e) => {
          if (seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        })
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, PAGE_SIZE);
      
      // Cache the events for faster access
      cacheEvents(uniqueEvents);
      
      return uniqueEvents;
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1].created_at - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: following.length > 0,
    staleTime: 15 * 1000,
    refetchOnWindowFocus: true,
  });
}
