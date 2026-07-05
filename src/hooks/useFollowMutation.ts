import { useNostr } from '@nostrify/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';

/**
 * Returns a mutation to follow or unfollow a pubkey.
 * The mutation accepts `{ pubkey, action: 'follow' | 'unfollow' }`.
 *
 * It fetches the current user's contact list (kind 3), adds or removes the
 * given pubkey from the `p` tags, and publishes a new kind 3 event.
 * The local query cache is optimistically updated so the UI reflects the
 * change immediately.
 */
export function useFollowMutation() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pubkey, action }: { pubkey: string; action: 'follow' | 'unfollow' }) => {
      if (!user) throw new Error('Not logged in');

      // Fetch the current contact list
      const [existing] = await nostr.query(
        [{ kinds: [3], authors: [user.pubkey], limit: 1 }],
        { signal: AbortSignal.timeout(8000) },
      );

      // Build the new p-tag list
      let pTags: string[][] = existing
        ? existing.tags.filter(([t]) => t === 'p')
        : [];

      if (action === 'follow') {
        // Only add if not already following
        if (!pTags.some(([, pk]) => pk === pubkey)) {
          pTags = [...pTags, ['p', pubkey]];
        }
      } else {
        pTags = pTags.filter(([, pk]) => pk !== pubkey);
      }

      // Preserve all non-p tags from the existing event (relay hints, etc.)
      const otherTags = existing ? existing.tags.filter(([t]) => t !== 'p') : [];

      const event = await user.signer.signEvent({
        kind: 3,
        content: existing?.content ?? '',
        tags: [...pTags, ...otherTags],
        created_at: Math.floor(Date.now() / 1000),
      });

      await nostr.event(event, { signal: AbortSignal.timeout(8000) });
      return event;
    },

    onMutate: async ({ pubkey, action }) => {
      if (!user) return;

      const queryKey = ['nostr', 'following', user.pubkey];

      // Cancel any in-flight refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot previous value
      const previous = queryClient.getQueryData<string[]>(queryKey);

      // Optimistically update
      queryClient.setQueryData<string[]>(queryKey, (old = []) => {
        if (action === 'follow') {
          return old.includes(pubkey) ? old : [...old, pubkey];
        } else {
          return old.filter((pk) => pk !== pubkey);
        }
      });

      return { previous };
    },

    onError: (_err, { pubkey: _pk }, context) => {
      // Roll back on error
      if (user && context?.previous !== undefined) {
        queryClient.setQueryData(['nostr', 'following', user.pubkey], context.previous);
      }
    },

    onSettled: () => {
      if (user) {
        queryClient.invalidateQueries({ queryKey: ['nostr', 'following', user.pubkey] });
      }
    },
  });
}
