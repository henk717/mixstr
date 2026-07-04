import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

/** Fetches NIP-65 relay lists (kind 10002) for a set of pubkeys (outbox model) */
export function useOutboxRelays(pubkeys: string[]) {
  const { nostr } = useNostr();

  return useQuery<Record<string, { read: string[]; write: string[] }>>({
    queryKey: ['nostr', 'outbox-relays', pubkeys.slice().sort().join(',')],
    queryFn: async ({ signal }) => {
      if (pubkeys.length === 0) return {};
      const events = await nostr.query(
        [{ kinds: [10002], authors: pubkeys, limit: pubkeys.length }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      const result: Record<string, { read: string[]; write: string[] }> = {};
      for (const event of events) {
        const read: string[] = [];
        const write: string[] = [];
        for (const tag of event.tags) {
          if (tag[0] === 'r') {
            const url = tag[1];
            const mode = tag[2];
            if (!mode || mode === 'read') read.push(url);
            if (!mode || mode === 'write') write.push(url);
          }
        }
        result[event.pubkey] = { read, write };
      }
      return result;
    },
    enabled: pubkeys.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
