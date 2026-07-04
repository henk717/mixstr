import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import type { NostrEvent } from '@nostrify/nostrify';

export interface MuteList {
  /** Muted pubkeys (hex) */
  pubkeys: Set<string>;
  /** Muted keywords (lowercased) */
  keywords: string[];
  /** Muted list addresses ("kind:pubkey:d-tag") — expanded to pubkeys separately */
  lists: string[];
}

function parseMuteEvent(event: NostrEvent | undefined): MuteList {
  if (!event) return { pubkeys: new Set(), keywords: [], lists: [] };
  return {
    pubkeys: new Set(
      event.tags.filter(([t]) => t === 'p').map(([, v]) => v).filter(Boolean),
    ),
    keywords: event.tags.filter(([t]) => t === 'word').map(([, v]) => v.toLowerCase()).filter(Boolean),
    lists: event.tags.filter(([t]) => t === 'a').map(([, v]) => v).filter(Boolean),
  };
}

/**
 * Returns the current user's NIP-51 mute list (kind 10000).
 * Provides helpers to check if an event should be filtered.
 */
export function useMuteList() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  const { data: muteEvent } = useQuery<NostrEvent | null>({
    queryKey: ['nostr', 'mute-list', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) return null;
      const [ev] = await nostr.query(
        [{ kinds: [10000], authors: [user.pubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );
      return ev ?? null;
    },
    enabled: !!user?.pubkey,
    staleTime: 2 * 60 * 1000,
  });

  const muted = parseMuteEvent(muteEvent ?? undefined);

  // Fetch people from subscribed blocklists
  const { data: blockListPubkeys = new Set<string>() } = useQuery<Set<string>>({
    queryKey: ['nostr', 'block-list-people', muted.lists.join(',')],
    queryFn: async ({ signal }) => {
      if (!muted.lists.length) return new Set<string>();
      // Parse "kind:pubkey:d-tag" format
      const filters = muted.lists.map((addr) => {
        const parts = addr.split(':');
        if (parts.length < 2) return null;
        const kind = parseInt(parts[0], 10);
        const pubkey = parts[1];
        const identifier = parts.slice(2).join(':');
        return { kinds: [kind], authors: [pubkey], '#d': [identifier], limit: 1 };
      }).filter(Boolean) as { kinds: number[]; authors: string[]; '#d': string[]; limit: number }[];

      if (!filters.length) return new Set<string>();

      const results = await nostr.query(filters, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });

      const blocked = new Set<string>();
      for (const ev of results) {
        for (const tag of ev.tags) {
          if (tag[0] === 'p' && tag[1]) blocked.add(tag[1]);
        }
      }
      return blocked;
    },
    enabled: muted.lists.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  /** Returns true if the event should be hidden */
  function isMuted(event: NostrEvent): boolean {
    // Muted author
    if (muted.pubkeys.has(event.pubkey)) return true;
    if (blockListPubkeys.has(event.pubkey)) return true;

    // Muted keyword in content
    if (muted.keywords.length > 0) {
      const contentLower = event.content.toLowerCase();
      if (muted.keywords.some((kw) => contentLower.includes(kw))) return true;
    }

    return false;
  }

  return { muted, blockListPubkeys, isMuted };
}
