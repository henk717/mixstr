import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Decode npub/hex to hex pubkey.
 */
function toHex(value: string): string {
  if (!value) return '';
  if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();
  try {
    const d = nip19.decode(value);
    if (d.type === 'npub') return d.data;
    if (d.type === 'nprofile') return d.data.pubkey;
  } catch {}
  return value;
}

/**
 * Extract event IDs from a kind 6300 DVM result.
 * Results can be:
 *  - content: JSON array of event IDs ["id1","id2",...]
 *  - e tags: ["e", "<event-id>", "<relay-hint>"]
 *  - content: newline-separated event IDs
 */
function extractEventIds(result: NostrEvent): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  const add = (id: string) => {
    const clean = id.trim();
    if (clean.length === 64 && /^[0-9a-f]+$/i.test(clean) && !seen.has(clean)) {
      seen.add(clean);
      ids.push(clean);
    }
  };

  // Try e tags first
  for (const tag of result.tags) {
    if (tag[0] === 'e' && tag[1]) add(tag[1]);
  }

  // Try content as JSON array
  if (result.content) {
    try {
      const parsed = JSON.parse(result.content);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'string') add(item);
          // Some DVMs return [{id: "...", ...}]
          if (typeof item === 'object' && item?.id) add(item.id);
        }
      }
    } catch {
      // Try newline-separated
      for (const line of result.content.split('\n')) {
        add(line);
      }
    }
  }

  return ids;
}

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
 * Flow:
 * 1. If user is logged in: publish a kind 5300 job request to the DVM.
 * 2. Poll for kind 6300 results from that DVM (either responding to our
 *    request or pre-published results).
 * 3. Extract the recommended event IDs from the result.
 * 4. Fetch those events from relays.
 *
 * If not logged in, we skip the request and just look for any recent
 * kind 6300 results published by that DVM pubkey.
 */
export function useDvmFeed({ dvmPubkey, limit = 30 }: UseDvmFeedOptions): UseDvmFeedResult {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publish } = useNostrPublish();
  const dvmHex = toHex(dvmPubkey);

  // Step 1 + 2: publish request and wait for result
  const {
    data: resultEvent,
    isLoading: isRequesting,
    error: requestError,
    refetch,
  } = useQuery<NostrEvent | null>({
    queryKey: ['nostr', 'dvm-request', dvmHex, user?.pubkey ?? 'anon'],
    queryFn: async ({ signal }) => {
      if (!dvmHex) return null;
      const abort = AbortSignal.any([signal, AbortSignal.timeout(15000)]);

      let requestEventId: string | undefined;

      // Publish kind 5300 if signed in
      if (user) {
        try {
          const req = await publish({
            kind: 5300,
            content: '',
            tags: [
              ['p', dvmHex],
              ['output', 'application/json'],
              ['param', 'limit', String(limit)],
              ['relays', ...getWriteRelays()],
            ],
          });
          requestEventId = req?.id;
        } catch {
          // If publish fails (e.g. no relays), fall through to polling
        }
      }

      // Poll for kind 6300 result from this DVM
      // First try: response to our specific request
      if (requestEventId) {
        const results = await nostr.query(
          [{ kinds: [6300], authors: [dvmHex], '#e': [requestEventId], limit: 1 }],
          { signal: abort },
        );
        if (results.length > 0) {
          return results.sort((a, b) => b.created_at - a.created_at)[0];
        }
      }

      // Fallback: any recent kind 6300 from this DVM
      const anyResults = await nostr.query(
        [{ kinds: [6300], authors: [dvmHex], limit: 1 }],
        { signal: abort },
      );
      if (anyResults.length > 0) {
        return anyResults.sort((a, b) => b.created_at - a.created_at)[0];
      }

      return null;
    },
    enabled: !!dvmHex,
    staleTime: 3 * 60 * 1000,
    retry: 1,
  });

  // Step 3+4: extract event IDs and fetch them
  const eventIds = resultEvent ? extractEventIds(resultEvent) : [];

  const { data: events = [], isLoading: isFetching } = useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'dvm-events', eventIds.join(',')],
    queryFn: async ({ signal }) => {
      if (eventIds.length === 0) return [];
      const abort = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
      // Fetch in chunks of 50
      const chunks: string[][] = [];
      for (let i = 0; i < eventIds.length; i += 50) chunks.push(eventIds.slice(i, i + 50));
      const results = await Promise.all(
        chunks.map((ids) => nostr.query([{ ids, limit: ids.length }], { signal: abort })),
      );
      const all = results.flat();
      // Return in DVM-recommended order
      return eventIds
        .map((id) => all.find((e) => e.id === id))
        .filter((e): e is NostrEvent => !!e);
    },
    enabled: eventIds.length > 0,
    staleTime: 3 * 60 * 1000,
  });

  return {
    events,
    isLoading: isRequesting || isFetching,
    isRequesting,
    error: requestError ? String(requestError) : null,
    refetch,
  };
}

/** Get write relay URLs from localStorage config (best-effort, no hook needed) */
function getWriteRelays(): string[] {
  try {
    const raw = localStorage.getItem('nostr:app-config');
    if (!raw) return [];
    const config = JSON.parse(raw) as { relayMetadata?: { relays?: { url: string; write?: boolean }[] } };
    return (config.relayMetadata?.relays ?? [])
      .filter((r) => r.write !== false)
      .map((r) => r.url)
      .slice(0, 5);
  } catch {
    return [];
  }
}
