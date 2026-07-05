import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

export interface DiscoveredCommunity {
  /** NIP-72 address: 34550:<pubkey>:<d-identifier> */
  address: string;
  pubkey: string;
  identifier: string;
  name: string;
  description?: string;
  image?: string;
  moderators: string[];
  /** Approximate recent activity count (posts + approvals referencing this community). */
  postCount: number;
  event: NostrEvent;
}

/**
 * Discover NIP-72 communities (kind 34550) on the network.
 * Returns the latest community definition per pubkey + d-tag, plus a rough
 * post-count based on recent kind 1111 / 1 / 4550 events that reference the
 * community address.
 */
export function useDiscoverCommunities() {
  const { nostr } = useNostr();

  return useQuery<DiscoveredCommunity[]>({
    queryKey: ['nostr', 'discover-communities'],
    queryFn: async ({ signal }) => {
      const abort = AbortSignal.any([signal, AbortSignal.timeout(12_000)]);

      const events = await nostr.query(
        [{ kinds: [34550], limit: 200 }],
        { signal: abort },
      );

      // Keep the newest definition per community address.
      const byAddress = new Map<string, NostrEvent>();
      for (const event of events) {
        const d = event.tags.find(([t]) => t === 'd')?.[1];
        if (!d) continue;
        const address = `34550:${event.pubkey}:${d}`;
        const existing = byAddress.get(address);
        if (!existing || event.created_at > existing.created_at) {
          byAddress.set(address, event);
        }
      }

      // Count recent posts/approvals that reference each discovered community.
      const since = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
      const postEvents = await nostr.query(
        [{ kinds: [1111, 1, 4550], since, limit: 2000 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) },
      );

      const postCounts = new Map<string, number>();
      for (const event of postEvents) {
        const address = event.tags.find(
          ([t, v]) => (t === 'a' || t === 'A') && v?.startsWith('34550:'),
        )?.[1];
        if (!address || !byAddress.has(address)) continue;
        postCounts.set(address, (postCounts.get(address) ?? 0) + 1);
      }

      return [...byAddress.values()]
        .sort((a, b) => {
          const countDiff = (postCounts.get(`34550:${b.pubkey}:${b.tags.find(([t]) => t === 'd')?.[1] ?? ''}`) ?? 0)
            - (postCounts.get(`34550:${a.pubkey}:${a.tags.find(([t]) => t === 'd')?.[1] ?? ''}`) ?? 0);
          if (countDiff !== 0) return countDiff;
          return b.created_at - a.created_at;
        })
        .map((event) => {
          const d = event.tags.find(([t]) => t === 'd')?.[1] ?? '';
          const name = event.tags.find(([t]) => t === 'name')?.[1];
          const description = event.tags.find(([t]) => t === 'description')?.[1];
          const image = event.tags.find(([t]) => t === 'image')?.[1];
          const moderators = event.tags
            .filter(([t]) => t === 'p')
            .map(([, pk]) => pk)
            .filter(Boolean) as string[];
          const address = `34550:${event.pubkey}:${d}`;

          return {
            address,
            pubkey: event.pubkey,
            identifier: d,
            name: name?.trim() || d,
            description,
            image,
            moderators,
            postCount: postCounts.get(address) ?? 0,
            event,
          };
        });
    },
    staleTime: 5 * 60 * 1000,
  });
}
