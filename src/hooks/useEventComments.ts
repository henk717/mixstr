import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';

interface CommentWithScore {
  event: NostrEvent;
  score: number; // reaction count
}

function uniqueEvents(batches: NostrEvent[][]): NostrEvent[] {
  const seen = new Set<string>();
  const out: NostrEvent[] = [];
  for (const batch of batches) {
    for (const ev of batch) {
      if (!seen.has(ev.id)) {
        seen.add(ev.id);
        out.push(ev);
      }
    }
  }
  return out;
}

async function queryAllReadRelays(
  nostr: ReturnType<typeof useNostr>['nostr'],
  readRelays: string[],
  filter: { kinds: number[]; '#e': string[]; limit: number },
  signal: AbortSignal,
): Promise<NostrEvent[]> {
  if (readRelays.length === 0) {
    return nostr.query([filter], { signal });
  }

  const settled = await Promise.allSettled(
    readRelays.map(async (url) => {
      try {
        const relay = nostr.relay(url);
        return await relay.query([filter], { signal });
      } catch {
        return [];
      }
    }),
  );

  return uniqueEvents(
    settled
      .filter((r): r is PromiseFulfilledResult<NostrEvent[]> => r.status === 'fulfilled')
      .map((r) => r.value),
  );
}

/**
 * Fetches replies to an event plus their reaction counts,
 * returns the top N sorted by popularity.
 *
 * Queries every configured read relay in parallel and merges the results.
 */
export function useTopComments(eventId: string, limit = 3, enabled = true) {
  const { nostr } = useNostr();
  const { config } = useAppContext();

  const readRelays = useMemo(
    () => config.relayMetadata.relays.filter((r) => r.read).map((r) => r.url),
    [config.relayMetadata.relays],
  );

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'top-comments', eventId, limit, readRelays],
    queryFn: async ({ signal }) => {
      const abort = AbortSignal.any([signal, AbortSignal.timeout(3000)]);

      const replies = await queryAllReadRelays(
        nostr,
        readRelays,
        { kinds: [1], '#e': [eventId], limit: 50 },
        abort,
      );

      if (replies.length === 0) return [];

      const replyIds = replies.map((r) => r.id);
      const reactions = await queryAllReadRelays(
        nostr,
        readRelays,
        { kinds: [7], '#e': replyIds, limit: 200 },
        AbortSignal.any([signal, AbortSignal.timeout(2000)]),
      );

      const reactionCounts = new Map<string, number>();
      for (const reaction of reactions) {
        const targetId = reaction.tags.findLast(([t]) => t === 'e')?.[1];
        if (targetId) {
          reactionCounts.set(targetId, (reactionCounts.get(targetId) ?? 0) + 1);
        }
      }

      const scored: CommentWithScore[] = replies.map((event) => ({
        event,
        score: reactionCounts.get(event.id) ?? 0,
      }));

      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.event.created_at - a.event.created_at;
      });

      return scored.slice(0, limit).map((s) => s.event);
    },
    enabled: enabled && !!eventId,
    staleTime: 2 * 60 * 1000,
  });
}

/** Simple reply count */
export function useReplyCount(eventId: string, enabled = true) {
  const { nostr } = useNostr();
  const { config } = useAppContext();

  const readRelays = useMemo(
    () => config.relayMetadata.relays.filter((r) => r.read).map((r) => r.url),
    [config.relayMetadata.relays],
  );

  return useQuery<number>({
    queryKey: ['nostr', 'reply-count', eventId, readRelays],
    queryFn: async ({ signal }) => {
      const abort = AbortSignal.any([signal, AbortSignal.timeout(3000)]);
      const replies = await queryAllReadRelays(
        nostr,
        readRelays,
        { kinds: [1], '#e': [eventId], limit: 100 },
        abort,
      );
      return replies.length;
    },
    enabled: enabled && !!eventId,
    staleTime: 2 * 60 * 1000,
  });
}
