import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { FollowingProfile } from './useFollowingProfiles';

const DEFAULT_AUTHOR_LIMIT = 100;
const LOOKBACK_DAYS = 7;

/**
 * Discover people the user has recently encountered on the network by looking
 * at the authors of recent kind-1 / kind-6 notes, then fetching their kind-0
 * metadata. This complements the follow list with profiles the user may not
 * follow yet but has seen in feeds.
 */
export function useRecentProfiles(limit = DEFAULT_AUTHOR_LIMIT) {
  const { nostr } = useNostr();

  return useQuery<FollowingProfile[]>({
    queryKey: ['nostr', 'recent-profiles', limit],
    queryFn: async ({ signal }) => {
      const abort = AbortSignal.any([signal, AbortSignal.timeout(12_000)]);
      const since = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 24 * 60 * 60;

      // Pull recent notes/reposts from the global feed.
      const events = await nostr.query(
        [{ kinds: [1, 6], limit: 400, since }],
        { signal: abort },
      );

      // Preserve recency order while deduplicating authors.
      const seen = new Set<string>();
      const authors: string[] = [];
      for (const event of events.sort((a, b) => b.created_at - a.created_at)) {
        if (seen.has(event.pubkey)) continue;
        seen.add(event.pubkey);
        authors.push(event.pubkey);
        if (authors.length >= limit) break;
      }

      if (authors.length === 0) return [];

      const metaEvents = await nostr.query(
        [{ kinds: [0], authors, limit: authors.length }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      const metaByPubkey = new Map<string, Partial<FollowingProfile>>();
      for (const event of metaEvents) {
        if (metaByPubkey.has(event.pubkey)) continue;
        try {
          const parsed = JSON.parse(event.content) as Record<string, unknown>;
          metaByPubkey.set(event.pubkey, {
            name: typeof parsed.name === 'string' ? parsed.name : undefined,
            displayName: typeof parsed.display_name === 'string' ? parsed.display_name : undefined,
            picture: typeof parsed.picture === 'string' ? parsed.picture : undefined,
            nip05: typeof parsed.nip05 === 'string' ? parsed.nip05 : undefined,
          });
        } catch {
          metaByPubkey.set(event.pubkey, {});
        }
      }

      return authors.map((pubkey) => ({
        pubkey,
        ...metaByPubkey.get(pubkey),
      }));
    },
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
