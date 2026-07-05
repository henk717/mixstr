import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useFollowing } from './useFollowing';
import { useCurrentUser } from './useCurrentUser';
import { useCommunityMetas, isModeratorOf } from './useCommunity';
import type { SidebarList, ListSource } from '@/lib/sidebarLists';
import { nip19 } from 'nostr-tools';
import { useNostrPublish } from './useNostrPublish';
import { isRepost } from '@/lib/postUtils';

const PAGE_SIZE = 30;

function normalizeTokens(input: string): string[] {
  return input
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/** Score a note against a set of keyword tokens. Higher is better. */
function scoreKeywordPost(event: NostrEvent, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const content = event.content.toLowerCase();
  let score = 0;

  // Exact phrase formed by all tokens.
  const phrase = tokens.join(' ');
  if (content.includes(phrase)) score += 60;

  // All tokens present together.
  if (tokens.every((token) => content.includes(token))) score += 40;

  // Per-token hits.
  for (const token of tokens) {
    if (content.includes(token)) score += 10;
  }

  // Hashtag matches are strong signals.
  for (const tag of event.tags) {
    if (tag[0] !== 't') continue;
    const tagValue = (tag[1] ?? '').toLowerCase();
    for (const token of tokens) {
      if (tagValue === token) score += 20;
      else if (tagValue.includes(token)) score += 8;
    }
  }

  // Small recency boost.
  const ageDays = (Date.now() / 1000 - event.created_at) / 86400;
  if (ageDays < 1) score += 12;
  else if (ageDays < 7) score += 8;
  else if (ageDays < 30) score += 4;

  return score;
}

function rankKeywordPosts(events: NostrEvent[], tokens: string[]): NostrEvent[] {
  return events
    .filter((event) => event.content.trim().length > 0 && !isRepost(event))
    .filter((event) => {
      const content = event.content.toLowerCase();
      return tokens.every((token) => content.includes(token));
    })
    .map((event) => ({ event, score: scoreKeywordPost(event, tokens) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.event.created_at - a.event.created_at;
    })
    .map(({ event }) => event);
}

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

  // Pre-fetch community definitions so we can decide whether to include
  // unapproved posts and which approval events to trust.
  const communitySources = list.sources.filter((s) => s.type === 'community' && s.communityId);
  const { data: communityMetas = new Map<string, NostrEvent>() } = useCommunityMetas(
    communitySources.map((s) => s.communityId!),
  );

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
    queryKey: ['nostr', 'list-feed-infinite', list.id, list.sources.map((s) => s.id).join(','), dvmEvents.length, communityMetas],
    queryFn: async ({ pageParam, signal }) => {
      const until = pageParam as number | undefined;
      const abort = AbortSignal.any([signal, AbortSignal.timeout(10000)]);

      const batches = await Promise.allSettled(
        list.sources.map((source) =>
          fetchSource(source, { nostr, myFollowing, user, abort, limit: PAGE_SIZE, until, dvmEvents, communityMetas }),
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
    communityMetas: Map<string, NostrEvent>;
  },
): Promise<NostrEvent[]> {
  const { nostr, myFollowing, user, abort, limit, until, dvmEvents, communityMetas } = ctx;

  const timeFilter = until ? { until } : {};

  switch (source.type) {
    case 'hashtag': {
      if (!source.tag) return [];
      return nostr.query(
        [{ kinds: [1, 30023], '#t': [source.tag], limit, ...timeFilter }],
        { signal: abort },
      );
    }

    case 'keyword': {
      const keywords = source.keywords ?? [];
      if (keywords.length === 0) return [];
      const search = keywords.join(' ');
      const events = await nostr.query(
        [{ kinds: [1, 30023], search, limit: limit * 2, ...timeFilter }],
        { signal: abort },
      );
      return rankKeywordPosts(events, keywords).slice(0, limit);
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

      const communityEvent = communityMetas.get(source.communityId);
      const isModerator = isModeratorOf(communityEvent, user?.pubkey);
      const showUnapproved = isModerator || source.showUnapproved;

      const [approvals, candidates] = await Promise.all([
        nostr.query(
          [{ kinds: [4550], '#a': [source.communityId], limit, ...timeFilter }],
          { signal: abort },
        ),
        nostr.query(
          [
            { kinds: [1, 1111], '#a': [source.communityId], limit, ...timeFilter },
            { kinds: [1111], '#A': [source.communityId], limit, ...timeFilter },
          ],
          { signal: abort },
        ),
      ]);

      // Build the set of approved post identifiers. Approval events reference
      // the approved post via an `e` tag and/or an `a` tag, and also embed the
      // full original event in their content.
      const approvedIds = new Set<string>();
      for (const approval of approvals) {
        for (const tag of approval.tags) {
          if ((tag[0] === 'e' || tag[0] === 'a' || tag[0] === 'A') && tag[1]) {
            approvedIds.add(tag[1]);
          }
        }
        try {
          const parsed = JSON.parse(approval.content) as { id?: string };
          if (parsed?.id) approvedIds.add(parsed.id);
        } catch {
          // ignore malformed embedded event
        }
      }

      const isApproved = (event: NostrEvent) =>
        event.kind === 1111 || approvedIds.has(event.id);

      const result: NostrEvent[] = [...approvals];
      const seen = new Set(result.map((e) => e.id));
      for (const candidate of candidates) {
        if (seen.has(candidate.id)) continue;
        if (showUnapproved || isApproved(candidate)) {
          result.push(candidate);
          seen.add(candidate.id);
        }
      }
      return result;
    }

    case 'group': {
      if (!source.groupId) return [];
      return nostr.query(
        [{ kinds: [1, 9, 11], '#h': [source.groupId], limit, ...timeFilter }],
        { signal: abort },
      );
    }

    case 'livestream': {
      // kind:30311 NIP-53 live streams.
      // Addressable events — the relay only stores the latest per pubkey+d, so
      // timestamp-based pagination (until) is meaningless and must be skipped.
      // Always query for all statuses and filter client-side so upcoming/ended
      // streams can also surface; the FeedView "pin live to top" feature handles ordering.
      const pubkeys = (source.pubkeys ?? []).map(toPubkeyHex).filter(Boolean);
      if (pubkeys.length > 0) {
        // Specific authors requested
        return nostr.query(
          [{ kinds: [30311], authors: pubkeys, limit: limit * 2 }],
          { signal: abort },
        );
      }
      // No author filter — fetch broadly. Query both live and recent ended to
      // populate the feed; FeedView pins live ones to top when that option is on.
      return nostr.query(
        [{ kinds: [30311], '#status': ['live'], limit }],
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

    case 'relay': {
      // Single-relay feed — route through the pool's managed connection for
      // this URL so we get the same EOSE timeout / retry behavior as the main
      // following feed. Creating a fresh NRelay1 per page was cold-starting
      // the socket and causing very small, inconsistent result sets, which
      // broke infinite scroll.
      if (!source.relayUrl) return [];
      const relay = nostr.relay(source.relayUrl);
      return await relay.query(
        [{ kinds: [1, 6, 20, 30023], limit, ...timeFilter }],
        { signal: AbortSignal.any([abort, AbortSignal.timeout(15_000)]) },
      );
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
