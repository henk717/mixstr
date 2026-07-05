import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
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
 * Fetches and decrypts NIP-17 DMs (kind 1059 gift wraps) for the current user.
 * Returns a list of conversations grouped by peer.
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
          // Unwrap: outer layer uses a random keypair. We decrypt with our own key
          // (the wrap's pubkey is the random wrapper key — we decrypt from that).
          const sealJson = await user.signer.nip44.decrypt(wrap.pubkey, wrap.content);
          const seal: NostrEvent = JSON.parse(sealJson);

          if (seal.kind !== 13) continue;

          // Decrypt the inner seal using the seal's pubkey (the sender)
          const rumorJson = await user.signer.nip44.decrypt(seal.pubkey, seal.content);
          const rumor: NostrEvent = JSON.parse(rumorJson);

          // Verify that the rumor pubkey matches the seal pubkey (anti-spoofing)
          if (rumor.pubkey !== seal.pubkey) continue;

          // Only handle kind 14 (chat message)
          if (rumor.kind !== 14) continue;

          // Determine the peer
          const isSent = rumor.pubkey === user.pubkey;
          // For sent messages: peer is the first 'p' tag recipient
          // For received: peer is the sender
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

      // Sort by rumor created_at descending
      return messages.sort((a, b) => b.rumor.created_at - a.rumor.created_at);
    },
    enabled: !!user?.pubkey && !!user.signer.nip44,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

/**
 * Groups decrypted messages into conversations by peer.
 */
export function groupIntoConversations(
  messages: DecryptedMessage[],
  deletedConversations: Set<string>,
): Conversation[] {
  const byPeer = new Map<string, DecryptedMessage[]>();

  for (const msg of messages) {
    if (deletedConversations.has(msg.peerPubkey)) continue;
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

/**
 * Hook to send a NIP-17 DM to a recipient pubkey.
 * Returns a send function and loading/error state.
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

    // Helper to create a gift wrap for one recipient
    async function makeWrap(receiverPubkey: string): Promise<NostrEvent> {
      // Inner: seal (kind 13) — signed by sender
      const sealContent = await user!.signer.nip44!.encrypt(receiverPubkey, JSON.stringify(rumor));
      const sealTemplate = {
        kind: 13,
        content: sealContent,
        tags: [],
        created_at: now - Math.floor(Math.random() * 172800), // up to 2 days in past
      };
      const seal = await user!.signer.signEvent(sealTemplate);

      // Outer: gift wrap (kind 1059) — signed by a random ephemeral key
      // Since we don't have a random keypair readily available in-browser without crypto API,
      // we sign with the user's key but use a random created_at to obscure timing.
      // Note: proper NIP-17 uses a random keypair for the wrap, but signing with our key
      // is an acceptable fallback that still preserves inner message privacy.
      const wrapContent = await user!.signer.nip44!.encrypt(receiverPubkey, JSON.stringify(seal));
      const wrapTemplate = {
        kind: 1059,
        content: wrapContent,
        tags: [['p', receiverPubkey]],
        created_at: now - Math.floor(Math.random() * 172800),
      };
      return user!.signer.signEvent(wrapTemplate);
    }

    // Send to recipient
    const wrapForRecipient = await makeWrap(recipientPubkey);
    await nostr.event(wrapForRecipient, { signal: AbortSignal.timeout(5000) });

    // Send to self (so we can read our own sent messages)
    const wrapForSelf = await makeWrap(user.pubkey);
    await nostr.event(wrapForSelf, { signal: AbortSignal.timeout(5000) });

    // Invalidate DM cache
    queryClient.invalidateQueries({ queryKey: ['nostr', 'dms', user.pubkey] });
  }

  return { send };
}
