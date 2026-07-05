import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { isRepost } from '@/lib/postUtils';

const PEOPLE_LIMIT = 10;
const PEOPLE_CANDIDATE_LIMIT = 30;
const POST_PAGE_SIZE = 20;

interface ExploreResults {
  people: NostrEvent[];
  posts: NostrEvent[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
}

interface ProfileMeta {
  name: string;
  displayName: string;
  about: string;
  nip05: string;
}

function normalizeTokens(input: string): string[] {
  return input
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function parseProfileMeta(event: NostrEvent): ProfileMeta {
  try {
    const parsed = JSON.parse(event.content) as Record<string, unknown>;
    return {
      name: String(parsed?.name ?? ''),
      displayName: String(parsed?.display_name ?? ''),
      about: String(parsed?.about ?? ''),
      nip05: String(parsed?.nip05 ?? ''),
    };
  } catch {
    return { name: '', displayName: '', about: '', nip05: '' };
  }
}

/** Rank a profile against the user query. Higher is better. */
function scoreProfile(event: NostrEvent, query: string): number {
  const raw = query.trim().toLowerCase();
  if (!raw) return 0;

  const tokens = normalizeTokens(query);
  const meta = parseProfileMeta(event);
  const fields: string[] = [meta.displayName, meta.name, meta.nip05, meta.about];

  let score = 0;

  // Exact / prefix matches on any visible field.
  for (const field of fields) {
    const lower = field.toLowerCase();
    if (lower === raw) score += 100;
    else if (lower.startsWith(raw + '@') || lower.startsWith(raw)) score += 50;
  }

  // Token-level matches.
  for (const token of tokens) {
    for (const field of fields) {
      if (field.toLowerCase().includes(token)) score += 20;
    }
  }

  // Verified NIP-05 gets a small lift.
  if (meta.nip05.length > 0) score += 5;

  return score;
}

/** Rank a note against the user query. Higher is better. */
function scorePost(event: NostrEvent, query: string): number {
  const raw = query.trim().toLowerCase();
  if (!raw) return 0;

  const tokens = normalizeTokens(query);
  const content = event.content.toLowerCase();
  let score = 0;

  // Exact phrase in content.
  if (content.includes(raw)) score += 60;

  // All tokens present together.
  if (tokens.length > 1 && tokens.every((token) => content.includes(token))) {
    score += 40;
  }

  // Per-token hits.
  for (const token of tokens) {
    if (content.includes(token)) score += 10;
  }

  // Hashtag matches are strong signals.
  for (const tag of event.tags) {
    if (tag[0] !== 't') continue;
    const tagValue = (tag[1] ?? '').toLowerCase();
    if (tagValue === raw) score += 50;
    else if (tagValue.includes(raw)) score += 25;

    for (const token of tokens) {
      if (tagValue === token) score += 20;
      else if (tagValue.includes(token)) score += 8;
    }
  }

  // Small recency boost so equally-relevant newer posts float up.
  const ageDays = (Date.now() / 1000 - event.created_at) / 86400;
  if (ageDays < 1) score += 12;
  else if (ageDays < 7) score += 8;
  else if (ageDays < 30) score += 4;

  return score;
}

function rankPeople(events: NostrEvent[], query: string): NostrEvent[] {
  return events
    .map((event) => ({ event, score: scoreProfile(event, query) }))
    .sort((a, b) => b.score - a.score)
    .map(({ event }) => event);
}

function rankPosts(events: NostrEvent[], query: string): NostrEvent[] {
  return events
    .filter((event) => event.content.trim().length > 0 && !isRepost(event))
    .map((event) => ({ event, score: scorePost(event, query) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.event.created_at - a.event.created_at;
    })
    .map(({ event }) => event);
}

export function useExploreSearch(query: string): ExploreResults {
  const { nostr } = useNostr();
  const trimmed = query.trim();
  const enabled = trimmed.length >= 2;

  const peopleQuery = useQuery({
    queryKey: ['nostr', 'explore-people', trimmed],
    queryFn: async ({ signal }) => {
      if (!enabled) return { profiles: [] as NostrEvent[] };

      const abort = AbortSignal.any([signal, AbortSignal.timeout(7000)]);
      const profileEvents = await nostr
        .query([{ kinds: [0], search: trimmed, limit: PEOPLE_CANDIDATE_LIMIT }], { signal: abort })
        .catch(() => [] as NostrEvent[]);

      // Keep the latest metadata per pubkey.
      const profileMap = new Map<string, NostrEvent>();
      for (const event of profileEvents) {
        const existing = profileMap.get(event.pubkey);
        if (!existing || event.created_at > existing.created_at) {
          profileMap.set(event.pubkey, event);
        }
      }

      const ranked = rankPeople(Array.from(profileMap.values()), trimmed);
      return { profiles: ranked.slice(0, PEOPLE_LIMIT) };
    },
    enabled,
    staleTime: 30 * 1000,
  });

  const postsQuery = useInfiniteQuery({
    queryKey: ['nostr', 'explore-posts', trimmed],
    queryFn: async ({ pageParam, signal }): Promise<NostrEvent[]> => {
      if (!enabled) return [];

      const abort = AbortSignal.any([signal, AbortSignal.timeout(9000)]);
      const filter: { kinds: [1]; search: string; limit: number; until?: number } = {
        kinds: [1],
        search: trimmed,
        limit: POST_PAGE_SIZE,
      };
      if (pageParam !== undefined) {
        filter.until = pageParam;
      }

      const noteEvents = await nostr.query([filter], { signal: abort }).catch(() => [] as NostrEvent[]);
      return rankPosts(noteEvents, trimmed).slice(0, POST_PAGE_SIZE);
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < POST_PAGE_SIZE) return undefined;
      const oldest = lastPage[lastPage.length - 1];
      if (!oldest) return undefined;
      return oldest.created_at - 1;
    },
    enabled,
    staleTime: 30 * 1000,
  });

  const posts = useMemo(
    () => postsQuery.data?.pages.flat() ?? [],
    [postsQuery.data],
  );

  return {
    people: peopleQuery.data?.profiles ?? [],
    posts,
    isLoading: (peopleQuery.isLoading || postsQuery.isLoading) && enabled,
    isFetchingNextPage: postsQuery.isFetchingNextPage,
    hasNextPage: postsQuery.hasNextPage && enabled,
    fetchNextPage: postsQuery.fetchNextPage,
  };
}
