import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { NSchema as n } from '@nostrify/nostrify';
import { useFollowing } from './useFollowing';

export interface FollowingProfile {
  pubkey: string;
  name?: string;
  displayName?: string;
  picture?: string;
  nip05?: string;
}

/**
 * Fetch kind-0 metadata for every pubkey the current user follows.
 * Returns profiles keyed in follow-list order so autocomplete feels stable.
 */
export function useFollowingProfiles() {
  const { nostr } = useNostr();
  const { data: following = [], isLoading: followingLoading } = useFollowing();

  return useQuery<FollowingProfile[]>({
    queryKey: ['nostr', 'following-profiles', following.join(',')],
    queryFn: async ({ signal }) => {
      if (following.length === 0) return [];

      const events = await nostr.query(
        [{ kinds: [0], authors: following }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      const metaByPubkey = new Map<string, Omit<FollowingProfile, 'pubkey'>>();

      for (const event of events) {
        if (metaByPubkey.has(event.pubkey)) continue;
        try {
          const metadata = n.json().pipe(n.metadata()).parse(event.content);
          metaByPubkey.set(event.pubkey, {
            name: metadata.name ?? undefined,
            displayName: metadata.display_name ?? undefined,
            picture: metadata.picture ?? undefined,
            nip05: metadata.nip05 ?? undefined,
          });
        } catch {
          metaByPubkey.set(event.pubkey, {});
        }
      }

      return following
        .map((pubkey) => ({
          pubkey,
          ...metaByPubkey.get(pubkey),
        }))
        .filter((p) => p.name || p.displayName || p.nip05);
    },
    enabled: following.length > 0,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
