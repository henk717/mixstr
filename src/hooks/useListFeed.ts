import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useFollowing } from './useFollowing';
import { useCurrentUser } from './useCurrentUser';
import type { SidebarList, ListSource } from '@/lib/sidebarLists';
import { nip19 } from 'nostr-tools';

const PAGE_SIZE = 30;

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
 * Infinite-scroll feed for a SidebarList.
 * Uses timestamp-based pagination (until cursor) per Nostr convention.
 */
export function useListFeed(list: SidebarList) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: myFollowing = [] } = useFollowing();

  return useInfiniteQuery<NostrEvent[]>({
    queryKey: ['nostr', 'list-feed-infinite', list.id, list.sources.map((s) => s.id).join(',')],
    queryFn: async ({ pageParam, signal }) => {
      const until = pageParam as number | undefined;
      const abort = AbortSignal.any([signal, AbortSignal.timeout(10000)]);

      const batches = await Promise.allSettled(
        list.sources.map((source) =>
          fetchSource(source, { nostr, myFollowing, user, abort, limit: PAGE_SIZE, until }),
        ),
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
        .slice(0, PAGE_SIZE);
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      // Use oldest event's timestamp minus 1 as next "until" cursor
      return lastPage[lastPage.length - 1].created_at - 1;
    },
    initialPageParam: undefined as number | undefined,
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
    until?: number;
  },
): Promise<NostrEvent[]> {
  const { nostr, myFollowing, user, abort, limit, until } = ctx;

  const timeFilter = until ? { until } : {};

  switch (source.type) {
    case 'hashtag': {
      if (!source.tag) return [];
      return nostr.query(
        [{ kinds: [1, 30023], '#t': [source.tag], limit, ...timeFilter }],
        { signal: abort },
      );
    }

    case 'people': {
      const pubkeys = (source.pubkeys ?? []).map(toPubkeyHex).filter(Boolean);
      if (pubkeys.length === 0) return [];
      return nostr.query(
        [{ kinds: [1, 6, 20, 30023], authors: pubkeys, limit, ...timeFilter }],
        { signal: abort },
      );
    }

    case 'follow-list': {
      const isMyFollowing =
        !source.followListPubkey ||
        source.followListPubkey === user?.pubkey;

      const authors = isMyFollowing
        ? myFollowing
        : await resolveFollowList(nostr, toPubkeyHex(source.followListPubkey!), abort);

      if (authors.length === 0) return [];

      const chunks: string[][] = [];
      for (let i = 0; i < authors.length; i += 500) {
        chunks.push(authors.slice(i, i + 500));
      }
      const results = await Promise.all(
        chunks.map((chunk) =>
          nostr.query(
            [{ kinds: [1, 6, 20, 30023], authors: chunk, limit, ...timeFilter }],
            { signal: abort },
          ),
        ),
      );
      return results.flat();
    }

    case 'community': {
      if (!source.communityId) return [];
      return nostr.query(
        [
          { kinds: [1111], '#A': [source.communityId], limit, ...timeFilter },
          { kinds: [4550], '#a': [source.communityId], limit, ...timeFilter },
        ],
        { signal: abort },
      );
    }

    case 'group': {
      if (!source.groupId) return [];
      return nostr.query(
        [{ kinds: [1, 9, 11], '#h': [source.groupId], limit, ...timeFilter }],
        { signal: abort },
      );
    }

    case 'rss':
    case 'fediverse':
    case 'dvm':
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
