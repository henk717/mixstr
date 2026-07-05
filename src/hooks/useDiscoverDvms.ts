import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

export interface DiscoveredDvm {
  pubkey: string;
  name: string;
  about: string;
  picture?: string;
  event: NostrEvent;
}

/**
 * Discover DVM feed providers on the network via NIP-89 kind 31990 events
 * that advertise support for kind 5300 (feed recommendation requests).
 *
 * Also picks up kind 0 profile metadata for each discovered DVM so we can
 * show a real name and avatar.
 */
export function useDiscoverDvms() {
  const { nostr } = useNostr();

  return useQuery<DiscoveredDvm[]>({
    queryKey: ['nostr', 'discover-dvms'],
    queryFn: async ({ signal }) => {
      const abort = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      // NIP-89: kind 31990 handler announcements with k=5300
      const announcements = await nostr.query(
        [{ kinds: [31990], '#k': ['5300'], limit: 50 }],
        { signal: abort },
      );

      if (announcements.length === 0) return [];

      // Deduplicate by pubkey (keep newest per pubkey)
      const byPubkey = new Map<string, NostrEvent>();
      for (const ev of announcements) {
        const existing = byPubkey.get(ev.pubkey);
        if (!existing || ev.created_at > existing.created_at) {
          byPubkey.set(ev.pubkey, ev);
        }
      }

      const pubkeys = [...byPubkey.keys()];

      // Fetch kind 0 profiles for display
      const profiles = await nostr.query(
        [{ kinds: [0], authors: pubkeys, limit: pubkeys.length }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      const profileMap = new Map<string, { name?: string; about?: string; picture?: string }>();
      for (const ev of profiles) {
        try {
          profileMap.set(ev.pubkey, JSON.parse(ev.content));
        } catch {}
      }

      return pubkeys.map((pubkey) => {
        const announcement = byPubkey.get(pubkey)!;

        // Name can come from profile or the announcement content
        let announcementContent: { name?: string; about?: string; picture?: string } = {};
        try {
          announcementContent = JSON.parse(announcement.content);
        } catch {}

        const profile = profileMap.get(pubkey) ?? {};
        const name =
          announcementContent.name ||
          profile.name ||
          pubkey.slice(0, 12) + '…';
        const about =
          announcementContent.about ||
          profile.about ||
          'DVM feed provider';
        const picture = announcementContent.picture || profile.picture;

        return { pubkey, name, about, picture, event: announcement };
      });
    },
    staleTime: 10 * 60 * 1000,
    enabled: true,
  });
}
