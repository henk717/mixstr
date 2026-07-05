import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { fetchDvmFeedEvents, toPubkeyHex } from '@/lib/dvm';
import type { NostrEvent } from '@nostrify/nostrify';

interface UseDvmFeedOptions {
  /** DVM provider pubkey (hex or npub) */
  dvmPubkey: string;
  /** How many results to request */
  limit?: number;
}

interface UseDvmFeedResult {
  events: NostrEvent[];
  isLoading: boolean;
  isRequesting: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetch a curated feed from a NIP-90 DVM (Data Vending Machine).
 *
 * Instead of a single-shot query that returns empty because relays EOSE before
 * the DVM responds, this hooks opens a live subscription to collect kind-6300
 * results for a window of time. It also fetches multiple recent result events
 * (not just the most recent one) and parses both `e` and `a` tag references.
 */
export function useDvmFeed({ dvmPubkey, limit = 30 }: UseDvmFeedOptions): UseDvmFeedResult {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publish } = useNostrPublish();
  const dvmHex = toPubkeyHex(dvmPubkey);

  const {
    data: events = [],
    isLoading,
    error,
    refetch,
  } = useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'dvm-feed', dvmHex, user?.pubkey ?? 'anon', limit],
    queryFn: async ({ signal }) => {
      if (!dvmHex) return [];
      return fetchDvmFeedEvents({
        nostr,
        publish,
        user,
        dvmPubkey,
        limit,
        timeoutMs: 15_000,
        signal,
      });
    },
    enabled: !!dvmHex,
    staleTime: 0,
    retry: 1,
  });

  return {
    events,
    isLoading,
    isRequesting: isLoading,
    error: error ? String(error) : null,
    refetch,
  };
}
