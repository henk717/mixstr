import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

interface ExploreResults {
  people: NostrEvent[];
  posts: NostrEvent[];
  isLoading: boolean;
}

export function useExploreSearch(query: string): ExploreResults {
  const { nostr } = useNostr();
  const trimmed = query.trim();

  const { data, isLoading } = useQuery({
    queryKey: ['nostr', 'explore-search', trimmed],
    queryFn: async ({ signal }) => {
      if (!trimmed) return { people: [], posts: [] };

      const abort = AbortSignal.any([signal, AbortSignal.timeout(7000)]);

      // Run both queries in parallel
      const [profileEvents, noteEvents] = await Promise.all([
        // Search profiles (kind 0) — relay-side search by NIP-50
        nostr.query(
          [{ kinds: [0], search: trimmed, limit: 12 }],
          { signal: abort },
        ).catch(() => [] as NostrEvent[]),

        // Search notes (kind 1) — relay-side search by NIP-50
        nostr.query(
          [{ kinds: [1], search: trimmed, limit: 20 }],
          { signal: abort },
        ).catch(() => [] as NostrEvent[]),
      ]);

      // Deduplicate profiles by pubkey (keep latest)
      const profileMap = new Map<string, NostrEvent>();
      for (const ev of profileEvents) {
        const existing = profileMap.get(ev.pubkey);
        if (!existing || ev.created_at > existing.created_at) {
          profileMap.set(ev.pubkey, ev);
        }
      }

      // Filter notes: only non-empty content, not pure reposts
      const filteredPosts = noteEvents
        .filter((ev) => ev.content.trim().length > 0)
        .sort((a, b) => b.created_at - a.created_at);

      return {
        people: Array.from(profileMap.values()).slice(0, 10),
        posts: filteredPosts.slice(0, 20),
      };
    },
    enabled: trimmed.length >= 2,
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  });

  return {
    people: data?.people ?? [],
    posts: data?.posts ?? [],
    isLoading: isLoading && trimmed.length >= 2,
  };
}
