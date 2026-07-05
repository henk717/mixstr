import { useNostr } from '@nostrify/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Adds a pubkey to the current user's NIP-51 mute list (kind 10000).
 * Preserves the existing event's content (e.g. encrypted private items)
 * and public tags while deduplicating p tags.
 */
export function useBlockUser() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publish } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pubkey: string) => {
      if (!user?.pubkey) throw new Error('Not logged in');

      const [existing] = await nostr.query(
        [{ kinds: [10000], authors: [user.pubkey], limit: 1 }],
        { signal: AbortSignal.timeout(5000) },
      );

      const baseTags = existing?.tags ?? [];
      const pubkeys = new Set(
        baseTags.filter(([t]) => t === 'p').map(([, v]) => v).filter(Boolean),
      );
      pubkeys.add(pubkey);

      const otherTags = baseTags.filter(([t]) => t !== 'p');
      const tags: string[][] = [
        ...Array.from(pubkeys).map((pk) => ['p', pk]),
        ...otherTags,
      ];

      await publish({
        kind: 10000,
        content: existing?.content ?? '',
        tags,
      });

      queryClient.invalidateQueries({ queryKey: ['nostr', 'mute-list', user.pubkey] });
    },
  });
}
