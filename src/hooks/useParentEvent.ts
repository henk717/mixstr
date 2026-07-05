import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

interface ParentRef {
  id: string;
  relay?: string;
  author?: string;
}

/**
 * Fetch the parent event of a reply.
 *
 * Strategy: first try with the author hint (fast path). If that returns
 * nothing — either because the author hint was wrong or the relay doesn't
 * have it — fall back to a broad id-only query. This handles the common
 * case where the e-tag author hint is missing or incorrect.
 *
 * Returns undefined while loading, null if not found, or the event.
 */
export function useParentEvent(parentRef: ParentRef | null) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: ['nostr', 'parent-event', parentRef?.id ?? ''],
    queryFn: async ({ signal }) => {
      if (!parentRef?.id) return null;

      const abort = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);

      // First attempt: use author hint if available (narrower, faster)
      if (parentRef.author) {
        const [ev] = await nostr.query(
          [{ ids: [parentRef.id], authors: [parentRef.author], limit: 1 }],
          { signal: abort },
        );
        if (ev) return ev;
      }

      // Fallback: broad query without author constraint
      const [ev] = await nostr.query(
        [{ ids: [parentRef.id], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) },
      );
      return ev ?? null;
    },
    enabled: !!parentRef?.id,
    staleTime: 5 * 60 * 1000,
    // Retry twice with a short backoff — relays sometimes need a moment
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
}
