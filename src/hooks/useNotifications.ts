import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from './useCurrentUser';

export function useNotifications() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'notifications', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) return [];
      const events = await nostr.query(
        [
          {
            kinds: [1, 6, 7, 9735],
            '#p': [user.pubkey],
            limit: 50,
          },
        ],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );
      return events.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!user?.pubkey,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useUnreadNotificationCount() {
  const { data } = useNotifications();
  // Simple: treat all as potentially unread (in a real app you'd track last-seen)
  return data?.length ?? 0;
}
