import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useFollowing } from './useFollowing';
import { useCurrentUser } from './useCurrentUser';
import type { SidebarList, ListSource } from '@/lib/sidebarLists';
import { nip19 } from 'nostr-tools';
import { useNostrPublish } from './useNostrPublish';

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
/** Extract event IDs from a kind 6300 DVM result event */
function extractDvmEventIds(result: NostrEvent): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    const clean = id.trim();
    if (clean.length === 64 && /^[0-9a-f]+$/i.test(clean) && !seen.has(clean)) {
      seen.add(clean);
      ids.push(clean);
    }
  };
  for (const tag of result.tags) {
    if (tag[0] === 'e' && tag[1]) add(tag[1]);
  }
  if (result.content) {
    try {
      const parsed = JSON.parse(result.content);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'string') add(item);
          if (typeof item === 'object' && item?.id) add(item.id);
        }
      }
    } catch {
      for (const line of result.content.split('\n')) add(line);
    }
  }
  return ids;
}

export function useListFeed(list: SidebarList) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: myFollowing = [] } = useFollowing();
  const { mutateAsync: publish } = useNostrPublish();

  // Pre-fetch DVM results for any DVM sources in this list
  const dvmSources = list.sources.filter((s) => s.type === 'dvm' && s.dvmPubkey);
  const { data: dvmEvents = [] } = useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'list-dvm-results', list.id, dvmSources.map((s) => s.dvmPubkey).join(','), user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (dvmSources.length === 0) return [];
      const abort = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
      const allIds: string[] = [];

      for (const source of dvmSources) {
        const dvmHex = toPubkeyHex(source.dvmPubkey!);
        let requestId: string | undefined;

        // Publish kind 5300 if signed in
        if (user) {
          try {
            const req = await publish({
              kind: 5300,
              content: '',
              tags: [
                ['p', dvmHex],
                ['output', 'application/json'],
                ['param', 'limit', '30'],
              ],
            });
            requestId = req?.id;
          } catch {}
        }

        // Fetch kind 6300 result — prefer response to our request, fallback to any recent
        const filters = requestId
          ? [
              { kinds: [6300], authors: [dvmHex], '#e': [requestId], limit: 1 },
              { kinds: [6300], authors: [dvmHex], limit: 1 },
            ]
          : [{ kinds: [6300], authors: [dvmHex], limit: 1 }];

        const results = await nostr.query(filters, { signal: abort });
        const best = results.sort((a, b) => b.created_at - a.created_at)[0];
        if (best) {
          allIds.push(...extractDvmEventIds(best));
        }
      }

      if (allIds.length === 0) return [];

      // Fetch the actual events
      const chunks: string[][] = [];
      for (let i = 0; i < allIds.length; i += 50) chunks.push(allIds.slice(i, i + 50));
      const fetched = await Promise.all(
        chunks.map((ids) => nostr.query([{ ids, limit: ids.length }], { signal: abort })),
      );
      return fetched.flat();
    },
    enabled: dvmSources.length > 0,
    staleTime: 3 * 60 * 1000,
  });

  return useInfiniteQuery<NostrEvent[]>({
    queryKey: ['nostr', 'list-feed-infinite', list.id, list.sources.map((s) => s.id).join(','), dvmEvents.length],
    queryFn: async ({ pageParam, signal }) => {
      const until = pageParam as number | undefined;
      const abort = AbortSignal.any([signal, AbortSignal.timeout(10000)]);

      const batches = await Promise.allSettled(
        list.sources.map((source) =>
          fetchSource(source, { nostr, myFollowing, user, abort, limit: PAGE_SIZE, until, dvmEvents }),
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
    dvmEvents: NostrEvent[];
  },
): Promise<NostrEvent[]> {
  const { nostr, myFollowing, user, abort, limit, until, dvmEvents } = ctx;

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
        [{ kinds: [1, 6, 20, 30023, 30311], authors: pubkeys, limit, ...timeFilter }],
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
            [{ kinds: [1, 6, 20, 30023, 30311], authors: chunk, limit, ...timeFilter }],
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

    case 'dvm': {
      // DVM events are pre-fetched in the parent hook — just return them
      // (filtered by until cursor for pagination)
      if (dvmEvents.length === 0) return [];
      const filtered = until
        ? dvmEvents.filter((e) => e.created_at < until)
        : dvmEvents;
      return filtered.slice(0, limit);
    }

    case 'rss':
    case 'fediverse':
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
