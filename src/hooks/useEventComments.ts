import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

interface CommentWithScore {
  event: NostrEvent;
  score: number; // reaction count
}

/**
 * Fetches replies to an event plus their reaction counts,
 * returns the top N sorted by popularity.
 */
export function useTopComments(eventId: string, limit = 3, enabled = true) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'top-comments', eventId, limit],
    queryFn: async ({ signal }) => {
      const abort = AbortSignal.any([signal, AbortSignal.timeout(5000)]);

      // Fetch replies (kind 1 with e tag pointing to this event)
      const replies = await nostr.query(
        [{ kinds: [1], '#e': [eventId], limit: 50 }],
        { signal: abort },
      );

      if (replies.length === 0) return [];

      // Fetch reactions to each reply to score them
      const replyIds = replies.map((r) => r.id);
      const reactions = await nostr.query(
        [{ kinds: [7], '#e': replyIds, limit: 200 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) },
      ).catch(() => [] as NostrEvent[]);

      // Count reactions per reply id
      const reactionCounts = new Map<string, number>();
      for (const reaction of reactions) {
        const targetId = reaction.tags.findLast(([t]) => t === 'e')?.[1];
        if (targetId) {
          reactionCounts.set(targetId, (reactionCounts.get(targetId) ?? 0) + 1);
        }
      }

      // Score and sort
      const scored: CommentWithScore[] = replies.map((event) => ({
        event,
        score: reactionCounts.get(event.id) ?? 0,
      }));

      scored.sort((a, b) => {
        // Primary: reaction score desc; secondary: recency desc
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

  return useQuery<number>({
    queryKey: ['nostr', 'reply-count', eventId],
    queryFn: async ({ signal }) => {
      const replies = await nostr.query(
        [{ kinds: [1], '#e': [eventId], limit: 100 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]) },
      );
      return replies.length;
    },
    enabled: enabled && !!eventId,
    staleTime: 2 * 60 * 1000,
  });
}
