import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

/**
 * Returns the list of pubkeys that `pubkey` follows (kind 3 contact list).
 * Unlike `useFollowing` (which fetches the *current user's* contacts),
 * this hook works for any arbitrary pubkey.
 */
export function useProfileFollowing(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<string[]>({
    queryKey: ['nostr', 'profile-following', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) return [];
      const [event] = await nostr.query(
        [{ kinds: [3], authors: [pubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      if (!event) return [];
      return event.tags
        .filter(([t]) => t === 'p')
        .map(([, pk]) => pk)
        .filter(Boolean);
    },
    enabled: !!pubkey,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
