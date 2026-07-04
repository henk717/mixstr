import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useFollowing } from './useFollowing';

export type FeedKindFilter = 'all' | 'short' | 'longform' | 'media' | 'audio';

function kindsForFilter(filter: FeedKindFilter): number[] {
  switch (filter) {
    case 'short':
      // short notes + reposts
      return [1, 6];
    case 'longform':
      // kind 1 + long-form articles
      return [1, 30023];
    case 'media':
      // kind 1 with media, video (kind 34235 NIP-71), image (kind 20)
      return [1, 20, 34235];
    case 'audio':
      // kind 1 with audio, kind 31337 (audio track), kind 34236 (short video/audio)
      return [1, 31337, 34236];
    case 'all':
    default:
      return [1, 6, 20, 30023, 31337, 34235, 34236];
  }
}

export function useFollowingFeed(authors: string[], limit = 50) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'following-feed', authors.slice().sort().join(','), limit],
    queryFn: async ({ signal }) => {
      if (authors.length === 0) return [];
      // Fetch in batches of 500 to avoid relay limits
      const batches: string[][] = [];
      for (let i = 0; i < authors.length; i += 500) {
        batches.push(authors.slice(i, i + 500));
      }
      const results = await Promise.all(
        batches.map((batch) =>
          nostr.query(
            [{ kinds: [1, 6, 20, 30023, 31337, 34235, 34236], authors: batch, limit }],
            { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
          ),
        ),
      );
      const all = results.flat();
      // Sort by created_at desc, dedupe by id
      const seen = new Set<string>();
      return all
        .filter((e) => {
          if (seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        })
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, limit);
    },
    enabled: authors.length > 0,
    staleTime: 30 * 1000,
  });
}
