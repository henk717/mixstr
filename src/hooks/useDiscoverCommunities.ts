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
  event: NostrEvent;
}

/**
 * Discover NIP-72 communities (kind 34550) on the network.
 * Returns the latest community definition per pubkey + d-tag.
 */
export function useDiscoverCommunities() {
  const { nostr } = useNostr();

  return useQuery<DiscoveredCommunity[]>({
    queryKey: ['nostr', 'discover-communities'],
    queryFn: async ({ signal }) => {
      const abort = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);

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

      return [...byAddress.values()]
        .sort((a, b) => b.created_at - a.created_at)
        .map((event) => {
          const d = event.tags.find(([t]) => t === 'd')?.[1] ?? '';
          const name = event.tags.find(([t]) => t === 'name')?.[1];
          const description = event.tags.find(([t]) => t === 'description')?.[1];
          const image = event.tags.find(([t]) => t === 'image')?.[1];
          const moderators = event.tags
            .filter(([t]) => t === 'p')
            .map(([, pk]) => pk)
            .filter(Boolean) as string[];

          return {
            address: `34550:${event.pubkey}:${d}`,
            pubkey: event.pubkey,
            identifier: d,
            name: name?.trim() || d,
            description,
            image,
            moderators,
            event,
          };
        });
    },
    staleTime: 5 * 60 * 1000,
  });
}
