import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useMuteList } from './useMuteList';
import type { NostrEvent } from '@nostrify/nostrify';

export interface DecryptedMessage {
  /** ID of the gift wrap that contained this message */
  wrapId: string;
  /** The inner rumor (kind 14) */
  rumor: NostrEvent;
  /** Conversation peer pubkey */
  peerPubkey: string;
  /** Whether this message was sent by us */
  isSent: boolean;
}

export interface Conversation {
  peerPubkey: string;
  messages: DecryptedMessage[];
  lastMessage: DecryptedMessage;
  unread: number;
}

/**
 * DM deletion state: maps peerPubkey → unix timestamp of the deletion.
 * All messages from that peer with created_at <= timestamp are hidden.
 * Stored encrypted as a kind:30078 addressable event (NIP-78) so it syncs across devices.
 */
export type DmDeletions = Record<string, number>;

const DM_DELETIONS_D_TAG = 'mixstr-dm-deletions';

// ─── Deletion state (synced via NIP-78 encrypted to self) ────────────────────

export function useDmDeletions() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<DmDeletions>({
    queryKey: ['nostr', 'dm-deletions', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey || !user.signer.nip44) return {};

      const [ev] = await nostr.query(
        [{ kinds: [30078], authors: [user.pubkey], '#d': [DM_DELETIONS_D_TAG], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );

      if (!ev?.content) return {};

      try {
        // Encrypted to self: decrypt using our own pubkey as peer
        const plain = await user.signer.nip44.decrypt(user.pubkey, ev.content);
        return JSON.parse(plain) as DmDeletions;
      } catch {
        return {};
      }
    },
    enabled: !!user?.pubkey && !!user.signer.nip44,
    staleTime: 60 * 1000,
  });
}

export function useDeleteConversation() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ peerPubkey, deletedAt }: { peerPubkey: string; deletedAt: number }) => {
      if (!user || !user.signer.nip44) throw new Error('Not logged in or NIP-44 unavailable');

      // Load existing deletions from cache
      const existing: DmDeletions =
        queryClient.getQueryData(['nostr', 'dm-deletions', user.pubkey]) ?? {};

      const updated: DmDeletions = { ...existing, [peerPubkey]: deletedAt };

      // Encrypt to self
      const plain = JSON.stringify(updated);
      const ciphertext = await user.signer.nip44.encrypt(user.pubkey, plain);

      const event = await user.signer.signEvent({
        kind: 30078,
        content: ciphertext,
        tags: [
          ['d', DM_DELETIONS_D_TAG],
          ['alt', 'Mixstr DM deletion timestamps'],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });

      await nostr.event(event, { signal: AbortSignal.timeout(5000) });

      // Optimistic update
      queryClient.setQueryData(['nostr', 'dm-deletions', user.pubkey], updated);

      return updated;
    },
  });
}

// ─── Message fetching ─────────────────────────────────────────────────────────

/**
 * Fetches and decrypts NIP-17 DMs (kind 1059 gift wraps) for the current user.
 * Returns a flat list of decrypted messages sorted newest-first.
 */
