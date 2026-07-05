import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { fetchEventWithRelays } from '@/lib/queryEvent';

interface UseEventByIdOptions {
  eventId: string;
  pubkey?: string;
  kind?: number;
  relayHints?: string[];
  timeoutMs?: number;
  enabled?: boolean;
  staleTime?: number;
}

/**
 * Fetch a single Nostr event by id, with optional author/kind constraints
 * and relay hints. The pool is always queried, but any provided relay hints
 * are also probed directly and the first successful result wins.
 */
export function useEventById(options: UseEventByIdOptions) {
  const { eventId, pubkey, kind, relayHints, timeoutMs, enabled = true, staleTime = 5 * 60 * 1000 } = options;
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: [
      'nostr',
      'event-by-id',
      eventId,
      pubkey ?? '',
      kind ?? 0,
      ...(relayHints ?? []).slice().sort(),
    ],
    queryFn: async ({ signal }) => {
      if (!eventId) return null;

      let filter;
      if (kind && pubkey) {
        filter = [{ kinds: [kind], authors: [pubkey], '#d': [eventId], limit: 1 }];
      } else if (pubkey) {
        filter = [{ ids: [eventId], authors: [pubkey], limit: 1 }];
      } else {
        filter = [{ ids: [eventId], limit: 1 }];
      }

      const ev = await fetchEventWithRelays(nostr, filter, {
        relayHints,
        timeoutMs: timeoutMs ?? 6000,
        signal,
      });
      return ev ?? null;
    },
    enabled: !!eventId && enabled,
    staleTime,
  });
}
