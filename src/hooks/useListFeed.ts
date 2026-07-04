import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useFollowing } from './useFollowing';
import { useCurrentUser } from './useCurrentUser';
import type { SidebarList, ListSource } from '@/lib/sidebarLists';
import { nip19 } from 'nostr-tools';

/** Decode npub/hex to hex pubkey */
function toPubkeyHex(value: string): string {
  if (value.startsWith('npub1')) {
    try {
      const d = nip19.decode(value);
      if (d.type === 'npub') return d.data;
    } catch {}
  }
  return value;
}

/**
 * Fetches and merges events for all sources in a SidebarList.
 * Falls back to returning [] for source types not yet implemented.
 */
export function useListFeed(list: SidebarList, limit = 50) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: myFollowing = [] } = useFollowing();

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'list-feed', list.id, list.sources.map((s) => s.id).join(',')],
    queryFn: async ({ signal }) => {
      const abort = AbortSignal.any([signal, AbortSignal.timeout(10000)]);

      const batches = await Promise.allSettled(
        list.sources.map((source) => fetchSource(source, { nostr, myFollowing, user, abort, limit })),
      );

      const all: NostrEvent[] = [];
      const seen = new Set<string>();

      for (const result of batches) {
        if (result.status === 'fulfilled') {
          for (const event of result.value) {
            if (!seen.has(event.id)) {
              seen.add(event.id);
              all.push(event);
            }
          }
        }
      }

      return all
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, limit);
    },
    enabled: list.sources.length > 0,
    staleTime: 30 * 1000,
  });
}

async function fetchSource(
  source: ListSource,
  ctx: {
    nostr: ReturnType<typeof useNostr>['nostr'];
    myFollowing: string[];
    user: ReturnType<typeof useCurrentUser>['user'];
    abort: AbortSignal;
    limit: number;
  },
): Promise<NostrEvent[]> {
  const { nostr, myFollowing, user, abort, limit } = ctx;

  switch (source.type) {
    case 'hashtag': {
      if (!source.tag) return [];
      return nostr.query(
        [{ kinds: [1, 30023], '#t': [source.tag], limit }],
        { signal: abort },
      );
    }

    case 'people': {
      const pubkeys = (source.pubkeys ?? []).map(toPubkeyHex).filter(Boolean);
      if (pubkeys.length === 0) return [];
      return nostr.query(
        [{ kinds: [1, 6, 20, 30023], authors: pubkeys, limit }],
        { signal: abort },
      );
    }

    case 'follow-list': {
      // "following" source means use MY own contact list
      const isMyFollowing =
        !source.followListPubkey ||
        source.followListPubkey === user?.pubkey;

      const authors = isMyFollowing
        ? myFollowing
        : await resolveFollowList(nostr, toPubkeyHex(source.followListPubkey!), abort);

      if (authors.length === 0) return [];

      // Batch queries for large follow lists
      const chunks: string[][] = [];
      for (let i = 0; i < authors.length; i += 500) {
        chunks.push(authors.slice(i, i + 500));
      }
      const results = await Promise.all(
        chunks.map((chunk) =>
          nostr.query(
            [{ kinds: [1, 6, 20, 30023], authors: chunk, limit }],
            { signal: abort },
          ),
        ),
      );
      return results.flat();
    }

    case 'community': {
      if (!source.communityId) return [];
      // NIP-72: fetch approved posts (kind 4550) and the posts themselves
      // Also query kind 1111 (NIP-22 community posts)
      const communityAddr = source.communityId;
      return nostr.query(
        [
          { kinds: [1111], '#A': [communityAddr], limit },
          { kinds: [4550], '#a': [communityAddr], limit },
        ],
        { signal: abort },
      );
    }

    case 'group': {
      if (!source.groupId) return [];
      // NIP-29: posts tagged with 'h' = group id
      return nostr.query(
        [{ kinds: [1, 9, 11], '#h': [source.groupId], limit }],
        { signal: abort },
      );
    }

    case 'rss':
    case 'fediverse': {
      // These are fetched client-side via CORS proxy
      if (!source.url) return [];
      // Return empty — these are handled by separate UI in the feed view
      return [];
    }

    case 'dvm': {
      // NIP-90 DVM: for now return empty — full implementation needs request/response flow
      return [];
    }

    default:
      return [];
  }
}

async function resolveFollowList(
  nostr: ReturnType<typeof useNostr>['nostr'],
  pubkey: string,
  signal: AbortSignal,
): Promise<string[]> {
  const [event] = await nostr.query(
    [{ kinds: [3], authors: [pubkey], limit: 1 }],
    { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
  );
  if (!event) return [];
  return event.tags.filter(([t]) => t === 'p').map(([, pk]) => pk).filter(Boolean);
}