export function useDirectMessages() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<DecryptedMessage[]>({
    queryKey: ['nostr', 'dms', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) return [];
      if (!user.signer.nip44) return [];

      const abort = AbortSignal.any([signal, AbortSignal.timeout(10000)]);

      // Fetch gift wraps addressed to us
      const wraps = await nostr.query(
        [{ kinds: [1059], '#p': [user.pubkey], limit: 200 }],
        { signal: abort },
      );

      const messages: DecryptedMessage[] = [];

      for (const wrap of wraps) {
        try {
          const sealJson = await user.signer.nip44.decrypt(wrap.pubkey, wrap.content);
          const seal: NostrEvent = JSON.parse(sealJson);
          if (seal.kind !== 13) continue;

          const rumorJson = await user.signer.nip44.decrypt(seal.pubkey, seal.content);
          const rumor: NostrEvent = JSON.parse(rumorJson);

          // Anti-spoofing: rumor pubkey must match seal pubkey
          if (rumor.pubkey !== seal.pubkey) continue;

          // Only handle kind 14 chat messages
          if (rumor.kind !== 14) continue;

          // Determine the peer
          const isSent = rumor.pubkey === user.pubkey;
          let peerPubkey: string;
          if (isSent) {
            const pTag = rumor.tags.find(([t]) => t === 'p');
            if (!pTag?.[1]) continue;
            peerPubkey = pTag[1];
          } else {
            peerPubkey = rumor.pubkey;
          }

          messages.push({ wrapId: wrap.id, rumor, peerPubkey, isSent });
        } catch {
          // Decryption failures are expected for old-format wraps; skip silently
        }
      }

      return messages.sort((a, b) => b.rumor.created_at - a.rumor.created_at);
    },
    enabled: !!user?.pubkey && !!user.signer.nip44,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

/**
 * Groups decrypted messages into conversations by peer, applying:
 * - Block filtering: skips messages from muted pubkeys
 * - Deletion filtering: hides messages from peers up to their deletion timestamp,
 *   but shows messages received *after* that timestamp (re-opened conversations)
 */
export function groupIntoConversations(
  messages: DecryptedMessage[],
  deletions: DmDeletions,
  mutedPubkeys: Set<string>,
): Conversation[] {
  const byPeer = new Map<string, DecryptedMessage[]>();

  for (const msg of messages) {
    // Skip blocked senders
    if (mutedPubkeys.has(msg.peerPubkey)) continue;

    // Skip messages hidden by deletion (at or before deletion timestamp)
    const deletedAt = deletions[msg.peerPubkey];
    if (deletedAt !== undefined && msg.rumor.created_at <= deletedAt) continue;

    const list = byPeer.get(msg.peerPubkey) ?? [];
    list.push(msg);
    byPeer.set(msg.peerPubkey, list);
  }

  return Array.from(byPeer.entries())
    .map(([peerPubkey, msgs]) => {
      const sorted = [...msgs].sort((a, b) => a.rumor.created_at - b.rumor.created_at);
      return {
        peerPubkey,
        messages: sorted,
        lastMessage: sorted[sorted.length - 1],
        unread: 0,
      };
    })
    .sort((a, b) => b.lastMessage.rumor.created_at - a.lastMessage.rumor.created_at);
}

// ─── Sending ──────────────────────────────────────────────────────────────────

/**
 * Hook to send a NIP-17 DM to a recipient pubkey.
 */
export function useSendDm() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  async function send(recipientPubkey: string, content: string): Promise<void> {
    if (!user) throw new Error('Not logged in');
    if (!user.signer.nip44) throw new Error('Signer does not support NIP-44');

    const now = Math.floor(Date.now() / 1000);

    // Build the rumor (kind 14, unsigned)
    const rumor = {
      kind: 14,
      pubkey: user.pubkey,
      created_at: now,
      tags: [['p', recipientPubkey]],
      content,
    };

    // Helper: create a gift wrap for one recipient
    async function makeWrap(receiverPubkey: string): Promise<NostrEvent> {
      const sealContent = await user!.signer.nip44!.encrypt(
        receiverPubkey,
        JSON.stringify(rumor),
      );
      const seal = await user!.signer.signEvent({
        kind: 13,
        content: sealContent,
        tags: [],
        created_at: now - Math.floor(Math.random() * 172800),
      });

      const wrapContent = await user!.signer.nip44!.encrypt(
        receiverPubkey,
        JSON.stringify(seal),
      );
      return user!.signer.signEvent({
        kind: 1059,
        content: wrapContent,
        tags: [['p', receiverPubkey]],
        created_at: now - Math.floor(Math.random() * 172800),
      });
    }

    // Publish to recipient and to self (so sent messages are readable)
    const [wrapForRecipient, wrapForSelf] = await Promise.all([
      makeWrap(recipientPubkey),
      makeWrap(user.pubkey),
    ]);

    await Promise.all([
      nostr.event(wrapForRecipient, { signal: AbortSignal.timeout(5000) }),
      nostr.event(wrapForSelf, { signal: AbortSignal.timeout(5000) }),
    ]);

    queryClient.invalidateQueries({ queryKey: ['nostr', 'dms', user.pubkey] });
  }

  return { send };
}
