import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from './useCurrentUser';

/** Parse a community address into its parts. */
function parseCommunityAddr(addr: string): { kind: number; pubkey: string; identifier: string } | null {
  const parts = addr.split(':');
  if (parts.length < 3) return null;
  const kind = parseInt(parts[0], 10);
  const pubkey = parts[1];
  const identifier = parts.slice(2).join(':');
  if (Number.isNaN(kind) || !pubkey || !identifier) return null;
  return { kind, pubkey, identifier };
}

/** Check if a pubkey is a moderator/admin of a community definition event. */
export function isModeratorOf(communityEvent: NostrEvent | undefined, pubkey: string | undefined): boolean {
  if (!communityEvent || !pubkey) return false;
  return communityEvent.tags.some(
    ([t, pk, , role]) =>
      t === 'p' &&
      pk === pubkey &&
      (role === 'moderator' || role === 'admin' || role === undefined),
  );
}

/** Fetches several community definitions at once. */
export function useCommunityMetas(addresses: string[]) {
  const { nostr } = useNostr();

  return useQuery<Map<string, NostrEvent>>({
    queryKey: ['nostr', 'community-metas', addresses.join(',')],
    queryFn: async ({ signal }) => {
      const map = new Map<string, NostrEvent>();
      const filters = addresses
        .map((addr) => {
          const parsed = parseCommunityAddr(addr);
          if (!parsed || parsed.kind !== 34550) return null;
          return {
            kinds: [34550] as number[],
            authors: [parsed.pubkey],
            '#d': [parsed.identifier],
            limit: 1,
          };
        })
        .filter(Boolean) as { kinds: number[]; authors: string[]; '#d': string[]; limit: number }[];

      if (filters.length === 0) return map;

      const events = await nostr.query(filters, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });

      for (const ev of events) {
        const d = ev.tags.find(([t]) => t === 'd')?.[1];
        if (d) {
          map.set(`34550:${ev.pubkey}:${d}`, ev);
        }
      }
      return map;
    },
    enabled: addresses.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/** Fetches community metadata (kind 34550) */
export function useCommunityMeta(communityAddr: string) {
  const { nostr } = useNostr();
  // communityAddr = "34550:<pubkey>:<d-tag>"
  const parts = communityAddr.split(':');
  const pubkey = parts[1];
  const dtag = parts[2];

  return useQuery<NostrEvent | undefined>({
    queryKey: ['nostr', 'community-meta', communityAddr],
    queryFn: async ({ signal }) => {
      if (!pubkey || !dtag) return undefined;
      const [event] = await nostr.query(
        [{ kinds: [34550], authors: [pubkey], '#d': [dtag], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      return event;
    },
    enabled: !!pubkey && !!dtag,
    staleTime: 5 * 60 * 1000,
  });
}

/** Fetches approved posts for a community (kind 4550) */
export function useCommunityFeed(communityAddr: string, limit = 30) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'community-feed', communityAddr, limit],
    queryFn: async ({ signal }) => {
      if (!communityAddr) return [];
      // Fetch approved posts (kind 4550) and NIP-22 kind 1111 posts
      const [approvals, posts] = await Promise.all([
        nostr.query(
          [{ kinds: [4550], '#a': [communityAddr], limit }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
        ),
        nostr.query(
          [{ kinds: [1111], '#A': [communityAddr], limit }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
        ),
      ]);
      // Merge approvals + direct posts, dedup by id
      const seen = new Set<string>();
      return [...approvals, ...posts]
        .filter((e) => {
          if (seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        })
        .sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!communityAddr,
    staleTime: 30 * 1000,
  });
}

/** Fetches pending (unapproved) posts for moderation */
export function useCommunityPending(communityAddr: string, enabled = false) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'community-pending', communityAddr],
    queryFn: async ({ signal }) => {
      if (!communityAddr) return [];
      return nostr.query(
        [{ kinds: [1, 1111], '#a': [communityAddr], limit: 50 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
    },
    enabled: enabled && !!communityAddr,
    staleTime: 30 * 1000,
  });
}

/** Check if current user is a moderator of a community */
export function useIsModerator(communityEvent: NostrEvent | undefined): boolean {
  const { user } = useCurrentUser();
  return isModeratorOf(communityEvent, user?.pubkey);
}
