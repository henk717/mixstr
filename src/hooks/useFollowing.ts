import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';

/** Returns the list of pubkeys the current user follows (NIP-02 kind 3) */
export function useFollowing() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<string[]>({
    queryKey: ['nostr', 'following', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) return [];
      const [event] = await nostr.query(
        [{ kinds: [3], authors: [user.pubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      if (!event) return [];
      // p tags: ["p", pubkey, relay?, petname?]
      return event.tags.filter(([t]) => t === 'p').map(([, pk]) => pk).filter(Boolean);
    },
    enabled: !!user?.pubkey,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
