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
 * Returns undefined while loading, null if not found, or the event.
 */
export function useParentEvent(parentRef: ParentRef | null) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: ['nostr', 'parent-event', parentRef?.id ?? ''],
    queryFn: async ({ signal }) => {
      if (!parentRef?.id) return null;
      const filter = parentRef.author
        ? [{ ids: [parentRef.id], authors: [parentRef.author], limit: 1 }]
        : [{ ids: [parentRef.id], limit: 1 }];
      const [ev] = await nostr.query(filter, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
      });
      return ev ?? null;
    },
    enabled: !!parentRef?.id,
    staleTime: 5 * 60 * 1000,
  });
}
