import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from './useCurrentUser';
import { useMixstr } from './useMixstr';

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
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      const filtered = events.filter((e) => e.pubkey !== user.pubkey);
      return filtered.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!user?.pubkey,
    staleTime: 15 * 1000,        // consider fresh for 15s
    refetchInterval: 30 * 1000,  // background poll every 30s
    refetchOnWindowFocus: true,   // re-fetch when tab regains focus
  });
}

export function useUnreadNotificationCount() {
  const { data } = useNotifications();
  const { lastNotificationReadAt } = useMixstr();
  
  // Filter notifications that are newer than last read timestamp
  const unreadCount = data?.filter((n) => n.created_at > lastNotificationReadAt).length ?? 0;
  return unreadCount;
}
